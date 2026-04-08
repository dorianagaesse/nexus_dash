#!/usr/bin/env python3
"""Bounded repair automation for failing Dependabot PRs."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPO = os.environ.get("GITHUB_REPOSITORY", "").strip()
MAX_PRS = int(os.environ.get("DEPENDABOT_REPAIR_MAX_PRS", "2"))
MARKER_PREFIX = "<!-- dependabot-repair-agent:"
NPM_EXECUTABLE = "npm.cmd" if os.name == "nt" else "npm"
FORCE_REPAIR = os.environ.get("DEPENDABOT_REPAIR_FORCE", "").strip() == "1"
TARGET_PR_NUMBER = os.environ.get("DEPENDABOT_REPAIR_PR_NUMBER", "").strip()
TARGET_HEAD_BRANCH = os.environ.get("DEPENDABOT_REPAIR_HEAD_BRANCH", "").strip()
TARGET_HEAD_SHA = os.environ.get("DEPENDABOT_REPAIR_HEAD_SHA", "").strip()
DEPENDABOT_LOGINS = {"app/dependabot", "dependabot[bot]"}


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


def pr_has_failure(pr: dict[str, Any]) -> bool:
    checks = pr.get("statusCheckRollup") or []
    return any(
        check_run.get("status") == "COMPLETED"
        and check_run.get("conclusion") not in {"SUCCESS", "NEUTRAL", "SKIPPED", None, ""}
        for check_run in checks
    )


def failing_dependabot_prs() -> list[dict[str, Any]]:
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

    failing: list[dict[str, Any]] = []
    for pr in prs:
        if not is_dependabot_pr(pr):
            continue

        labels = {label["name"] for label in pr.get("labels", [])}
        if "dependabot:auto-merge" in labels:
            continue

        if pr_has_failure(pr):
            failing.append(pr)

    return failing[:MAX_PRS]


def targeted_dependabot_pr() -> dict[str, Any] | None:
    if not TARGET_PR_NUMBER and not TARGET_HEAD_BRANCH:
        return None

    if TARGET_PR_NUMBER:
        pr = gh_json(
            [
                "pr",
                "view",
                TARGET_PR_NUMBER,
                "--json",
                "number,title,headRefName,headRefOid,labels,statusCheckRollup,url,author,isDraft,state",
            ]
        )
    else:
        prs = gh_json(
            [
                "pr",
                "list",
                "--state",
                "open",
                "--head",
                TARGET_HEAD_BRANCH,
                "--json",
                "number,title,headRefName,headRefOid,labels,statusCheckRollup,url,author,isDraft,state",
            ]
        )
        if not prs:
            print(f"Skipping branch {TARGET_HEAD_BRANCH}; no open PR currently matches that head branch.")
            return None
        pr = prs[0]

    if not is_dependabot_pr(pr):
        pr_reference = f"PR #{TARGET_PR_NUMBER}" if TARGET_PR_NUMBER else f"branch {TARGET_HEAD_BRANCH}"
        print(f"Skipping {pr_reference}; it is not an open Dependabot PR on a dependabot/* branch.")
        return None

    if TARGET_HEAD_SHA and pr.get("headRefOid") != TARGET_HEAD_SHA:
        print(
            f"Skipping PR #{pr['number']}; workflow_run head {TARGET_HEAD_SHA} no longer matches current PR head {pr.get('headRefOid')}."
        )
        return None

    labels = {label["name"] for label in pr.get("labels", [])}
    if "dependabot:auto-merge" in labels:
        print(f"Skipping PR #{TARGET_PR_NUMBER}; it is already in the safe auto-merge lane.")
        return None

    if not pr_has_failure(pr):
        print(f"Skipping PR #{TARGET_PR_NUMBER}; no failing required checks are visible on the current head.")
        return None

    return pr


def get_comments(pr_number: int) -> list[dict[str, Any]]:
    return gh_json(["pr", "view", str(pr_number), "--json", "comments"])["comments"]


def has_marker(pr_number: int, marker: str) -> bool:
    return any(marker in (comment.get("body") or "") for comment in get_comments(pr_number))


def add_manual_review_label(pr_number: int) -> None:
    gh("pr", "edit", str(pr_number), "--add-label", "dependabot:manual-review")


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


def classify_failure(log_text: str) -> dict[str, str]:
    if (
        "package.json and package-lock.json or npm-shrinkwrap.json are in sync" in log_text
        or "`npm ci` can only install packages when your package.json and package-lock.json" in log_text
        or "Missing: magicast@" in log_text
    ):
        return {
            "kind": "lockfile-refresh",
            "summary": (
                "CI is failing because `npm ci` sees the lockfile out of sync with "
                "`package.json`. This is in the bounded auto-repair lane."
            ),
        }

    if "trying to use `tailwindcss` directly as a PostCSS plugin" in log_text:
        return {
            "kind": "comment-only",
            "summary": (
                "Tailwind 4 is not a lockfile-only repair here. It needs the "
                "PostCSS plugin migration to `@tailwindcss/postcss` plus config validation."
            ),
        }

    return {
        "kind": "comment-only",
        "summary": (
            "The failure is outside the bounded auto-repair lane, so the agent is "
            "recording the diagnosis for manual review instead of guessing."
        ),
    }


def comment(pr_number: int, body: str) -> None:
    gh("pr", "comment", str(pr_number), "--body", body)


def existing_replacement_pr(branch_name: str) -> dict[str, Any] | None:
    prs = gh_json(["pr", "list", "--state", "open", "--head", branch_name, "--json", "number,url"])
    return prs[0] if prs else None


def repair_lockfile(pr: dict[str, Any], diagnosis: dict[str, str], marker: str) -> None:
    pr_number = pr["number"]
    branch_name = f"chore/task-116-repair-pr-{pr_number}-lockfile-{pr['headRefOid'][:7]}"
    existing = existing_replacement_pr(branch_name)
    if existing:
        comment(
            pr_number,
            "\n".join(
                [
                    marker,
                    f"Bounded repair already exists for this PR head: replacement PR #{existing['number']} ({existing['url']}).",
                    "Human review is still required before merge.",
                ]
            ),
        )
        return

    git("fetch", "origin", pr["headRefName"])
    git("checkout", "-B", branch_name, "FETCH_HEAD")

    try:
        run([NPM_EXECUTABLE, "install"])
    except subprocess.CalledProcessError as exc:
        git("checkout", "main")
        excerpt = (exc.stderr or exc.stdout or "npm install failed without captured output").strip()[:3500]
        comment(
            pr_number,
            "\n".join(
                [
                    marker,
                    diagnosis["summary"],
                    "The agent attempted a lockfile refresh on a repo-owned superseding branch, but `npm install` failed before a repair PR could be created.",
                    "",
                    "Failure excerpt:",
                    "```text",
                    excerpt,
                    "```",
                ]
            ),
        )
        return

    status = run(["git", "status", "--short"]).stdout.strip()
    if not status:
        git("checkout", "main")
        comment(
            pr_number,
            "\n".join(
                [
                    marker,
                    diagnosis["summary"],
                    "The agent attempted a lockfile refresh, but it produced no file changes on a superseding branch.",
                    "That usually means the failure needs a deeper compatibility fix than a lockfile sync.",
                ]
            ),
        )
        return

    git("add", "package-lock.json", "package.json")
    git("commit", "-m", f"chore(task-116): repair Dependabot PR #{pr_number} lockfile drift")
    git("push", "-u", "origin", branch_name)

    title = f"chore(task-116): repair Dependabot PR #{pr_number} lockfile drift"
    body = "\n".join(
        [
            f"Supersedes Dependabot PR #{pr_number}.",
            "",
            "## Why this exists",
            diagnosis["summary"],
            "",
            "This repo-owned replacement branch refreshes the lockfile without mutating the original Dependabot branch.",
            "",
            "## Review guidance",
            "- verify the dependency bump itself is still desirable",
            "- treat this PR as manual-review even if the repair is small",
            "- close or supersede the original Dependabot PR only after this path is validated",
        ]
    )
    pr_url = gh(
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        branch_name,
        "--title",
        title,
        "--body",
        body,
    ).strip()
    new_pr_number = int(pr_url.rstrip("/").split("/")[-1])

    gh("pr", "edit", str(new_pr_number), "--add-label", "dependencies")
    gh("pr", "edit", str(new_pr_number), "--add-label", "dependabot:manual-review")

    comment(
        pr_number,
        "\n".join(
            [
                marker,
                diagnosis["summary"],
                f"The agent opened repo-owned replacement PR #{new_pr_number} ({pr_url}) on a superseding branch.",
                "The original Dependabot branch was left untouched. Human review is still required.",
            ]
        ),
    )
    comment(
        new_pr_number,
        "\n".join(
            [
                f"{MARKER_PREFIX}replacement-for-{pr_number}:{pr['headRefOid']} -->",
                f"This PR was opened automatically by the TASK-116 Dependabot repair agent as a bounded repair path for Dependabot PR #{pr_number}.",
                "It is intentionally not auto-merged. Please review it as a manual-review dependency PR.",
            ]
        ),
    )

    git("checkout", "main")


def comment_only(pr: dict[str, Any], diagnosis: dict[str, str], marker: str, log_text: str) -> None:
    excerpt = (log_text or "No failed log excerpt was captured.").strip()[:3500]
    comment(
        pr["number"],
        "\n".join(
            [
                marker,
                diagnosis["summary"],
                "This failure is outside the bounded auto-repair lane, so the agent is leaving it for manual review instead of opening a guessy replacement PR.",
                "",
                "Failure excerpt:",
                "```text",
                excerpt,
                "```",
            ]
        ),
    )


def process_pr(pr: dict[str, Any]) -> None:
    pr_number = pr["number"]
    marker = f"{MARKER_PREFIX}pr-{pr_number}:{pr['headRefOid']} -->"
    add_manual_review_label(pr_number)
    if not FORCE_REPAIR and has_marker(pr_number, marker):
        print(f"Skipping PR #{pr_number}; marker already present for current head.")
        return

    log_text = fetch_failed_log(pr)
    diagnosis = classify_failure(log_text)
    if diagnosis["kind"] == "lockfile-refresh":
        repair_lockfile(pr, diagnosis, marker)
    else:
        comment_only(pr, diagnosis, marker, log_text)


def main() -> int:
    if not REPO:
        print("GITHUB_REPOSITORY is required.", file=sys.stderr)
        return 2

    prs = [targeted_dependabot_pr()] if TARGET_PR_NUMBER or TARGET_HEAD_BRANCH else failing_dependabot_prs()
    prs = [pr for pr in prs if pr is not None]
    if not prs:
        print("No failing/manual-review Dependabot PRs matched the repair lane.")
        return 0

    git("checkout", "main")
    for pr in prs:
        print(f"Processing Dependabot PR #{pr['number']}: {pr['title']}")
        process_pr(pr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
