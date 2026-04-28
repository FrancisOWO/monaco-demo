from __future__ import annotations

from pathlib import Path
from typing import Any

from .client import EditorControlClient


def normalize_editor_path(file_path: str) -> str:
    return str(Path(file_path).resolve()).replace("\\", "/")


def file_payload(file_path: str, content: str, language: str | None = None) -> dict[str, Any]:
    path = Path(file_path)
    payload: dict[str, Any] = {
        "path": normalize_editor_path(file_path),
        "name": path.name,
        "content": content,
    }
    if language:
        payload["language"] = language
    return payload


class EditorTools:
    def __init__(self, client: EditorControlClient | None = None) -> None:
        self.client = client or EditorControlClient()

    async def editor_status(self) -> dict[str, Any]:
        return await self.client.status()

    async def open_folder(self, path: str) -> dict[str, Any]:
        folder = Path(path)
        if not folder.is_dir():
            raise ValueError("path is not a directory")

        return await self.client.command(
            "editor.openFolder",
            {"path": normalize_editor_path(path)},
        )

    async def open_file(self, path: str, language: str | None = None) -> dict[str, Any]:
        content = Path(path).read_text(encoding="utf-8")
        return await self.client.command(
            "editor.openFile",
            file_payload(path, content, language),
        )

    async def new_file(
        self,
        path: str | None = None,
        name: str | None = None,
        language: str = "python",
        content: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "language": language,
        }
        if path:
            params["path"] = normalize_editor_path(path)
        if name:
            params["name"] = name
        if content is not None:
            params["content"] = content

        return await self.client.command("editor.newFile", params)

    async def edit_file(self, path: str, content: str, save: bool = False) -> dict[str, Any]:
        editor_path = normalize_editor_path(path)
        result = await self.client.command(
            "editor.editFile",
            {"path": editor_path, "content": content},
        )

        if save:
            Path(path).write_text(content, encoding="utf-8")
            await self.client.command(
                "editor.markSaved",
                {"path": editor_path, "content": content},
            )

        return result

    async def get_file_content(self, path: str | None = None) -> dict[str, Any]:
        params = {"path": normalize_editor_path(path)} if path else {}
        return await self.client.command("editor.getFileContent", params)

    async def delete_file(self, path: str, delete_from_disk: bool = False) -> dict[str, Any]:
        editor_path = normalize_editor_path(path)
        result = await self.client.command("editor.deleteFile", {"path": editor_path})

        if delete_from_disk:
            Path(path).unlink()

        return result

    async def compare_files(
        self,
        original_path: str,
        modified_path: str,
        language: str | None = None,
    ) -> dict[str, Any]:
        original_content = Path(original_path).read_text(encoding="utf-8")
        modified_content = Path(modified_path).read_text(encoding="utf-8")

        return await self.client.command(
            "editor.diffFiles",
            {
                "original": file_payload(original_path, original_content, language),
                "modified": file_payload(modified_path, modified_content, language),
            },
        )
