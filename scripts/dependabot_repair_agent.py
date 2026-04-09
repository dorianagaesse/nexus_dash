#!/usr/bin/env python3
"""Scheduled Dependabot repair support for TASK-116."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("GITHUB_WORKSPACE") or Path(__file__).resolve().parents[1]).resolve()
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
MARKER_PREFIX = "<!-- dependabot-repair-agent:"
DEPENDABOT_LOGINS = {"app/dependabot", "dependabot[bot]"}
MAX_SCAN_LIMIT = 5
REQUIRED_CHECK_NAMES = {
    "check-name",
    "Quality Core (lint, test, coverage, build)",
    "E2E Smoke (Playwright)",
    "Container Image (build + metadata artifact)",
}
MAX_REPLACEMENT_SUMMARY_CHARS = 2500
MAX_CHANGED_FILES_IN_BODY = 10
WORKFLOW_DISPATCH_TARGETS = (
    ("check-branch-names.yml", "Check Branch Name"),
    ("quality-gates.yml", "Quality Gates"),
)
WORKFLOW_DISPATCH_POLL_SECONDS = 45
WORKFLOW_DISPATCH_POLL_INTERVAL_SECONDS = 3


def run(
    args: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd or ROOT),
        check=check,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=capture_output,
    )


def gh_json(args: list[str]) -> Any:
    return json.loads(run(["gh", *args]).stdout)


def gh(*args: str, check: bool = True) -> str:
    return run(["gh", *args], check=check).stdout


def git(*args: str, check: bool = True) -> str:
    return run(["git", *args], check=check).stdout


def is_dependabot_pr(pr: dict[str, Any]) -> bool:
    author = pr.get("author") or {}
    return (
        pr.get("headRefName", "").startswith("dependabot/")
        and author.get("login") in DEPENDABOT_LOGINS
        and not pr.get("isDraft", False)
        and pr.get("state", "OPEN") == "OPEN"
    )


def label_names(pr: dict[str, Any]) -> set[str]:
    return {label["name"] for label in pr.get("labels", [])}


def pr_has_failure(pr: dict[str, Any]) -> bool:
    latest_checks: dict[str, dict[str, Any]] = {}
    latest_keys: dict[str, str] = {}

    for check_run in pr.get("statusCheckRollup") or []:
        name = check_run.get("name") or ""
        if name not in REQUIRED_CHECK_NAMES:
            continue

        sort_key = (
            check_run.get("completedAt")
            or check_run.get("startedAt")
            or check_run.get("detailsUrl")
            or ""
        )
        if name not in latest_keys or sort_key > latest_keys[name]:
            latest_keys[name] = sort_key
            latest_checks[name] = check_run

    return any(
        check_run.get("status") == "COMPLETED"
        and check_run.get("conclusion") not in {"SUCCESS", "NEUTRAL", "SKIPPED", None, ""}
        for check_run in latest_checks.values()
    )


def get_comments(pr_number: int) -> list[dict[str, Any]]:
    return gh_json(["pr", "view", str(pr_number), "--json", "comments"])["comments"]


def has_marker(pr_number: int, marker: str) -> bool:
    return any(marker in (comment.get("body") or "") for comment in get_comments(pr_number))


def replacement_branch_name(pr_number: int, head_sha: str) -> str:
    return f"chore/task-116-repair-pr-{pr_number}-{head_sha[:7]}"


def existing_replacement_pr(branch_name: str, *, state: str = "open") -> dict[str, Any] | None:
    prs = gh_json(["pr", "list", "--state", state, "--head", branch_name, "--json", "number,url,state,mergedAt"])
    return prs[0] if prs else None


def replacement_pr_prefix(pr_number: int, head_sha: str) -> str:
    return f"chore/task-116-repair-pr-{pr_number}-{head_sha[:7]}"


def existing_replacement_pr_for_source(
    pr_number: int,
    head_sha: str,
    *,
    state: str = "open",
) -> dict[str, Any] | None:
    prefix = replacement_pr_prefix(pr_number, head_sha)
    prs = gh_json(
        [
            "pr",
            "list",
            "--state",
            state,
            "--base",
            "main",
            "--json",
            "number,url,state,mergedAt,headRefName",
        ]
    )
    matches = [pr for pr in prs if str(pr.get("headRefName") or "").startswith(prefix)]
    matches.sort(key=lambda pr: int(pr["number"]))
    return matches[0] if matches else None


def remote_branch_exists(branch_name: str) -> bool:
    completed = run(
        ["git", "ls-remote", "--exit-code", "--heads", "origin", branch_name],
        check=False,
    )
    return completed.returncode == 0


def next_replacement_branch_name(pr_number: int, head_sha: str) -> str:
    prefix = replacement_pr_prefix(pr_number, head_sha)
    attempt = 2
    while True:
        candidate = f"{prefix}-r{attempt}"
        if existing_replacement_pr(candidate, state="all") or remote_branch_exists(candidate):
            attempt += 1
            continue
        return candidate


def fetch_pr(pr_number: int) -> dict[str, Any]:
    return gh_json(
        [
            "pr",
            "view",
            str(pr_number),
            "--json",
            "number,title,headRefName,headRefOid,labels,statusCheckRollup,url,author,isDraft,state",
        ]
    )


def extract_run_id(pr: dict[str, Any]) -> str | None:
    for check_run in pr.get("statusCheckRollup") or []:
        if check_run.get("status") != "COMPLETED":
            continue
        if check_run.get("conclusion") in {"SUCCESS", "NEUTRAL", "SKIPPED", None, ""}:
            continue
        details_url = check_run.get("detailsUrl") or ""
        match = re.search(r"/actions/runs/(\d+)", details_url)
        if match:
            return match.group(1)
    return None


def fetch_failed_log(pr: dict[str, Any]) -> str:
    run_id = extract_run_id(pr)
    if not run_id:
        return ""
    completed = run(["gh", "run", "view", run_id, "--log-failed"], check=False)
    return completed.stdout or completed.stderr


def comment(pr_number: int, body: str) -> None:
    gh("pr", "comment", str(pr_number), "--body", body)


def clipped_text(text: str, limit: int) -> str:
    normalized = text.strip()
    if len(normalized) <= limit:
        return normalized
    ellipsis = "..."
    if limit <= len(ellipsis):
        return normalized[:limit]
    return normalized[: limit - len(ellipsis)].rstrip() + ellipsis


def changed_files_against_main() -> list[str]:
    output = git("diff", "--name-only", "origin/main...HEAD").strip()
    return [line.strip() for line in output.splitlines() if line.strip()]


def diff_shortstat_against_main() -> str:
    return git("diff", "--shortstat", "origin/main...HEAD").strip()


def load_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "decision": "defer",
            "summary": (
                "The Copilot repair lane did not produce a machine-readable result. "
                "Leaving this Dependabot PR open for manual review."
            ),
            "validation": [],
        }

    return json.loads(path.read_text(encoding="utf-8"))


def working_tree_has_changes() -> bool:
    return bool(run(["git", "status", "--short"], capture_output=True).stdout.strip())


def current_head_commit() -> str:
    return git("rev-parse", "HEAD").strip()


def scan_targets(
    limit: int,
    specific_pr: int | None = None,
    *,
    force: bool = False,
) -> list[dict[str, Any]]:
    if specific_pr is not None:
        prs = [fetch_pr(specific_pr)]
    else:
        prs = gh_json(
            [
                "pr",
                "list",
                "--state",
                "open",
                "--search",
                "head:dependabot/",
                "--json",
                "number,title,headRefName,headRefOid,labels,statusCheckRollup,url,author,isDraft,state",
            ]
        )

    targets: list[dict[str, Any]] = []
    for pr in prs:
        if not is_dependabot_pr(pr):
            continue

        labels = label_names(pr)
        if "dependabot:auto-merge" in labels:
            continue

        if "dependabot:manual-review" not in labels and specific_pr is None:
            continue

        if not pr_has_failure(pr):
            continue

        marker = f"{MARKER_PREFIX}pr-{pr['number']}:{pr['headRefOid']} -->"
        branch_name = replacement_branch_name(pr["number"], pr["headRefOid"])
        if existing_replacement_pr_for_source(pr["number"], pr["headRefOid"]):
            continue

        if not force and has_marker(pr["number"], marker):
            continue

        targets.append(
            {
                "number": pr["number"],
                "title": pr["title"],
                "url": pr["url"],
                "head_ref": pr["headRefName"],
                "head_sha": pr["headRefOid"],
                "replacement_branch": branch_name,
                "marker": marker,
            }
        )

    targets.sort(key=lambda item: item["number"])
    return targets[:limit]


def write_output(path: Path | None, payload: Any) -> None:
    content = json.dumps(payload, indent=2)
    if path:
        path.write_text(content, encoding="utf-8")
    else:
        print(content)


def validated_limit(limit: int) -> int:
    if 1 <= limit <= MAX_SCAN_LIMIT:
        return limit

    raise ValueError(
        f"--limit must be between 1 and {MAX_SCAN_LIMIT} so the repair lane stays bounded."
    )


def prompt_text(pr: dict[str, Any], result_path: Path, log_path: Path) -> str:
    return "\n".join(
        [
            "You are the NexusDash Dependabot repair agent.",
            "",
            "Task boundaries:",
            f"- Work only on Dependabot PR #{pr['number']}: {pr['title']}",
            f"- The current branch already contains the Dependabot update from `{pr['head_ref']}`.",
            f"- Original PR URL: {pr['url']}",
            "- Preserve the dependency intent. Do not revert or replace the upgrade unless the only safe outcome is to defer and explain why.",
            "- Prefer the smallest compatibility fix that makes the update viable.",
            "- Do not create or merge a PR yourself. Do not push. Do not close any PR.",
            "",
            "Required work:",
            "- Inspect the failing update in the current branch.",
            f"- Use the failed-check log at `{log_path}` as a starting point.",
            "- Decide whether the update is worth pursuing now.",
            "- If it is worth pursuing now, make the necessary code/config/test fixes on the current branch and run the smallest relevant validation commands.",
            "- If it is not worth pursuing now, do not make speculative changes.",
            "",
            "Before finishing, write a JSON result file at:",
            f"- `{result_path}`",
            "",
            "The JSON must use this exact shape:",
            '{',
            '  "decision": "fixed" | "defer",',
            '  "summary": "short markdown-ready summary for maintainers",',
            '  "validation": ["command 1", "command 2"]',
            '}',
            "",
            "Additional rules:",
            "- If you choose `fixed`, ensure the branch actually contains the repair changes before writing the result.",
            "- If you choose `defer`, explain why the update should stay in manual review right now.",
            "- Keep the summary concise and concrete.",
        ]
    )


def cmd_scan(args: argparse.Namespace) -> int:
    try:
        limit = validated_limit(args.limit)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    targets = scan_targets(limit, args.pr_number, force=args.force)
    write_output(Path(args.output) if args.output else None, targets)
    return 0


def cmd_prepare(args: argparse.Namespace) -> int:
    pr = fetch_pr(args.pr_number)
    if not is_dependabot_pr(pr):
        print(f"PR #{args.pr_number} is not an open Dependabot PR.", file=sys.stderr)
        return 2

    prompt_pr = {
        "number": pr["number"],
        "title": pr["title"],
        "head_ref": pr["headRefName"],
        "url": pr["url"],
    }

    failed_log = fetch_failed_log(pr).strip() or "No failed log was captured for the current PR head."
    log_path = Path(args.log_path)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(failed_log[:12000], encoding="utf-8")

    prompt_path = Path(args.prompt_path)
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(prompt_text(prompt_pr, Path(args.result_path), log_path), encoding="utf-8")
    return 0


def commit_changes(commit_message: str) -> None:
    git("add", "-A")
    git("commit", "-m", commit_message)


def build_replacement_pr_body(
    *,
    original_pr: dict[str, Any],
    summary: str,
    validation: list[str],
    changed_files: list[str],
    diff_summary: str,
) -> str:
    truncated_summary = clipped_text(summary, MAX_REPLACEMENT_SUMMARY_CHARS)
    validation_lines = [f"- `{command}`" for command in validation[:5]]
    file_lines = [f"- `{path}`" for path in changed_files[:MAX_CHANGED_FILES_IN_BODY]]
    if len(changed_files) > MAX_CHANGED_FILES_IN_BODY:
        file_lines.append(f"- ... and {len(changed_files) - MAX_CHANGED_FILES_IN_BODY} more file(s)")

    body_lines = [
        f"Supersedes Dependabot PR #{original_pr['number']} ({original_pr['url']}).",
        "",
        "## Why this PR exists",
        "The weekly TASK-116 Copilot repair lane produced a bounded compatibility fix for a red/manual-review Dependabot update.",
        "",
        "## Original Dependabot update",
        f"- `{original_pr['title']}`",
        f"- head branch: `{original_pr['headRefName']}`",
        "",
        "## What the repair lane changed",
        truncated_summary,
    ]

    if file_lines:
        body_lines.extend(["", "## Files changed", *file_lines])

    if diff_summary:
        body_lines.extend(["", "## Diff summary", f"- {diff_summary}"])

    body_lines.extend(
        [
            "",
            "## Validation reported by the repair lane",
            *(validation_lines or ["- No validation commands were reported by Copilot."]),
            "",
            "## CI note",
            "- Required checks are dispatched explicitly after PR creation so this superseding PR becomes mergeable under the normal branch protection rules.",
            "- Review and merge remain human-owned.",
        ]
    )
    return "\n".join(body_lines)


def create_superseding_pr(
    *,
    original_pr: dict[str, Any],
    replacement_branch: str,
    summary: str,
    validation: list[str],
    changed_files: list[str],
    diff_summary: str,
) -> tuple[int, str, str]:
    title = f"chore(task-116): supersede Dependabot PR #{original_pr['number']}"

    body_variants = [
        build_replacement_pr_body(
            original_pr=original_pr,
            summary=summary,
            validation=validation,
            changed_files=changed_files,
            diff_summary=diff_summary,
        ),
        "\n".join(
            [
                f"Supersedes Dependabot PR #{original_pr['number']} ({original_pr['url']}).",
                "",
                "## Why this exists",
                "Copilot prepared a bounded compatibility fix for this Dependabot update and a maintainer should review it manually.",
                "",
                "## Review guidance",
                "- review the dependency update itself",
                "- verify the compatibility fix is minimal and correct",
                "- merge this PR manually if the result looks good",
            ]
        ),
    ]

    existing_any = existing_replacement_pr(replacement_branch, state="all")
    if existing_any:
        if existing_any.get("mergedAt") or existing_any.get("state") == "MERGED":
            raise RuntimeError(
                (
                    f"replacement branch `{replacement_branch}` already has merged PR "
                    f"#{existing_any['number']}`; refusing to reuse a merged review surface."
                )
            )
        pr_number = int(existing_any["number"])
        if existing_any.get("state") == "CLOSED":
            replacement_branch = next_replacement_branch_name(original_pr["number"], original_pr["headRefOid"])
            git("push", "--force", "origin", f"HEAD:refs/heads/{replacement_branch}")
        else:
            edit_completed: subprocess.CompletedProcess[str] | None = None
            for body in body_variants:
                edit_completed = run(
                    [
                        "gh",
                        "pr",
                        "edit",
                        str(pr_number),
                        "--title",
                        title,
                        "--body",
                        body,
                    ],
                    check=False,
                )
                if edit_completed.returncode == 0:
                    break

            if edit_completed is None or edit_completed.returncode != 0:
                stderr = (edit_completed.stderr or "").strip() if edit_completed else ""
                stdout = (edit_completed.stdout or "").strip() if edit_completed else ""
                raise RuntimeError(stderr or stdout or "gh pr edit failed without output")

            pr_url = gh("pr", "view", str(pr_number), "--json", "url")
            pr_url = json.loads(pr_url)["url"]
            gh("pr", "edit", str(pr_number), "--add-label", "dependencies")
            gh("pr", "edit", str(pr_number), "--add-label", "dependabot:manual-review")
            return pr_number, pr_url, replacement_branch

    completed: subprocess.CompletedProcess[str] | None = None
    for body in body_variants:
        completed = run(
            [
                "gh",
                "pr",
                "create",
                "--base",
                "main",
                "--head",
                replacement_branch,
                "--title",
                title,
                "--body",
                body,
            ],
            check=False,
        )
        if completed.returncode == 0:
            break

    if completed is None or completed.returncode != 0:
        stderr = (completed.stderr or "").strip() if completed else ""
        stdout = (completed.stdout or "").strip() if completed else ""
        raise RuntimeError(stderr or stdout or "gh pr create failed without output")

    pr_url = completed.stdout.strip()
    pr_number = int(pr_url.rstrip("/").split("/")[-1])

    gh("pr", "edit", str(pr_number), "--add-label", "dependencies")
    gh("pr", "edit", str(pr_number), "--add-label", "dependabot:manual-review")
    return pr_number, pr_url, replacement_branch


def dispatched_run_url(
    branch_name: str,
    workflow_file: str,
    *,
    head_sha: str,
    not_before: str,
) -> str | None:
    runs = gh_json(
        [
            "run",
            "list",
            "--workflow",
            workflow_file,
            "--branch",
            branch_name,
            "--event",
            "workflow_dispatch",
            "--limit",
            "5",
            "--json",
            "url,headSha,createdAt",
        ]
    )
    for run_item in runs:
        run_url = str(run_item.get("url") or "").strip()
        run_head_sha = str(run_item.get("headSha") or "").strip()
        created_at = str(run_item.get("createdAt") or "").strip()
        if run_url and run_head_sha == head_sha and created_at >= not_before:
            return run_url
    return None


def dispatch_validation_workflows(branch_name: str, *, head_sha: str) -> list[str]:
    run_urls: list[str] = []
    for workflow_file, workflow_name in WORKFLOW_DISPATCH_TARGETS:
        dispatched_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        completed = run(["gh", "workflow", "run", workflow_file, "--ref", branch_name], check=False)
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            raise RuntimeError(
                f"failed to dispatch `{workflow_name}` for `{branch_name}`: {stderr or stdout or 'no output'}"
            )

        deadline = time.time() + WORKFLOW_DISPATCH_POLL_SECONDS
        run_url: str | None = None
        while time.time() < deadline:
            run_url = dispatched_run_url(
                branch_name,
                workflow_file,
                head_sha=head_sha,
                not_before=dispatched_at,
            )
            if run_url:
                break
            time.sleep(WORKFLOW_DISPATCH_POLL_INTERVAL_SECONDS)

        if not run_url:
            raise RuntimeError(
                f"`{workflow_name}` was dispatched for `{branch_name}`, but no workflow run appeared within {WORKFLOW_DISPATCH_POLL_SECONDS} seconds."
            )

        run_urls.append(run_url)

    return run_urls


def close_original_pr(original_pr_number: int, replacement_pr_number: int, replacement_pr_url: str, marker: str, summary: str) -> None:
    gh(
        "pr",
        "close",
        str(original_pr_number),
        "--comment",
        "\n".join(
            [
                marker,
                summary,
                f"Superseded by repo-owned PR #{replacement_pr_number} ({replacement_pr_url}).",
                "Closing the original Dependabot PR to keep a single merge surface for review.",
            ]
        ),
    )


def close_replacement_pr(replacement_pr_number: int, reason: str) -> None:
    gh(
        "pr",
        "close",
        str(replacement_pr_number),
        "--comment",
        "\n".join(
            [
                "Closing this generated superseding PR because the automation could not make it fully reviewable.",
                "",
                reason,
            ]
        ),
    )


def comment_manual_review(original_pr_number: int, marker: str, summary: str) -> None:
    comment(
        original_pr_number,
        "\n".join(
            [
                marker,
                summary,
                "The scheduled Copilot repair lane is leaving this Dependabot PR open in manual review.",
            ]
        ),
    )


def cmd_finalize(args: argparse.Namespace) -> int:
    original_pr = fetch_pr(args.pr_number)
    result = load_result(Path(args.result_path))
    summary = (result.get("summary") or "No summary was produced.").strip()
    validation = [str(item).strip() for item in result.get("validation") or [] if str(item).strip()]
    marker = f"{MARKER_PREFIX}pr-{args.pr_number}:{args.head_sha} -->"
    replacement_branch = args.replacement_branch
    expected_branch = replacement_branch_name(args.pr_number, args.head_sha)

    if replacement_branch != expected_branch:
        print(
            (
                f"Replacement branch mismatch for PR #{args.pr_number}: "
                f"expected `{expected_branch}`, got `{replacement_branch}`."
            ),
            file=sys.stderr,
        )
        return 2

    if original_pr.get("state") != "OPEN":
        print(
            f"PR #{args.pr_number} is no longer open; skipping finalize.",
            file=sys.stderr,
        )
        return 0

    current_head_sha = original_pr.get("headRefOid") or ""
    if current_head_sha != args.head_sha:
        print(
            (
                f"PR #{args.pr_number} moved from `{args.head_sha}` to "
                f"`{current_head_sha}` after scan; skipping finalize."
            ),
            file=sys.stderr,
        )
        return 0

    existing = existing_replacement_pr_for_source(args.pr_number, args.head_sha)
    if existing:
        close_original_pr(args.pr_number, existing["number"], existing["url"], marker, summary)
        return 0

    if result.get("decision") != "fixed":
        comment_manual_review(args.pr_number, marker, summary)
        return 0

    branch_head_commit = current_head_commit()
    has_uncommitted_changes = working_tree_has_changes()
    has_new_commit = branch_head_commit != args.baseline_sha

    if not has_uncommitted_changes and not has_new_commit:
        comment_manual_review(
            args.pr_number,
            marker,
            f"{summary}\n\nCopilot reported a fix path, but no file changes were produced on the superseding branch.",
        )
        return 0

    if has_uncommitted_changes:
        commit_changes(f"chore(task-116): supersede Dependabot PR #{args.pr_number}")

    git("push", "--force", "-u", "origin", replacement_branch)
    changed_files = changed_files_against_main()
    diff_summary = diff_shortstat_against_main()
    replacement_pr_number, replacement_pr_url, active_replacement_branch = create_superseding_pr(
        original_pr=original_pr,
        replacement_branch=replacement_branch,
        summary=summary,
        validation=validation,
        changed_files=changed_files,
        diff_summary=diff_summary,
    )
    try:
        run_urls = dispatch_validation_workflows(active_replacement_branch, head_sha=current_head_commit())
    except RuntimeError as exc:
        close_replacement_pr(
            replacement_pr_number,
            (
                "The repair lane created this PR but could not successfully dispatch the required CI workflows.\n"
                f"Dispatch failure: {exc}"
            ),
        )
        comment_manual_review(
            args.pr_number,
            marker,
            (
                f"{summary}\n\n"
                "The repair lane created a superseding PR candidate, but it did not become mergeable because the required checks could not be dispatched automatically."
            ),
        )
        return 0

    gh(
        "pr",
        "comment",
        str(replacement_pr_number),
        "--body",
        "\n".join(
            [
                "Required validation workflows were dispatched for this superseding PR:",
                *[f"- {url}" for url in run_urls],
            ]
        ),
    )
    close_original_pr(args.pr_number, replacement_pr_number, replacement_pr_url, marker, summary)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="List open red/manual-review Dependabot PRs.")
    scan.add_argument("--limit", type=int, default=2)
    scan.add_argument("--pr-number", type=int)
    scan.add_argument("--force", action="store_true")
    scan.add_argument("--output")
    scan.set_defaults(func=cmd_scan)

    prepare = subparsers.add_parser("prepare", help="Write Copilot prompt and failed-log context for a PR.")
    prepare.add_argument("--pr-number", type=int, required=True)
    prepare.add_argument("--prompt-path", required=True)
    prepare.add_argument("--result-path", required=True)
    prepare.add_argument("--log-path", required=True)
    prepare.set_defaults(func=cmd_prepare)

    finalize = subparsers.add_parser("finalize", help="Create/comment/close PRs based on Copilot result.")
    finalize.add_argument("--pr-number", type=int, required=True)
    finalize.add_argument("--head-sha", required=True)
    finalize.add_argument("--replacement-branch", required=True)
    finalize.add_argument("--baseline-sha", required=True)
    finalize.add_argument("--result-path", required=True)
    finalize.set_defaults(func=cmd_finalize)

    return parser


def main() -> int:
    if not REPO:
        print("GITHUB_REPOSITORY is required.", file=sys.stderr)
        return 2

    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
