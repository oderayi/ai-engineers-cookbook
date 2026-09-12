"""A real, ephemeral ASGI server for tests that need genuine socket-level
streaming and disconnect behavior.

Confirmed empirically (see the Task 8 commit message): neither
`fastapi.testclient.TestClient` nor `httpx.AsyncClient(transport=
httpx.ASGITransport(...))` actually stream — both run the whole ASGI app to
completion, buffering every chunk it produces, before handing back anything
to the calling test, and neither ever delivers an ASGI `http.disconnect`
message to the app when the test-side response is closed early. Real
incremental delivery and cancel-on-disconnect behavior can only be observed
over a real socket, so `test_run_endpoint.py`'s streaming-order test and all
of `test_cancel.py` spin one up via `run_server()` below; every other test in
this package uses the normal in-process `TestClient`.
"""

from __future__ import annotations

import contextlib
import socket
import threading
import time
from collections.abc import Iterator

import uvicorn
from fastapi import FastAPI


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def run_server(app: FastAPI) -> Iterator[str]:
    """Serve `app` on a real localhost port for the duration of the `with`
    block, yielding its base URL (e.g. `"http://127.0.0.1:54321"`).

    A fresh server per call (not shared/session-scoped) since each test
    builds its own `recipes_root`.
    """
    port = _free_port()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    deadline = time.monotonic() + 5.0
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.02)
    if not server.started:
        raise RuntimeError("test uvicorn server did not start within 5s")

    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        thread.join(timeout=5.0)
