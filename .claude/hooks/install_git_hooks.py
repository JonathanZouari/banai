"""Installs the repo's git hooks into .git/hooks (ADR-024). Run once per clone:

    python .claude/hooks/install_git_hooks.py

It writes .git/hooks/post-commit, which runs obsidian_commit_log.py after every commit. Only this
clone is touched: no global git config, no core.hooksPath. Re-running overwrites our own hook; a
foreign post-commit hook is left alone unless --force is given.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from obsidian_api import git_command  # noqa: E402

MARKER = "banai obsidian_commit_log"
HOOK = f"""#!/bin/sh
# {MARKER} (installed by .claude/hooks/install_git_hooks.py, ADR-024).
# Appends the commit to the Obsidian work log. Never blocks the commit.
python "$(git rev-parse --show-toplevel)/.claude/hooks/obsidian_commit_log.py" >/dev/null 2>&1 || true
"""


def main(argv: list[str]) -> int:
    here = Path(__file__).resolve().parent
    try:
        git_dir = subprocess.run(
            git_command(str(here), "rev-parse", "--git-dir"), cwd=here, capture_output=True, text=True,
            encoding="utf-8", check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"install_git_hooks: not a git repository ({error})", file=sys.stderr)
        return 1
    hooks_dir = (here / git_dir).resolve() if not Path(git_dir).is_absolute() else Path(git_dir)
    hooks_dir = hooks_dir / "hooks"
    hooks_dir.mkdir(parents=True, exist_ok=True)
    target = hooks_dir / "post-commit"
    if target.exists() and MARKER not in target.read_text(encoding="utf-8", errors="replace") and "--force" not in argv:
        print(f"install_git_hooks: {target} exists and is not ours; pass --force to replace it", file=sys.stderr)
        return 1
    target.write_text(HOOK, encoding="utf-8", newline="\n")
    if os.name != "nt":
        target.chmod(0o755)
    print(f"install_git_hooks: wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
