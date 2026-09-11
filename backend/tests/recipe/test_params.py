"""Tests for skillet.recipe.params — the Params base and UploadedFile field."""

import pytest
from pydantic import Field, ValidationError

from skillet.recipe.params import Params, UploadedFile


class SampleParams(Params):
    question: str = Field(..., min_length=1, description="What to ask.")
    top_k: int = Field(4, ge=1, le=20, description="How many chunks.")
    verbose: bool = Field(False, description="Show intermediate steps.")
    documents: list[UploadedFile] = Field(
        default_factory=list,
        description="Docs to index.",
        json_schema_extra={"accept": [".txt", ".md", ".pdf"], "max_files": 10},
    )


def test_json_schema_field_types() -> None:
    schema = SampleParams.model_json_schema()
    props = schema["properties"]

    assert props["question"]["type"] == "string"
    assert props["top_k"]["type"] == "integer"
    assert props["top_k"]["minimum"] == 1
    assert props["top_k"]["maximum"] == 20
    assert props["verbose"]["type"] == "boolean"
    assert props["documents"]["type"] == "array"


def test_json_schema_extra_carries_file_metadata() -> None:
    schema = SampleParams.model_json_schema()
    documents = schema["properties"]["documents"]

    assert documents["accept"] == [".txt", ".md", ".pdf"]
    assert documents["max_files"] == 10


def test_valid_construction() -> None:
    p = SampleParams(question="How many vacation days?", top_k=3)
    assert p.question == "How many vacation days?"
    assert p.top_k == 3
    assert p.verbose is False
    assert p.documents == []


def test_constraint_violation_rejected() -> None:
    with pytest.raises(ValidationError):
        SampleParams(question="hi", top_k=999)  # exceeds le=20


def test_missing_required_field_rejected() -> None:
    with pytest.raises(ValidationError):
        SampleParams()  # question is required


def test_params_forbids_undeclared_fields() -> None:
    """Security property: only declared inputs are ever accepted."""
    with pytest.raises(ValidationError):
        SampleParams(question="hi", not_a_real_field="sneaky")


def test_uploaded_file_text_accessor() -> None:
    f = UploadedFile(filename="notes.txt", content=b"hello world")
    assert f.text() == "hello world"
    assert f.filename == "notes.txt"


def test_uploaded_file_is_a_pydantic_instance_field() -> None:
    """UploadedFile must be usable inside a Params model field, constructed
    directly (not parsed from a JSON-encoded string) — files never travel as
    JSON body content."""
    p = SampleParams(question="hi", documents=[UploadedFile("a.txt", b"x")])
    assert p.documents[0].text() == "x"
