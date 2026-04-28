from __future__ import annotations

from pathlib import Path

import pytest

from editor_mcp_fastmcp.tools import EditorTools, normalize_editor_path, file_payload


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


@pytest.mark.asyncio
async def test_editor_status_delegates_to_client() -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    result = await tools.editor_status()

    assert result == {"connected": True}
    assert client.calls == []


@pytest.mark.asyncio
async def test_new_file_sends_optional_params() -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.new_file(name="hello.py", content="print('hi')")

    method, params = client.calls[0]
    assert method == "editor.newFile"
    assert params["language"] == "python"
    assert params["name"] == "hello.py"
    assert params["content"] == "print('hi')"
    assert "path" not in params


@pytest.mark.asyncio
async def test_new_file_with_path() -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.new_file(path="/tmp/demo.py", language="javascript")

    method, params = client.calls[0]
    assert method == "editor.newFile"
    assert params["language"] == "javascript"
    assert params["path"] == normalize_editor_path("/tmp/demo.py")
    assert "content" not in params


@pytest.mark.asyncio
async def test_get_file_content_with_path() -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.get_file_content("/some/file.py")

    method, params = client.calls[0]
    assert method == "editor.getFileContent"
    assert "path" in params


@pytest.mark.asyncio
async def test_get_file_content_without_path() -> None:
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.get_file_content()

    method, params = client.calls[0]
    assert method == "editor.getFileContent"
    assert params == {}


@pytest.mark.asyncio
async def test_delete_file_closes_in_editor_only(tmp_path: Path) -> None:
    file_path = tmp_path / "scratch.py"
    file_path.write_text("x", encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.delete_file(str(file_path))

    assert file_path.exists()  # still on disk
    assert client.calls == [
        ("editor.deleteFile", {"path": normalize_editor_path(str(file_path))})
    ]


@pytest.mark.asyncio
async def test_delete_file_can_remove_from_disk(tmp_path: Path) -> None:
    file_path = tmp_path / "scratch.py"
    file_path.write_text("x", encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.delete_file(str(file_path), delete_from_disk=True)

    assert not file_path.exists()


@pytest.mark.asyncio
async def test_edit_file_without_save_does_not_write_disk(tmp_path: Path) -> None:
    file_path = tmp_path / "main.py"
    file_path.write_text("original", encoding="utf-8")
    client = FakeClient()
    tools = EditorTools(client)  # type: ignore[arg-type]

    await tools.edit_file(str(file_path), "updated")

    assert file_path.read_text(encoding="utf-8") == "original"
    assert len(client.calls) == 1
    assert client.calls[0][0] == "editor.editFile"


def test_normalize_editor_path_converts_backslashes() -> None:
    result = normalize_editor_path("C:\\Users\\test\\file.py")
    assert "\\" not in result
    assert result.startswith("C:/Users/test/file.py") or result.startswith("/c/Users/test/file.py")


def test_file_payload_includes_optional_language() -> None:
    payload = file_payload("/tmp/a.py", "hello", "python")
    assert payload["language"] == "python"

    payload_no_lang = file_payload("/tmp/a.py", "hello")
    assert "language" not in payload_no_lang
