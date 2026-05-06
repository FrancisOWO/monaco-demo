from __future__ import annotations

from pathlib import Path
from typing import Any

from .client import EditorControlClient


import re

def normalize_editor_path(file_path: str) -> str:
    # 编辑器虚拟路径（如 /test.py）以 / 开头但不含 Windows 驱动器前缀（/C:/、/D:/），
    # 这些路径不应被 resolve 转成磁盘绝对路径
    if file_path.startswith("/") and not re.match(r"^/[A-Za-z]:", file_path):
        return file_path
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
        original = await self._resolve_file_content(original_path, language)
        modified = await self._resolve_file_content(modified_path, language)

        return await self.client.command(
            "editor.diffFiles",
            {
                "original": {
                    "path": original["path"],
                    "name": original["name"],
                    "content": original["content"],
                    "language": language or original.get("language"),
                },
                "modified": {
                    "path": modified["path"],
                    "name": modified["name"],
                    "content": modified["content"],
                    "language": language or modified.get("language"),
                },
            },
        )

    async def _resolve_file_content(
        self, file_path: str, language: str | None = None
    ) -> dict[str, Any]:
        """从编辑器虚拟文件系统或磁盘解析文件内容。
        先尝试 editor.getFileContent（支持未落盘的虚拟文件），找不到再回退磁盘。
        """
        paths_to_try = [normalize_editor_path(file_path), file_path]
        for try_path in paths_to_try:
            try:
                snapshot = await self.client.command(
                    "editor.getFileContent", {"path": try_path}
                )
                return {
                    "path": str(snapshot.get("path", try_path)),
                    "content": str(snapshot.get("content", "")),
                    "name": str(snapshot.get("name") or Path(file_path).name),
                    "language": snapshot.get("language"),
                }
            except Exception as e:
                if "File is not open" in str(e):
                    continue
                raise
        # 编辑器中未找到，回退磁盘
        content = Path(file_path).read_text(encoding="utf-8")
        return {
            "path": normalize_editor_path(file_path),
            "content": content,
            "name": Path(file_path).name,
            "language": language,
        }
