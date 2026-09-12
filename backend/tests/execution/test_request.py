"""Tests for skillet.execution.request.parse_run_request.

Builds tiny real recipe fixtures inline via `tmp_path` (matching
`tests/recipe/test_api_recipe_detail.py`'s own pattern) with a `Params`
class that declares a real `list[UploadedFile]` field (with `accept` /
`max_files` hints), since the existing demo fixtures under
`tests/fixtures/recipes/demo/` don't have one.

`parse_run_request` takes an already-parsed Starlette `FormData` (not a raw
`Request`) — see the doc comment on `parse_run_request` for why.
"""

import io
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.datastructures import FormData, UploadFile

from skillet.execution import request as request_module
from skillet.execution.request import parse_run_request
from skillet.recipe.discovery import DiscoveredRecipe, discover
from skillet.recipe.executor import LoadedRecipe, load_recipe

RECIPE_PY = '''
from pydantic import Field

from skillet.recipe import Params as BaseParams
from skillet.recipe.params import UploadedFile


class Params(BaseParams):
    question: str = Field(..., min_length=1)
    top_k: int = Field(4, ge=1, le=20)
    documents: list[UploadedFile] = Field(
        default_factory=list,
        description="Docs to index.",
        json_schema_extra={"accept": [".txt", ".md"], "max_files": 10},
    )


async def run(params, ctx):
    await ctx.emit.result({})
'''


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def make_recipe(tmp_path: Path, *, env_toml: str = "") -> tuple[DiscoveredRecipe, LoadedRecipe]:
    root = tmp_path / "recipes"
    write(root / "g" / "group.toml", '[group]\nid = "g"\ntitle = "G"\norder = 1\n')
    write(
        root / "g" / "10-x" / "recipe.toml",
        "[recipe]\n"
        'slug = "x"\ntitle = "X"\nsummary = "..."\ndifficulty = "basic"\n'
        "order = 10\nestimated_runtime_seconds = 1\n" + env_toml,
    )
    write(root / "g" / "10-x" / "recipe.py", RECIPE_PY)

    found = discover(root).get("x")
    assert found is not None
    loaded = load_recipe(found.dir)
    return found, loaded


def upload(filename: str, content: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=filename, size=len(content))


async def test_valid_params_and_config_succeeds(tmp_path: Path) -> None:
    found, loaded = make_recipe(
        tmp_path,
        env_toml='\n[[recipe.env]]\nkey = "OPENAI_API_KEY"\nprovider = "openai"\n',
    )
    form = FormData(
        [
            ("params", '{"question": "hi", "top_k": 3}'),
            ("config", '{"OPENAI_API_KEY": "sk-test"}'),
        ]
    )

    result = await parse_run_request(found, loaded, form)

    assert result.params.question == "hi"
    assert result.params.top_k == 3
    assert result.params.documents == []
    assert result.config == {"OPENAI_API_KEY": "sk-test"}


async def test_invalid_params_wrong_type_is_422_with_field_detail(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [("params", '{"question": "hi", "top_k": "not-a-number"}'), ("config", "{}")]
    )

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 422
    detail = exc_info.value.detail
    assert any("top_k" in str(err.get("loc")) for err in detail)


async def test_missing_required_field_is_422(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData([("params", '{"top_k": 3}'), ("config", "{}")])

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 422
    detail = exc_info.value.detail
    assert any("question" in str(err.get("loc")) for err in detail)


async def test_config_key_not_declared_is_422(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)  # declares no env vars
    form = FormData([("params", '{"question": "hi"}'), ("config", '{"SNEAKY_KEY": "x"}')])

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 422


async def test_valid_file_upload_within_caps_populates_params(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [
            ("params", '{"question": "hi"}'),
            ("config", "{}"),
            ("files[documents][]", upload("a.txt", b"hello world")),
        ]
    )

    result = await parse_run_request(found, loaded, form)

    assert len(result.params.documents) == 1
    assert result.params.documents[0].filename == "a.txt"
    assert result.params.documents[0].text() == "hello world"


async def test_staged_tempdir_contains_the_uploaded_bytes(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [
            ("params", '{"question": "hi"}'),
            ("config", "{}"),
            ("files[documents][]", upload("a.txt", b"hello world")),
        ]
    )

    result = await parse_run_request(found, loaded, form)

    staged = list(Path(result.tempdir).rglob("*"))
    staged_files = [p for p in staged if p.is_file()]
    assert len(staged_files) == 1
    assert staged_files[0].read_bytes() == b"hello world"


async def test_zero_files_for_optional_field_is_empty_list_not_error(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData([("params", '{"question": "hi"}'), ("config", "{}")])

    result = await parse_run_request(found, loaded, form)

    assert result.params.documents == []


async def test_file_over_per_file_cap_is_413(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(request_module, "MAX_FILE_BYTES", 10)
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [
            ("params", '{"question": "hi"}'),
            ("config", "{}"),
            ("files[documents][]", upload("a.txt", b"x" * 11)),
        ]
    )

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 413


async def test_total_size_over_aggregate_cap_is_413(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(request_module, "MAX_FILE_BYTES", 10)
    monkeypatch.setattr(request_module, "MAX_TOTAL_BYTES", 15)
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [
            ("params", '{"question": "hi"}'),
            ("config", "{}"),
            ("files[documents][]", upload("a.txt", b"x" * 8)),
            ("files[documents][]", upload("b.txt", b"y" * 8)),
        ]
    )

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 413


async def test_more_than_ten_files_is_413(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    parts = [
        ("files[documents][]", upload(f"f{i}.txt", b"x")) for i in range(11)
    ]
    form = FormData([("params", '{"question": "hi"}'), ("config", "{}"), *parts])

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 413


async def test_disallowed_extension_is_413(tmp_path: Path) -> None:
    found, loaded = make_recipe(tmp_path)
    form = FormData(
        [
            ("params", '{"question": "hi"}'),
            ("config", "{}"),
            ("files[documents][]", upload("bad.exe", b"data")),
        ]
    )

    with pytest.raises(HTTPException) as exc_info:
        await parse_run_request(found, loaded, form)

    assert exc_info.value.status_code == 413
