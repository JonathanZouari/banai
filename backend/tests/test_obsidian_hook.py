"""The Obsidian Stop hook finds its API key in the environment or in the `obsidian` MCP entry."""

import importlib.util
import json
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "obsidian_worklog.py"


@pytest.fixture
def hook(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("obsidian_worklog", HOOK)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.delenv("OBSIDIAN_API_KEY", raising=False)
    monkeypatch.setattr(module.Path, "home", classmethod(lambda cls: tmp_path))
    return module


def write_config(tmp_path, entry):
    (tmp_path / ".claude.json").write_text(json.dumps({"mcpServers": {"obsidian": entry}}), encoding="utf-8")


def test_environment_variable_wins(hook, tmp_path, monkeypatch):
    write_config(tmp_path, {"env": {"OBSIDIAN_API_KEY": "from-config"}})
    monkeypatch.setenv("OBSIDIAN_API_KEY", "from-env")
    assert hook.load_api_key() == "from-env"


def test_key_from_the_mcp_env(hook, tmp_path):
    write_config(tmp_path, {"command": "npx", "env": {"OBSIDIAN_API_KEY": " abc123 "}})
    assert hook.load_api_key() == "abc123"


@pytest.mark.parametrize("value", ["Bearer abc123", "bearer abc123", "abc123", "  Bearer   abc123  "])
def test_key_from_the_authorization_header_of_an_http_entry(hook, tmp_path, value):
    write_config(tmp_path, {"type": "http", "url": "https://127.0.0.1:27124/mcp", "headers": {"Authorization": value}})
    assert hook.load_api_key() == "abc123"


def test_header_name_is_case_insensitive_and_env_is_preferred_over_headers(hook, tmp_path):
    write_config(tmp_path, {"headers": {"authorization": "Bearer from-header"}})
    assert hook.load_api_key() == "from-header"
    write_config(tmp_path, {"env": {"OBSIDIAN_API_KEY": "from-env"}, "headers": {"Authorization": "Bearer from-header"}})
    assert hook.load_api_key() == "from-env"


@pytest.mark.parametrize(
    "entry",
    [{}, {"headers": {}}, {"headers": {"Authorization": "Bearer "}}, {"headers": {"Authorization": 5}}, {"env": {"OBSIDIAN_API_KEY": ""}}, {"env": "oops"}, "not-a-dict", None],
)
def test_missing_or_malformed_entries_give_no_key_and_never_raise(hook, tmp_path, entry):
    write_config(tmp_path, entry)
    assert hook.load_api_key() is None


def test_no_config_file_or_broken_json_gives_no_key(hook, tmp_path):
    assert hook.load_api_key() is None
    (tmp_path / ".claude.json").write_text("{not json", encoding="utf-8")
    assert hook.load_api_key() is None
    (tmp_path / ".claude.json").write_text(json.dumps({"mcpServers": {}}), encoding="utf-8")
    assert hook.load_api_key() is None
