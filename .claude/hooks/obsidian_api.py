"""Shared bits for the Obsidian hooks: the API key, the Local REST API append, and git helpers.

Configuration (environment variables, all optional):
  OBSIDIAN_API_KEY     REST API key. Falls back to the `obsidian` MCP server entry in
                       ~/.claude.json, so no secret lives in the repo.
  OBSIDIAN_BASE_URL    Default: https://127.0.0.1:27124
  OBSIDIAN_WORKLOG     Vault path. Default: BanAI/10 - Work Log.md
"""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import urllib.parse
import re
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "https://127.0.0.1:27124"
DEFAULT_WORKLOG = "BanAI/10 - Work Log.md"
REQUEST_TIMEOUT_SECONDS = 5


def load_api_key() -> str | None:
    key = os.environ.get("OBSIDIAN_API_KEY")
    if key:
        return key
    config_path = Path.home() / ".claude.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        return config["mcpServers"]["obsidian"]["env"]["OBSIDIAN_API_KEY"]
    except (OSError, KeyError, ValueError, TypeError):
        return None


def repo_root(cwd: str) -> str:
    """The nearest ancestor of `cwd` (itself included) that holds a .git entry, else `cwd`."""
    path = Path(cwd).resolve()
    for candidate in (path, *path.parents):
        if (candidate / ".git").exists():
            return str(candidate)
    return str(path)


def git_command(cwd: str, *args: str) -> list[str]:
    """`git` with a safe.directory exception for this checkout only. The checkout sits on a drive that
    records no ownership, so git refuses to run there until the user adds the exception globally;
    scoping it to the repository the hook runs in keeps the bypass narrow."""
    return ["git", "-c", f"safe.directory={repo_root(cwd)}", *args]


def git(cwd: str, *args: str) -> str:
    """stdout of a git command, or "" on any failure (the hooks must never raise here)."""
    try:
        result = subprocess.run(
            git_command(cwd, *args), cwd=cwd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
# OpenAI-style keys and bearer tokens pasted into a prompt or a commit never reach the vault.
_SECRET = re.compile(r"\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]{8,}|(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*")


def redact(text: str) -> str:
    return _SECRET.sub(lambda m: f"{m.group(1)}…[redacted]" if m.group(1) else f"{m.group(2)}[redacted]", text)


def neutralise_fences(text: str) -> str:
    """Code fences in logged text stop being fences, so no ```dataviewjs (or similar) block can run in the vault."""
    return text.replace("```", "ʼʼʼ").replace("~~~", "∼∼∼")


def truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + " …"


def quote(text: str) -> str:
    return "\n".join(f"> {line}" if line else ">" for line in text.splitlines())


def append_to_obsidian(entry: str, api_key: str) -> None:
    base_url = os.environ.get("OBSIDIAN_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    worklog = os.environ.get("OBSIDIAN_WORKLOG", DEFAULT_WORKLOG)
    url = f"{base_url}/vault/{urllib.parse.quote(worklog)}"
    host = urllib.parse.urlsplit(base_url).hostname or ""
    request = urllib.request.Request(
        url,
        data=entry.encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "text/markdown; charset=utf-8",
        },
    )
    # The Local REST API runs on localhost with a self-signed certificate. Verification is skipped only
    # there: a remote OBSIDIAN_BASE_URL gets normal certificate checks, so the bearer key is not sent blind.
    context = ssl._create_unverified_context() if host in LOOPBACK_HOSTS else ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=context):
        pass
