from __future__ import annotations

import os
from typing import Any

import httpx


class EditorControlClient:
    """HTTP client for the existing editor-control bridge."""

    def __init__(self, server_url: str | None = None, timeout: float = 10.0) -> None:
        self.server_url = (server_url or os.getenv("EDITOR_MCP_SERVER_URL") or "http://localhost:3000").rstrip("/")
        self.timeout = timeout

    async def status(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.server_url}/editor-control/status")
            response.raise_for_status()
            return response.json()

    async def command(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        timeout_ms: int = 10_000,
    ) -> Any:
        payload = {
            "method": method,
            "params": params or {},
            "timeoutMs": timeout_ms,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.server_url}/editor-control/command", json=payload)
            data = response.json() if response.content else {}

        if response.is_error:
            raise RuntimeError(data.get("error") or f"Editor command failed: {response.status_code}")

        return data.get("result")
