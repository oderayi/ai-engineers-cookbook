"""Key hygiene — the important test, per docs/SPEC-execution.md's own
Testing Strategy: run a recipe with a sentinel key value; assert it appears
in neither server logs, nor the run's tempdir, nor any client-visible error.

This test exists because writing it surfaced two real gaps that got fixed
alongside it (see the Task 9 commit): `RedactingFilter` was built in Task 7
but never attached to any real logger, and a terminal `ErrorEvent.message`
was serialized to the client completely unredacted — `execute()` builds it
from a recipe's raw `str(exc)`, and nothing downstream touched it before
this fix.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app

SENTINEL = "sk-sentinel-do-not-leak-77b1c9f04e2a4d0a9b6e1c3f00112233"


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
        "order = 10\nestimated_runtime_seconds = 1\n"
        '\n[[recipe.env]]\nkey = "OPENAI_API_KEY"\nprovider = "openai"\n',
    )
    write(root / "g" / "10-x" / "recipe.py", recipe_py)
    return root


def iter_sse_data_lines(text: str) -> list[str]:
    return [line[len("data: ") :] for line in text.splitlines() if line.startswith("data: ")]


def test_sentinel_key_absent_from_logs_and_client_visible_error(tmp_path, caplog) -> None:
    """A recipe that both logs the sentinel directly and raises it in an
    exception message must leak it nowhere: not in captured log output, not
    in the terminal `ErrorEvent` the client receives.
    """
    root = make_recipe(
        tmp_path,
        "import logging\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "logger = logging.getLogger('skillet.recipe.executor')\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    # Simulates an upstream client logging the key it's about to\n"
        "    # call out with, then failing and echoing it back in the\n"
        "    # exception message — the two realistic leak vectors.\n"
        "    logger.info('calling upstream with key %s', ctx.config['OPENAI_API_KEY'])\n"
        "    raise RuntimeError(f\"upstream rejected key {ctx.config['OPENAI_API_KEY']}\")\n",
    )

    client = TestClient(create_app(recipes_root=root))
    with caplog.at_level(logging.INFO):
        resp = client.post(
            "/recipes/x/run",
            data={"params": "{}", "config": json.dumps({"OPENAI_API_KEY": SENTINEL})},
        )

    assert resp.status_code == 200
    assert SENTINEL not in caplog.text  # the logger.info(...) call, redacted

    events = [json.loads(line) for line in iter_sse_data_lines(resp.text)]
    assert events[-1]["type"] == "error"
    assert events[-1]["error_type"] == "recipe_error"
    assert SENTINEL not in events[-1]["message"]  # the raised exception, redacted
    assert SENTINEL not in resp.text  # belt-and-suspenders: nowhere in the raw response


def test_sentinel_key_absent_from_run_tempdir(tmp_path, monkeypatch) -> None:
    """The run's own tempdir only ever holds staged *uploaded file bytes*
    (see execution/request.py) — config never flows into it by
    construction. Proven directly by inspecting the tempdir's contents at
    the exact moment of cleanup (intercepting `stream.py`'s `shutil.rmtree`
    call) rather than after the fact — by the time a buffered `TestClient`
    response returns, the tempdir has already been deleted, which would
    make a post-hoc scan for it vacuously pass without proving anything.
    """
    import shutil

    from skillet.execution import stream as stream_module

    root = make_recipe(
        tmp_path,
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.result({})\n",
    )

    inspected: list[Path] = []
    real_rmtree = shutil.rmtree

    def inspecting_rmtree(path: str, *args: object, **kwargs: object) -> None:
        tempdir = Path(path)
        for f in tempdir.rglob("*"):
            if f.is_file():
                assert SENTINEL.encode() not in f.read_bytes()
        inspected.append(tempdir)
        real_rmtree(path, *args, **kwargs)

    monkeypatch.setattr(stream_module.shutil, "rmtree", inspecting_rmtree)

    client = TestClient(create_app(recipes_root=root))
    resp = client.post(
        "/recipes/x/run",
        data={"params": "{}", "config": json.dumps({"OPENAI_API_KEY": SENTINEL})},
    )

    assert resp.status_code == 200
    assert len(inspected) == 1  # confirms the interception actually ran, not skipped
