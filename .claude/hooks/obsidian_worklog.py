"""Claude Code Stop hook: append an entry to the BanAI work log in Obsidian, but only for turns
that changed files (ADR-010 / ADR-024: document per task, not per turn).

Reads the hook payload from stdin, extracts the last user prompt and the final assistant reply
from the transcript, adds git context, and appends a Markdown entry to the vault through the
Obsidian Local REST API (shared code in obsidian_api.py). A turn counts as "changed files" when
either holds:
  - the assistant used an editing tool (Edit, Write, MultiEdit, NotebookEdit) in this turn, or
  - the git fingerprint (HEAD plus `git status --porcelain`) differs from the one the previous
    Stop saved in <git-dir>/banai-worklog.state, which also catches edits made through the shell
    and commits.
Turns that only read, answered or ran tests are skipped. Commits themselves are logged by the
post-commit hook (obsidian_commit_log.py).

Never blocks the agent: every failure is reported on stderr and exits 0.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from obsidian_api import append_to_obsidian, git, load_api_key, neutralise_fences, quote, redact, truncate  # noqa: E402

MAX_PROMPT_CHARS = 600
MAX_REPLY_CHARS = 2500
EDITING_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
STATE_FILE = "banai-worklog.state"


def read_payload() -> dict:
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw.strip() else {}


def text_from_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        ]
        return "\n".join(p for p in parts if p)
    return ""


def is_real_user_prompt(entry: dict) -> bool:
    if entry.get("type") != "user" or entry.get("isMeta"):
        return False
    content = entry.get("message", {}).get("content")
    if isinstance(content, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_result" for b in content
    ):
        return False
    text = text_from_content(content).strip()
    return bool(text) and not text.startswith("<")


def used_editing_tool(entries: list[dict]) -> bool:
    """True when an assistant entry in this turn carries a tool_use of an editing tool."""
    for entry in entries:
        if entry.get("type") != "assistant":
            continue
        content = entry.get("message", {}).get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") in EDITING_TOOLS:
                return True
    return False


def last_turn(transcript_path: str) -> tuple[str, str, bool]:
    """Return (last user prompt, assistant text since that prompt, whether an editing tool ran)."""
    entries = []
    with open(transcript_path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            try:
                entries.append(json.loads(line))
            except ValueError:
                continue

    start = max(
        (i for i, e in enumerate(entries) if is_real_user_prompt(e)), default=-1
    )
    if start < 0:
        return "", "", False
    prompt = text_from_content(entries[start]["message"]["content"]).strip()
    turn = entries[start + 1 :]
    replies = [
        text_from_content(e.get("message", {}).get("content"))
        for e in turn
        if e.get("type") == "assistant"
    ]
    final_reply = next((r for r in reversed(replies) if r.strip()), "")
    return prompt, final_reply.strip(), used_editing_tool(turn)


def git_fingerprint(cwd: str) -> str | None:
    """HEAD plus the working-tree status, hashed; None outside a git checkout."""
    head = git(cwd, "rev-parse", "HEAD")
    if not head:
        return None
    status = git(cwd, "status", "--porcelain")
    return hashlib.sha256(f"{head}\n{status}".encode("utf-8")).hexdigest()


def tree_changed(cwd: str) -> bool:
    """True when the fingerprint differs from the previous Stop's; saves the new one either way.
    The state lives in the clone's git dir, so it is never committed."""
    fingerprint = git_fingerprint(cwd)
    if fingerprint is None:
        return False
    git_dir = git(cwd, "rev-parse", "--absolute-git-dir") or git(cwd, "rev-parse", "--git-dir")
    if not git_dir:
        return False
    state = Path(git_dir) / STATE_FILE
    try:
        previous = state.read_text(encoding="utf-8").strip()
    except OSError:
        previous = ""
    try:
        state.write_text(fingerprint, encoding="utf-8")
    except OSError:
        pass
    return previous != fingerprint


def build_entry(prompt: str, reply: str, cwd: str, session_id: str) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD") or "-"
    head = git(cwd, "log", "-1", "--pretty=%h %s") or "-"
    changed = git(cwd, "status", "--short")
    changed_list = changed.splitlines()[:15]

    lines = [
        "",
        "---",
        "",
        f"### {now} · auto",
        f"*Session `{session_id[:8]}` · branch `{branch}` · HEAD `{head}`*",
        "",
        "**Request**",
        quote(neutralise_fences(redact(truncate(prompt, MAX_PROMPT_CHARS)))),
        "",
        "**Outcome**",
        quote(neutralise_fences(redact(truncate(reply, MAX_REPLY_CHARS)))) or "_(no text reply)_",
    ]
    if changed_list:
        lines += ["", "**Uncommitted changes**", "```", *changed_list, "```"]
    return "\n".join(lines) + "\n"


def main() -> int:
    try:
        payload = read_payload()
        if payload.get("stop_hook_active"):
            return 0
        transcript = payload.get("transcript_path")
        if not transcript or not Path(transcript).exists():
            return 0
        prompt, reply, edited = last_turn(transcript)
        reply = payload.get("last_assistant_message") or reply
        if not prompt:
            return 0
        cwd = payload.get("cwd") or str(Path.cwd())
        # tree_changed() must run even when `edited` is true, so the saved fingerprint stays current.
        changed = tree_changed(cwd)
        if not (edited or changed):
            return 0
        api_key = load_api_key()
        if not api_key:
            print("obsidian_worklog: no OBSIDIAN_API_KEY available", file=sys.stderr)
            return 0
        entry = build_entry(prompt, reply, cwd, payload.get("session_id", ""))
        append_to_obsidian(entry, api_key)
    except Exception as error:  # noqa: BLE001 - a logging hook must never block the agent
        print(f"obsidian_worklog: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
