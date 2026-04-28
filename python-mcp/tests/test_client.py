from __future__ import annotations

import httpx
import pytest

from editor_mcp_fastmcp.client import EditorControlClient


@pytest.mark.asyncio
async def test_status_requests_editor_control_status(monkeypatch: pytest.MonkeyPatch) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/editor-control/status"
        return httpx.Response(200, json={"connected": True})

    transport = httpx.MockTransport(handler)

    class PatchedAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, transport=transport, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", PatchedAsyncClient)
    client = EditorControlClient("http://example.test")

    assert await client.status() == {"connected": True}


@pytest.mark.asyncio
async def test_command_reports_editor_bridge_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "Editor is not connected"})

    transport = httpx.MockTransport(handler)

    class PatchedAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, transport=transport, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", PatchedAsyncClient)
    client = EditorControlClient("http://example.test")

    with pytest.raises(RuntimeError, match="Editor is not connected"):
        await client.command("editor.status")
