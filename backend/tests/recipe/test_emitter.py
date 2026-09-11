"""Tests for skillet.recipe.emitter — the dumb event sink recipes call."""

import logging

import pytest

from skillet.recipe.emitter import Emitter
from skillet.recipe.events import (
    ArtifactEvent,
    ErrorEvent,
    LogEvent,
    ResultEvent,
    StepEvent,
    TokenEvent,
    ToolCallEvent,
)


def fake_clock():
    """Returns a zero-arg callable whose successive calls yield 0.0, 1.0, 2.0, ..."""
    counter = iter(range(1000))

    def _clock() -> float:
        return float(next(counter))

    return _clock


@pytest.fixture
def sink():
    events = []

    async def _sink(event):
        events.append(event)

    _sink.events = events
    return _sink


async def test_step_pushes_step_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.step("idx", "Indexing", status="start")
    assert isinstance(sink.events[0], StepEvent)
    assert sink.events[0].id == "idx"
    assert sink.events[0].status == "start"


async def test_token_pushes_token_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.token("hello")
    assert isinstance(sink.events[0], TokenEvent)
    assert sink.events[0].text == "hello"


async def test_tool_call_pushes_tool_call_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.tool_call("tc1", "search", {"q": "x"}, result={"ok": True})
    ev = sink.events[0]
    assert isinstance(ev, ToolCallEvent)
    assert ev.args == {"q": "x"}
    assert ev.result == {"ok": True}


async def test_log_pushes_log_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.log("cache miss", level="warn")
    ev = sink.events[0]
    assert isinstance(ev, LogEvent)
    assert ev.level == "warn"


async def test_artifact_pushes_artifact_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.artifact("a1", kind="markdown", name="Chunks", data="...")
    ev = sink.events[0]
    assert isinstance(ev, ArtifactEvent)
    assert ev.kind == "markdown"


async def test_result_pushes_result_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.result({"n": 1})
    ev = sink.events[0]
    assert isinstance(ev, ResultEvent)
    assert ev.data == {"n": 1}


async def test_error_pushes_error_event(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.error("timeout", "exceeded 90s")
    ev = sink.events[0]
    assert isinstance(ev, ErrorEvent)
    assert ev.error_type == "timeout"
    assert ev.recoverable is False


async def test_out_of_order_calls_are_not_blocked(sink) -> None:
    """Ordering/terminal-event enforcement is the executor's job, not the
    Emitter's — calling result() before any step() must not raise."""
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.result({"n": 1})
    await emitter.token("late")
    assert len(sink.events) == 2


async def test_ts_increases_across_calls(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.step("a", "A", status="start")
    await emitter.step("a", "A", status="finish")
    assert sink.events[1].ts > sink.events[0].ts


def test_elapsed_matches_internal_clock(sink) -> None:
    # construction itself consumes the clock's first tick as `self._start`
    clock = fake_clock()
    emitter = Emitter(sink, clock=clock)
    assert emitter.elapsed() == 1.0  # clock() - start == 1.0 - 0.0
    assert emitter.elapsed() == 2.0  # fake_clock advances by 1.0 each call


async def test_unclosed_step_tracked(sink) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.step("a", "A", status="start")
    assert emitter.unclosed_step_ids == ["a"]
    await emitter.step("a", "A", status="finish")
    assert emitter.unclosed_step_ids == []


async def test_audit_unclosed_steps_logs_warning_not_raise(sink, caplog) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.step("a", "A", status="start")

    with caplog.at_level(logging.WARNING):
        emitter.audit_unclosed_steps()  # must not raise

    assert any("a" in record.getMessage() for record in caplog.records)


async def test_audit_with_no_unclosed_steps_logs_nothing(sink, caplog) -> None:
    emitter = Emitter(sink, clock=fake_clock())
    await emitter.step("a", "A", status="start")
    await emitter.step("a", "A", status="finish")

    with caplog.at_level(logging.WARNING):
        emitter.audit_unclosed_steps()

    assert caplog.records == []
