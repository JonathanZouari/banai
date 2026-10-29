"""Append entries to the BanAI work log in Obsidian.

Two modes:
  (default)  Claude Code Stop hook. Reads the hook payload from stdin, extracts
             the last user prompt and the final assistant reply from the
             transcript, adds git context, and appends a Markdown entry.
  --commit   git post-commit hook. Appends the commit just made (hash, branch,
             author, message, changed files), including commits made by hand.

Where the entry goes:
  - OBSIDIAN_VAULT_DIR set: appended straight to the file on disk. Obsidian
    picks it up live, whichever vault is open and with no plugin needed.
  - otherwise: through the Obsidian Local REST API.

Configuration (environment variables, all optional). When a variable is not in
the environment, it is read from the "env" block of .claude/settings.local.json
(gitignored), so the git hook sees the same settings as Claude Code.
  OBSIDIAN_VAULT_DIR   Absolute path of the vault folder (file mode).
  OBSIDIAN_API_KEY     REST API key. Falls back to the `obsidian` MCP server
                       entry in ~/.claude.json, so no secret lives in the repo.
  OBSIDIAN_BASE_URL    Default: https://127.0.0.1:27124
  OBSIDIAN_WORKLOG     Path inside the vault. Default: BanAI/10 - Work Log.md

Never blocks the agent or the commit: every failure is reported on stderr and exits 0.
"""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

DEFAULT_BASE_URL = "https://127.0.0.1:27124"
DEFAULT_WORKLOG = "BanAI/10 - Work Log.md"
MAX_PROMPT_CHARS = 600
MAX_REPLY_CHARS = 2500
REQUEST_TIMEOUT_SECONDS = 5
MAX_COMMIT_FILES = 20
REPO_ROOT = Path(__file__).resolve().parents[2]


def local_settings_env() -> dict:
    path = REPO_ROOT / ".claude" / "settings.local.json"
    try:
        env = json.loads(path.read_text(encoding="utf-8")).get("env", {})
        return env if isinstance(env, dict) else {}
    except (OSError, ValueError):
        return {}


def setting(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name) or local_settings_env().get(name) or default


def read_payload() -> dict:
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw.strip() else {}


def load_api_key() -> str | None:
    key = setting("OBSIDIAN_API_KEY")
    if key:
        return key
    config_path = Path.home() / ".claude.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        return config["mcpServers"]["obsidian"]["env"]["OBSIDIAN_API_KEY"]
    except (OSError, KeyError, ValueError):
        return None


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


def last_turn(transcript_path: str) -> tuple[str, str]:
    """Return (last user prompt, assistant text since that prompt)."""
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
        return "", ""
    prompt = text_from_content(entries[start]["message"]["content"]).strip()
    replies = [
        text_from_content(e.get("message", {}).get("content"))
        for e in entries[start + 1 :]
        if e.get("type") == "assistant"
    ]
    final_reply = next((r for r in reversed(replies) if r.strip()), "")
    return prompt, final_reply.strip()


def git(cwd: str, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True,
            encoding="utf-8", timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + " …"


def quote(text: str) -> str:
    return "\n".join(f"> {line}" if line else ">" for line in text.splitlines())


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
        quote(truncate(prompt, MAX_PROMPT_CHARS)),
        "",
        "**Outcome**",
        truncate(reply, MAX_REPLY_CHARS) or "_(no text reply)_",
    ]
    if changed_list:
        lines += ["", "**Uncommitted changes**", "```", *changed_list, "```"]
    return "\n".join(lines) + "\n"


def build_commit_entry(cwd: str) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD") or "-"
    head = git(cwd, "log", "-1", "--pretty=%h") or "-"
    author = git(cwd, "log", "-1", "--pretty=%an") or "-"
    message = git(cwd, "log", "-1", "--pretty=%B") or "-"
    files = git(cwd, "show", "--name-status", "--format=", "HEAD").splitlines()
    shown = files[:MAX_COMMIT_FILES]
    if len(files) > MAX_COMMIT_FILES:
        shown.append(f"… and {len(files) - MAX_COMMIT_FILES} more")

    lines = [
        "",
        "---",
        "",
        f"### {now} · commit",
        f"*Branch `{branch}` · `{head}` · {author}*",
        "",
        "**Message**",
        quote(truncate(message, MAX_REPLY_CHARS)),
    ]
    if shown:
        lines += ["", "**Files**", "```", *shown, "```"]
    return "\n".join(lines) + "\n"


def append_to_file(entry: str, vault_dir: str) -> None:
    worklog = setting("OBSIDIAN_WORKLOG", DEFAULT_WORKLOG)
    vault = Path(vault_dir).resolve()
    target = (vault / worklog).resolve()
    if vault not in target.parents:
        raise ValueError("OBSIDIAN_WORKLOG must stay inside the vault")
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "a", encoding="utf-8", newline="\n") as handle:
        handle.write(entry)


def append_entry(entry: str) -> None:
    vault_dir = setting("OBSIDIAN_VAULT_DIR")
    if vault_dir:
        append_to_file(entry, vault_dir)
        return
    api_key = load_api_key()
    if not api_key:
        print("obsidian_worklog: no OBSIDIAN_VAULT_DIR or OBSIDIAN_API_KEY", file=sys.stderr)
        return
    append_to_obsidian(entry, api_key)


def append_to_obsidian(entry: str, api_key: str) -> None:
    base_url = setting("OBSIDIAN_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    worklog = setting("OBSIDIAN_WORKLOG", DEFAULT_WORKLOG)
    url = f"{base_url}/vault/{urllib.parse.quote(worklog)}"
    request = urllib.request.Request(
        url,
        data=entry.encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "text/markdown; charset=utf-8",
        },
    )
    # The Local REST API runs on localhost with a self-signed certificate.
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=context):
        pass


def main() -> int:
    if "--commit" in sys.argv[1:]:
        try:
            append_entry(build_commit_entry(os.getcwd()))
        except Exception as error:  # noqa: BLE001 - a logging hook must never block a commit
            print(f"obsidian_worklog: {error}", file=sys.stderr)
        return 0
    try:
        payload = read_payload()
        if payload.get("stop_hook_active"):
            return 0
        transcript = payload.get("transcript_path")
        if not transcript or not Path(transcript).exists():
            return 0
        prompt, reply = last_turn(transcript)
        reply = payload.get("last_assistant_message") or reply
        if not prompt:
            return 0
        cwd = payload.get("cwd") or os.getcwd()
        entry = build_entry(prompt, reply, cwd, payload.get("session_id", ""))
        append_entry(entry)
    except Exception as error:  # noqa: BLE001 - a logging hook must never block the agent
        print(f"obsidian_worklog: {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
