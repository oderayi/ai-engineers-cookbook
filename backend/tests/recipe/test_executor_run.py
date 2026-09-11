"""Tests for skillet.recipe.executor.execute — the async run loop: timeout,
output/event caps, and the guaranteed single terminal event.
"""

import logging
from pathlib import Path

from skillet.recipe.context import FileBundle
from skillet.recipe.events import ErrorEvent, ResultEvent, StepEvent
from skillet.recipe.executor import execute, load_recipe

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes" / "demo"
ECHO = FIXTURES_ROOT / "10-echo"
ECHO_WITH_HELPER = FIXTURES_ROOT / "20-echo-with-helper"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


async def run_to_list(loaded, params, **kwargs) -> list:
    files = FileBundle(ECHO)  # unused by these fixtures; any valid dir works
    return [ev async for ev in execute(loaded, params, config={}, files=files, **kwargs)]


async def test_echo_runs_end_to_end_terminated_by_one_result() -> None:
    loaded = load_recipe(ECHO)
    events = await run_to_list(loaded, loaded.params_cls(message="hi"))

    assert isinstance(events[0], StepEvent)
    assert events[0].status == "start"
    assert isinstance(events[-1], ResultEvent)
    assert events[-1].data == {"message": "hi"}
    assert sum(isinstance(e, (ResultEvent, ErrorEvent)) for e in events) == 1


async def test_echo_with_helper_runs_end_to_end() -> None:
    loaded = load_recipe(ECHO_WITH_HELPER)
    events = await run_to_list(loaded, loaded.params_cls(message="hi"))
    assert isinstance(events[-1], ResultEvent)
    assert events[-1].data == {"message": "HI!"}


async def test_timeout_yields_single_terminal_error(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "import asyncio\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.step('slow', 'Sleeping', status='start')\n"
        "    await asyncio.sleep(10)\n"
        "    await ctx.emit.result({})\n",
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls(), timeout_s=0.05)

    assert isinstance(events[-1], ErrorEvent)
    assert events[-1].error_type == "timeout"
    assert len(events) == 2  # the step start, then exactly the timeout error
    assert sum(isinstance(e, (ResultEvent, ErrorEvent)) for e in events) == 1


async def test_output_byte_cap_yields_single_terminal_error(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    for i in range(1000):\n"
        "        await ctx.emit.token('x' * 100)\n"
        "    await ctx.emit.result({})\n",
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls(), max_bytes=500, max_events=100_000)

    assert isinstance(events[-1], ErrorEvent)
    assert events[-1].error_type == "output_limit"
    assert sum(isinstance(e, (ResultEvent, ErrorEvent)) for e in events) == 1


async def test_output_event_count_cap_yields_single_terminal_error(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    for i in range(1000):\n"
        "        await ctx.emit.token('x')\n"
        "    await ctx.emit.result({})\n",
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls(), max_events=5, max_bytes=10_000_000)

    assert isinstance(events[-1], ErrorEvent)
    assert events[-1].error_type == "output_limit"
    assert len(events) == 6  # 5 tokens let through, then the cap error


async def test_recipe_exception_yields_single_terminal_error(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.step('a', 'A', status='start')\n"
        "    raise ValueError('boom')\n",
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls())

    assert isinstance(events[-1], ErrorEvent)
    assert events[-1].error_type == "recipe_error"
    assert "boom" not in "".join(str(e) for e in events[:-1])  # no traceback leaked pre-error
    assert sum(isinstance(e, (ResultEvent, ErrorEvent)) for e in events) == 1


async def test_recipe_exception_traceback_not_in_error_event_message(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    raise ValueError('boom')\n",
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls())
    error = events[-1]
    assert "Traceback" not in error.message
    assert "recipe.py" not in error.message


async def test_recipe_with_no_terminal_event_gets_one_injected(tmp_path: Path) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    pass\n",  # forgets to emit anything
    )
    loaded = load_recipe(tmp_path)
    events = await run_to_list(loaded, loaded.params_cls())

    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].error_type == "recipe_error"


async def test_unclosed_step_is_logged_not_raised(tmp_path: Path, caplog) -> None:
    write(
        tmp_path / "recipe.py",
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await ctx.emit.step('never-finished', 'Oops', status='start')\n"
        "    await ctx.emit.result({})\n",
    )
    loaded = load_recipe(tmp_path)
    with caplog.at_level(logging.WARNING):
        events = await run_to_list(loaded, loaded.params_cls())

    assert isinstance(events[-1], ResultEvent)  # still completes normally
    assert any("never-finished" in r.getMessage() for r in caplog.records)


async def test_no_lingering_task_after_timeout(tmp_path: Path) -> None:
    import asyncio

    write(
        tmp_path / "recipe.py",
        "import asyncio\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    await asyncio.sleep(10)\n",
    )
    loaded = load_recipe(tmp_path)
    baseline = len(asyncio.all_tasks())
    await run_to_list(loaded, loaded.params_cls(), timeout_s=0.05)
    # allow the event loop one tick to finish tearing down the cancelled task
    await asyncio.sleep(0)
    assert len(asyncio.all_tasks()) <= baseline
