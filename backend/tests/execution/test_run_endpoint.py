"""Tests for POST /recipes/{slug}/run — endpoint contract + streaming.

Rejections (404/422/413) and the response shape use `TestClient` (fast,
in-process). The two tests that need genuine wall-clock streaming fidelity
(first byte arriving before the recipe finishes) use a real server — see
`_server.run_server` for why `TestClient` can't prove that on its own.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
from _server import run_server
from fastapi.testclient import TestClient

from skillet.api.app import create_app

DEMO_FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


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


def iter_sse_data_lines(text: str) -> list[str]:
    """Pull each `data: ...` line's payload out of a raw SSE response body."""
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


def test_unknown_slug_is_404() -> None:
    client = TestClient(create_app(recipes_root=DEMO_FIXTURES_ROOT))
    resp = client.post("/recipes/does-not-exist/run", data={"params": "{}", "config": "{}"})
    assert resp.status_code == 404


def test_invalid_params_is_422_before_recipe_runs(tmp_path: Path) -> None:
    marker = tmp_path / "ran.marker"
    root = make_recipe(
        tmp_path,
        "from pydantic import Field\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n"
        "    question: str = Field(..., min_length=1)\n\n"
        "async def run(params, ctx):\n"
        f"    open({str(marker)!r}, 'w').write('ran')\n"
        "    await ctx.emit.result({})\n",
    )
    client = TestClient(create_app(recipes_root=root))
    resp = client.post(
        "/recipes/x/run", data={"params": "{}", "config": "{}"}
    )  # missing required `question`

    assert resp.status_code == 422
    assert not marker.exists()  # recipe code never ran


def test_undeclared_config_key_is_422_before_recipe_runs(tmp_path: Path) -> None:
    marker = tmp_path / "ran.marker"
    root = make_recipe(
        tmp_path,
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        f"    open({str(marker)!r}, 'w').write('ran')\n"
        "    await ctx.emit.result({})\n",
    )
    client = TestClient(create_app(recipes_root=root))
    resp = client.post(
        "/recipes/x/run",
        data={"params": "{}", "config": json.dumps({"SNEAKY_KEY": "x"})},
    )

    assert resp.status_code == 422
    assert not marker.exists()


def test_upload_over_cap_is_413_before_recipe_runs(tmp_path: Path) -> None:
    marker = tmp_path / "ran.marker"
    root = make_recipe(
        tmp_path,
        "from pydantic import Field\n\n"
        "from skillet.recipe import Params as BaseParams\n"
        "from skillet.recipe.params import UploadedFile\n\n"
        "class Params(BaseParams):\n"
        "    documents: list[UploadedFile] = Field(\n"
        '        default_factory=list, json_schema_extra={"accept": [".txt"]}\n'
        "    )\n\n"
        "async def run(params, ctx):\n"
        f"    open({str(marker)!r}, 'w').write('ran')\n"
        "    await ctx.emit.result({})\n",
    )
    client = TestClient(create_app(recipes_root=root))
    resp = client.post(
        "/recipes/x/run",
        data={"params": "{}", "config": "{}"},
        files=[("files[documents][]", ("bad.exe", b"data", "application/octet-stream"))],
    )

    assert resp.status_code == 413
    assert not marker.exists()


def test_content_type_is_event_stream() -> None:
    client = TestClient(create_app(recipes_root=DEMO_FIXTURES_ROOT))
    resp = client.post(
        "/recipes/echo/run", data={"params": json.dumps({"message": "hi"}), "config": "{}"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


def test_events_stream_in_order_with_exactly_one_terminal_event() -> None:
    client = TestClient(create_app(recipes_root=DEMO_FIXTURES_ROOT))
    resp = client.post(
        "/recipes/echo/run", data={"params": json.dumps({"message": "hi"}), "config": "{}"}
    )

    events = [json.loads(line) for line in iter_sse_data_lines(resp.text)]
    types = [e["type"] for e in events]

    assert types[0] == "step"
    assert types[-1] == "result"
    assert sum(t in ("result", "error") for t in types) == 1
    assert events[-1]["data"] == {"message": "hi"}


def test_first_byte_arrives_well_before_recipe_finishes(tmp_path: Path) -> None:
    """A deliberately-slow fixture recipe proves the response isn't buffered
    whole before any of it reaches the client — over a real socket, since
    neither `TestClient` nor `httpx.ASGITransport` can show this (see
    `_server.run_server`'s docstring: both run the whole app to completion
    before returning anything, confirmed empirically).
    """
    root = make_recipe(
        tmp_path,
        "import asyncio\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.step('s', 'working', status='start')\n"
        "    await asyncio.sleep(0.5)\n"
        "    await ctx.emit.result({})\n",
    )

    with run_server(create_app(recipes_root=root)) as base_url:
        start = time.monotonic()
        first_event_at: float | None = None
        with httpx.Client(base_url=base_url) as client:
            with client.stream(
                "POST", "/recipes/x/run", data={"params": "{}", "config": "{}"}
            ) as resp:
                # Read to completion (not breaking on the first line) so
                # `total` reflects the recipe's actual full run time,
                # including its 0.5s sleep — otherwise breaking early would
                # make `total` measure nothing but the time-to-first-byte
                # itself, defeating the comparison below.
                for line in resp.iter_lines():
                    if line.startswith("data: ") and first_event_at is None:
                        first_event_at = time.monotonic() - start
        total = time.monotonic() - start

    assert first_event_at is not None
    # Relative, not an absolute threshold: the first event (the "start" step)
    # is emitted before the recipe's own 0.5s sleep, so it must arrive in
    # well under half the total request time regardless of machine speed.
    assert first_event_at < total * 0.5
