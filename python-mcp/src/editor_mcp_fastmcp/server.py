from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from .tools import EditorTools

mcp = FastMCP("monaco-editor-fastmcp")
tools = EditorTools()


@mcp.tool()
async def editor_status() -> dict[str, Any]:
    """Get editor connection status, workspace, active file, and opened files."""
    return await tools.editor_status()


@mcp.tool()
async def open_folder(path: str) -> dict[str, Any]:
    """Set the workspace folder used by external agents and sync it to the editor."""
    return await tools.open_folder(path)


@mcp.tool()
async def open_file(path: str, language: str | None = None) -> dict[str, Any]:
    """Read a local file from disk and open it in the editor."""
    return await tools.open_file(path, language)


@mcp.tool()
async def new_file(
    path: str | None = None,
    name: str | None = None,
    language: str = "python",
    content: str | None = None,
) -> dict[str, Any]:
    """Create a new editor file, optionally using an initial content string."""
    return await tools.new_file(path, name, language, content)


@mcp.tool()
async def edit_file(path: str, content: str, save: bool = False) -> dict[str, Any]:
    """Replace an opened file's editor content and optionally write it to disk."""
    return await tools.edit_file(path, content, save)


@mcp.tool()
async def get_file_content(path: str | None = None) -> dict[str, Any]:
    """Read the current editor content for an opened file, or the active file if omitted."""
    return await tools.get_file_content(path)


@mcp.tool()
async def delete_file(path: str, delete_from_disk: bool = False) -> dict[str, Any]:
    """Close a file in the editor and optionally delete it from disk."""
    return await tools.delete_file(path, delete_from_disk)


@mcp.tool()
async def compare_files(
    original_path: str,
    modified_path: str,
    language: str | None = None,
) -> dict[str, Any]:
    """Open Monaco Diff view for two local files."""
    return await tools.compare_files(original_path, modified_path, language)


import os


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "stdio")
    kwargs: dict[str, Any] = {"transport": transport}
    if transport in ("sse", "http", "streamable-http"):
        kwargs["port"] = int(os.getenv("MCP_PORT", "3002"))
    mcp.run(**kwargs)


if __name__ == "__main__":
    main()
