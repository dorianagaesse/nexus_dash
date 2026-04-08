#!/usr/bin/env python3
"""Scheduled Dependabot repair support for TASK-116."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
MARKER_PREFIX = "<!-- dependabot-repair-agent:"
<<<<<<< HEAD
NPM_EXECUTABLE = "npm.cmd" if os.name == "nt" else "npm"
FORCE_REPAIR = os.environ.get("DEPENDABOT_REPAIR_FORCE", "").strip() == "1"
=======
DEPENDABOT_LOGINS = {"app/dependabot", "dependabot[bot]"}
REQUIRED_CHECK_NAMES = {
    "check-name",
    "Quality Core (lint, test, coverage, build)",
    "E2E Smoke (Playwright)",
    "Container Image (build + metadata artifact)",
}
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)


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


<<<<<<< HEAD
def failing_dependabot_prs() -> list[dict[str, Any]]:
    prs = gh_json(
        [
            "pr",
            "list",
            "--state",
            "open",
            "--search",
            "author:app/dependabot",
            "--json",
            "number,title,headRefName,headRefOid,labels,statusCheckRollup,url",
        ]
    )

    failing: list[dict[str, Any]] = []
    for pr in prs:
        labels = {label["name"] for label in pr.get("labels", [])}
        if "dependabot:auto-merge" in labels:
            continue

        checks = pr.get("statusCheckRollup") or []
        has_failure = any(
            check_run.get("status") == "COMPLETED"
            and check_run.get("conclusion") not in {"SUCCESS", "NEUTRAL", "SKIPPED", None, ""}
            for check_run in checks
        )
        if has_failure:
            failing.append(pr)

    return failing[:MAX_PRS]
=======
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
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)


def get_comments(pr_number: int) -> list[dict[str, Any]]:
    return gh_json(["pr", "view", str(pr_number), "--json", "comments"])["comments"]


def has_marker(pr_number: int, marker: str) -> bool:
    return any(marker in (comment.get("body") or "") for comment in get_comments(pr_number))


def replacement_branch_name(pr_number: int, head_sha: str) -> str:
    return f"chore/task-116-repair-pr-{pr_number}-{head_sha[:7]}"


def existing_replacement_pr(branch_name: str) -> dict[str, Any] | None:
    prs = gh_json(["pr", "list", "--state", "open", "--head", branch_name, "--json", "number,url,state"])
    return prs[0] if prs else None


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


def scan_targets(limit: int, specific_pr: int | None = None) -> list[dict[str, Any]]:
    if specific_pr is not None:
        prs = [fetch_pr(specific_pr)]
    else:
        prs = gh_json(
            [
                "pr",
                "list",
                "--state",
                "open",
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
        if has_marker(pr["number"], marker) or existing_replacement_pr(branch_name):
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
    targets = scan_targets(args.limit, args.pr_number)
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


def create_superseding_pr(
    *,
    original_pr: dict[str, Any],
    replacement_branch: str,
    summary: str,
    validation: list[str],
) -> tuple[int, str]:
    title = f"chore(task-116): supersede Dependabot PR #{original_pr['number']}"
    body_lines = [
        f"Supersedes Dependabot PR #{original_pr['number']} ({original_pr['url']}).",
        "",
        "## Why this exists",
        summary,
        "",
        "## Review guidance",
        "- review the dependency update itself",
        "- verify the compatibility fix is minimal and correct",
        "- merge this PR manually if the result looks good",
    ]
    if validation:
        body_lines.extend(["", "## Validation run by Copilot lane"])
        body_lines.extend([f"- `{command}`" for command in validation])

    pr_url = gh(
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        replacement_branch,
        "--title",
        title,
        "--body",
        "\n".join(body_lines),
    ).strip()
    pr_number = int(pr_url.rstrip("/").split("/")[-1])

    gh("pr", "edit", str(pr_number), "--add-label", "dependencies")
    gh("pr", "edit", str(pr_number), "--add-label", "dependabot:manual-review")
    return pr_number, pr_url


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

    existing = existing_replacement_pr(replacement_branch)
    if existing:
        close_original_pr(args.pr_number, existing["number"], existing["url"], marker, summary)
        return 0

    if result.get("decision") != "fixed":
        comment_manual_review(args.pr_number, marker, summary)
        return 0

    if not working_tree_has_changes():
        comment_manual_review(
            args.pr_number,
            marker,
            f"{summary}\n\nCopilot reported a fix path, but no file changes were produced on the superseding branch.",
        )
        return 0

    commit_changes(f"chore(task-116): supersede Dependabot PR #{args.pr_number}")
    git("push", "-u", "origin", replacement_branch)
    replacement_pr_number, replacement_pr_url = create_superseding_pr(
        original_pr=original_pr,
        replacement_branch=replacement_branch,
        summary=summary,
        validation=validation,
    )
    close_original_pr(args.pr_number, replacement_pr_number, replacement_pr_url, marker, summary)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="List open red/manual-review Dependabot PRs.")
    scan.add_argument("--limit", type=int, default=2)
    scan.add_argument("--pr-number", type=int)
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
    finalize.add_argument("--result-path", required=True)
    finalize.set_defaults(func=cmd_finalize)

    return parser


def main() -> int:
    if not REPO:
        print("GITHUB_REPOSITORY is required.", file=sys.stderr)
        return 2

<<<<<<< HEAD
    prs = failing_dependabot_prs()
    if not prs:
        print("No failing/manual-review Dependabot PRs matched the repair lane.")
        return 0

    git("checkout", "main")
    for pr in prs:
        print(f"Processing Dependabot PR #{pr['number']}: {pr['title']}")
        process_pr(pr)

    return 0
=======
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)
>>>>>>> a488cf0 (chore(task-116): schedule copilot dependabot repair lane)


if __name__ == "__main__":
    raise SystemExit(main())
