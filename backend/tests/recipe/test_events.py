"""Tests for skillet.recipe.events — the 7 event types and their wire format."""

import json

import pytest
from pydantic import ValidationError

from skillet.recipe.events import (
    ArtifactEvent,
    ErrorEvent,
    LogEvent,
    ResultEvent,
    StepEvent,
    ToolCallEvent,
    parse_event,
)


def test_step_event_wire_shape() -> None:
    ev = StepEvent(id="index", name="Indexing documents", status="start", ts=1.23)
    dumped = json.loads(ev.model_dump_json())
    assert dumped == {
        "type": "step",
        "id": "index",
        "name": "Indexing documents",
        "status": "start",
        "detail": None,
        "ts": 1.23,
    }


def test_token_event_wire_shape() -> None:
    from skillet.recipe.events import TokenEvent

    ev = TokenEvent(text="Paris")
    assert json.loads(ev.model_dump_json()) == {"type": "token", "text": "Paris"}


def test_tool_call_event_wire_shape() -> None:
    ev = ToolCallEvent(
        id="tc1", name="web_search", args={"q": "paris"}, result={"ok": True}, ts=4.5
    )
    dumped = json.loads(ev.model_dump_json())
    assert dumped["type"] == "tool_call"
    assert dumped["args"] == {"q": "paris"}
    assert dumped["result"] == {"ok": True}


def test_log_event_wire_shape() -> None:
    ev = LogEvent(level="info", message="cache miss", ts=4.6)
    assert json.loads(ev.model_dump_json()) == {
        "type": "log",
        "level": "info",
        "message": "cache miss",
        "ts": 4.6,
    }


def test_artifact_event_kinds() -> None:
    for kind in ("json", "table", "markdown", "file"):
        ev = ArtifactEvent(id="a1", kind=kind, name="thing", data={"x": 1})
        assert json.loads(ev.model_dump_json())["kind"] == kind

    with pytest.raises(ValidationError):
        ArtifactEvent(id="a1", kind="not-a-real-kind", name="thing")


def test_result_event_wire_shape() -> None:
    ev = ResultEvent(data={"chunks_used": 4}, ts=9.9)
    assert json.loads(ev.model_dump_json()) == {
        "type": "result",
        "data": {"chunks_used": 4},
        "ts": 9.9,
    }


def test_error_event_error_types() -> None:
    for error_type in ("timeout", "output_limit", "recipe_error", "bad_input", "upstream_error"):
        ev = ErrorEvent(error_type=error_type, message="boom", ts=90.0)
        assert json.loads(ev.model_dump_json())["error_type"] == error_type

    with pytest.raises(ValidationError):
        ErrorEvent(error_type="not-a-real-type", message="boom", ts=90.0)


def test_error_event_recoverable_defaults_false() -> None:
    ev = ErrorEvent(error_type="timeout", message="exceeded 90s", ts=90.0)
    assert ev.recoverable is False


def test_parse_event_round_trips_every_type() -> None:
    events = [
        StepEvent(id="a", name="Step A", status="start", ts=1.0),
        ErrorEvent(error_type="recipe_error", message="oops", ts=2.0),
        ResultEvent(data={}, ts=3.0),
    ]
    for ev in events:
        parsed = parse_event(ev.model_dump_json())
        assert parsed == ev


def test_parse_event_rejects_unknown_type() -> None:
    with pytest.raises(ValidationError):
        parse_event(json.dumps({"type": "not_a_type"}))
