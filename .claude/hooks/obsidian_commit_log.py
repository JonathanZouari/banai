"""git post-commit hook (ADR-024): append each commit to the BanAI work log in Obsidian.

Writes the subject, the body, the `Decision:` trailers and the file stats of HEAD (or of the
commit given with --commit) through the Obsidian Local REST API. Installed into .git/hooks by
install_git_hooks.py; the shared API code is in obsidian_api.py next to this file.

Never blocks a commit: every failure is reported on stderr and exits 0.
    --dry-run   print the entry instead of sending it
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from obsidian_api import append_to_obsidian, git, git_command, load_api_key, neutralise_fences, quote, redact, truncate  # noqa: E402

MAX_BODY_CHARS = 1800
MAX_FILE_LINES = 40
FORMAT = "%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%b"


def decisions(message: str, cwd: str) -> list[str]:
    """The `Decision:` trailers of a commit message (git parses them, so folding and case match git)."""
    try:
        result = subprocess.run(
            git_command(cwd, "interpret-trailers", "--parse"), cwd=cwd, input=message, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    found = []
    for line in result.stdout.splitlines():
        key, sep, value = line.partition(":")
        if sep and key.strip().lower() == "decision" and value.strip():
            found.append(value.strip())
    return found


def build_entry(cwd: str, commit: str) -> str | None:
    raw = git(cwd, "log", "-1", "--date=format:%Y-%m-%d %H:%M", f"--format={FORMAT}", "--end-of-options", commit)
    if not raw:
        return None
    full, short, author, date, subject, body = (raw.split("\x1f") + [""] * 6)[:6]
    body = body.strip()
    branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD") or "-"
    stat = git(cwd, "show", "--stat=100", "--format=", "--end-of-options", commit)
    stat_lines = [line.rstrip() for line in stat.splitlines() if line.strip()]
    summary = stat_lines[-1].strip() if stat_lines else ""
    files = stat_lines[:-1][:MAX_FILE_LINES]
    hidden = len(stat_lines) - 1 - len(files)

    lines = [
        "",
        "---",
        "",
        f"### {date} · commit `{short}`",
        f"*Branch `{branch}` · {author} · {summary or 'no file changes'}*",
        "",
        f"**{neutralise_fences(redact(subject))}**",
    ]
    if body:
        lines += ["", quote(neutralise_fences(redact(truncate(body, MAX_BODY_CHARS))))]
    found = decisions(f"{subject}\n\n{body}\n", cwd)
    if found:
        lines += ["", "**Decisions**"] + [f"- {item}" for item in found]
    if files:
        lines += ["", "**Files**", "```", *files]
        if hidden > 0:
            lines.append(f"… and {hidden} more")
        lines.append("```")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    commit = "HEAD"
    if "--commit" in argv:
        index = argv.index("--commit")
        commit = argv[index + 1] if index + 1 < len(argv) else "HEAD"
    try:
        cwd = git(os.getcwd(), "rev-parse", "--show-toplevel") or os.getcwd()
        entry = build_entry(cwd, commit)
        if not entry:
            print("obsidian_commit_log: no commit to log", file=sys.stderr)
            return 0
        if dry_run:
            sys.stdout.buffer.write(entry.encode("utf-8"))
            return 0
        api_key = load_api_key()
        if not api_key:
            print("obsidian_commit_log: no OBSIDIAN_API_KEY available", file=sys.stderr)
            return 0
        append_to_obsidian(entry, api_key)
        print(f"obsidian_commit_log: logged {commit} at {datetime.now():%H:%M}", file=sys.stderr)
    except Exception as error:  # noqa: BLE001 - a logging hook must never block a commit
        print(f"obsidian_commit_log: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
