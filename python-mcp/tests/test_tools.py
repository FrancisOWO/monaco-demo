from __future__ import annotations

from pathlib import Path

import pytest

from editor_mcp_fastmcp.tools import EditorTools, normalize_editor_path


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def status(self) -> dict:
        return {"connected": True}

    async def command(self, method: str, params: dict | None = None) -> dict:
        self.calls.append((method, params or {}))
        return {"method": method, "params": params or {}}


@pytest.mark.asyncio
async def test_open_file_reads_disk_and_sends_editor_command(tmp_path: Path) -> None:
    file_path = tmp_path / "main.py"
    file_path.write_text('print("hello")', encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    result = await tools.open_file(str(file_path), language="python")

    assert result["method"] == "editor.openFile"
    assert client.calls == [
        (
            "editor.openFile",
            {
                "path": normalize_editor_path(str(file_path)),
                "name": "main.py",
                "content": 'print("hello")',
                "language": "python",
            },
        )
    ]


@pytest.mark.asyncio
async def test_edit_file_can_save_to_disk_and_mark_editor_saved(tmp_path: Path) -> None:
    file_path = tmp_path / "main.go"
    file_path.write_text("old", encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.edit_file(str(file_path), "new", save=True)

    assert file_path.read_text(encoding="utf-8") == "new"
    assert client.calls[0] == (
        "editor.editFile",
        {"path": normalize_editor_path(str(file_path)), "content": "new"},
    )
    assert client.calls[1] == (
        "editor.markSaved",
        {"path": normalize_editor_path(str(file_path)), "content": "new"},
    )


@pytest.mark.asyncio
async def test_compare_files_reads_both_files(tmp_path: Path) -> None:
    original = tmp_path / "a.py"
    modified = tmp_path / "b.py"
    original.write_text("a = 1", encoding="utf-8")
    modified.write_text("a = 2", encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.compare_files(str(original), str(modified), language="python")

    method, params = client.calls[0]
    assert method == "editor.diffFiles"
    assert params["original"]["content"] == "a = 1"
    assert params["modified"]["content"] == "a = 2"
    assert params["original"]["language"] == "python"


@pytest.mark.asyncio
async def test_open_folder_requires_existing_directory(tmp_path: Path) -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.open_folder(str(tmp_path))

    assert client.calls == [
        ("editor.openFolder", {"path": normalize_editor_path(str(tmp_path))})
    ]

    with pytest.raises(ValueError):
        await tools.open_folder(str(tmp_path / "missing"))
