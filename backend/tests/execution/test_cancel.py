"""Tests for POST /recipes/{slug}/run's cancel-on-disconnect behavior.

Needs a real socket (see `_server.run_server`'s docstring) — `TestClient`
and `httpx.ASGITransport` both run the whole ASGI app to completion before
returning anything, so neither ever delivers a real `http.disconnect` to the
app when the test closes its side of the connection early.
"""

from __future__ import annotations

import tempfile
import time
from pathlib import Path

import httpx
from _server import run_server

from skillet.api.app import create_app
from skillet.execution import request as request_module


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def make_recipe(tmp_path: Path, recipe_py: str) -> Path:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        "[recipe]\n"
        'slug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n",
    )
    write(root / "g" / "10-x" / "recipe.py", recipe_py)
    return root


def test_client_disconnect_cancels_task_and_removes_tempdir(tmp_path, monkeypatch) -> None:
    marker = tmp_path / "finished.marker"
    root = make_recipe(
        tmp_path,
        "import asyncio\n"
        "from pathlib import Path\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.step('s', 'working', status='start')\n"
        "    await asyncio.sleep(5)\n"  # long enough that a real disconnect must interrupt it
        f"    Path({str(marker)!r}).write_text('done')\n"
        "    await ctx.emit.result({})\n",
    )

    # Record the exact tempdir parse_run_request stages uploads into, rather
    # than globbing the system temp dir and guessing which one is "ours".
    created_dirs: list[str] = []
    real_mkdtemp = tempfile.mkdtemp

    def recording_mkdtemp(*args: object, **kwargs: object) -> str:
        d = real_mkdtemp(*args, **kwargs)
        created_dirs.append(d)
        return d

    monkeypatch.setattr(request_module.tempfile, "mkdtemp", recording_mkdtemp)

    with run_server(create_app(recipes_root=root)) as base_url:
        with httpx.Client(base_url=base_url) as client:
            with client.stream(
                "POST", "/recipes/x/run", data={"params": "{}", "config": "{}"}
            ) as resp:
                for line in resp.iter_lines():
                    if line.startswith("data: "):
                        break  # got the "start" step — disconnect now, mid-run

        assert len(created_dirs) == 1
        tempdir = Path(created_dirs[0])

        deadline = time.monotonic() + 1.5
        while time.monotonic() < deadline and tempdir.exists():
            time.sleep(0.05)

    assert not tempdir.exists()  # removed promptly after the disconnect
    assert not marker.exists()  # the recipe's sleep(5) was actually interrupted
