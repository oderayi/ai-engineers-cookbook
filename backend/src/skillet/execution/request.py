"""Parse and validate an incoming run request into `(Params, config,
tempdir)` — every rejection (`422`/`413`) happens here, before any recipe
code runs. See docs/SPEC-execution.md, Confirmed Decisions 2 and 4.

**Input shape.** `parse_run_request` takes an already-parsed Starlette
`FormData`, not a raw `Request`. The endpoint layer (Task 8) is expected to
do `form = await request.form()` and hand the result in here. This keeps
this module trivially testable (a `FormData` is built in-process, with
`starlette.datastructures.UploadFile` instances backed by an in-memory
`BytesIO` — no ASGI server or real HTTP round trip needed) while changing
nothing about the wire contract: `request.form()` already returns the exact
multidict this module wants.

**Wire convention** (matches `frontend/lib/execution/run-client.ts` exactly):
every uploaded file is its own multipart part named `files[<fieldName>][]`,
where `<fieldName>` is the recipe's declared file `Params` field name. A
field with zero files selected has no parts at all. `params` and `config`
are plain text parts, each a JSON-stringified object.

**Validation order — params vs. files.** Per Confirmed Decision 4 and the
framework's own rule that files never travel as JSON (`params.py`), this
module does NOT validate the JSON `params` blob against `params_cls` on its
own and then splice files in afterwards. Instead it builds one raw dict —
the parsed `params` JSON, with each declared file field's key overwritten by
the list of `UploadedFile` instances staged from the matching multipart
parts — and validates that whole dict against `params_cls` in a single
`model_validate` call. This means a single pass produces field-level errors
for both ordinary fields and file fields alike, and a client-supplied JSON
value for a file-field key (which should never happen, but is cheap to
guard) is always overwritten by the real multipart-derived files rather than
trusted.

File caps (size, count, extension) are enforced *before* that final
`model_validate` call, and before per-file bytes are fully read where
practical: file count and extension are checked from `UploadFile.filename`
alone (no read), and each part's declared `.size` (set by Starlette's
multipart parser) is checked against the per-file cap before `.read()` is
ever awaited.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import types
import typing
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, get_args, get_origin

from fastapi import HTTPException
from pydantic import ValidationError
from pydantic.fields import FieldInfo
from starlette.datastructures import FormData, UploadFile

from skillet.recipe.discovery import DiscoveredRecipe
from skillet.recipe.executor import LoadedRecipe
from skillet.recipe.params import Params
from skillet.recipe.params import UploadedFile as RecipeUploadedFile

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024
MAX_FILES_TOTAL = 10


@dataclass(frozen=True)
class ParsedRunRequest:
    """The fully-validated result of parsing a run request.

    `tempdir` holds every staged upload's bytes for this run — the caller
    (Task 8's endpoint) owns removing it (e.g. `shutil.rmtree`) in a
    `finally` once the run completes. It is created even when the request
    has no file uploads at all, so callers can always clean up the same way.
    """

    params: Params
    config: dict[str, str]
    tempdir: str


def _unwrap_optional(annotation: Any) -> Any:
    origin = get_origin(annotation)
    if origin is typing.Union or origin is types.UnionType:
        args = [a for a in get_args(annotation) if a is not type(None)]
        if len(args) == 1:
            return args[0]
    return annotation


def _field_hints(info: FieldInfo) -> dict[str, Any]:
    """Read a field's `accept` / `max_files` hints from `json_schema_extra`.

    Confirmed empirically (see task report): a plain `dict` literal passed
    to `Field(json_schema_extra={...})` comes back from
    `FieldInfo.json_schema_extra` as that same `dict`. Pydantic v2 also
    allows `json_schema_extra` to be a callable that mutates a schema dict
    in place, so that shape is handled too, defensively.
    """
    extra = info.json_schema_extra
    if isinstance(extra, dict):
        return extra
    if callable(extra):
        schema: dict[str, Any] = {}
        result = extra(schema)
        return result if isinstance(result, dict) else schema
    return {}


def _file_field_hints(params_cls: type[Params]) -> dict[str, dict[str, Any]]:
    """Introspect `params_cls.model_fields` (a `dict[str, FieldInfo]`) for
    every field declared as a file input — annotated `list[UploadedFile]`,
    optionally `Optional`-wrapped — returning `{field_name: hints}`.
    """
    file_fields: dict[str, dict[str, Any]] = {}
    for name, info in params_cls.model_fields.items():
        annotation = _unwrap_optional(info.annotation)
        if get_origin(annotation) is list:
            (arg,) = get_args(annotation) or (None,)
            if arg is RecipeUploadedFile:
                file_fields[name] = _field_hints(info)
    return file_fields


def _parse_json_object_field(form: FormData, field_name: str) -> dict[str, Any]:
    raw = form.get(field_name)
    if raw is None:
        raw = "{}"
    if not isinstance(raw, str):
        raise HTTPException(
            status_code=422, detail=f"{field_name!r} must be a text field, not a file upload"
        )
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422, detail=f"{field_name!r} is not valid JSON: {exc}"
        ) from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail=f"{field_name!r} must be a JSON object")
    return parsed


def _validate_config(raw_config: dict[str, Any], recipe: DiscoveredRecipe) -> dict[str, str]:
    declared_keys = {entry.key for entry in recipe.manifest.env}
    unknown = sorted(set(raw_config) - declared_keys)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail=f"config key(s) not declared by this recipe's env: {unknown}",
        )
    config: dict[str, str] = {}
    for key, value in raw_config.items():
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"config[{key!r}] must be a string")
        config[key] = value
    return config


async def _stage_uploads(
    form: FormData,
    file_fields: dict[str, dict[str, Any]],
    tempdir: str,
) -> dict[str, list[RecipeUploadedFile]]:
    uploads_by_field: dict[str, list[UploadFile]] = {
        field_name: [u for u in form.getlist(f"files[{field_name}][]") if isinstance(u, UploadFile)]
        for field_name in file_fields
    }

    total_files = sum(len(uploads) for uploads in uploads_by_field.values())
    if total_files > MAX_FILES_TOTAL:
        raise HTTPException(
            status_code=413, detail=f"too many files: {total_files} > {MAX_FILES_TOTAL}"
        )

    staged: dict[str, list[RecipeUploadedFile]] = {}
    total_bytes = 0

    for field_name, uploads in uploads_by_field.items():
        accept = {ext.lower() for ext in file_fields[field_name].get("accept") or []}
        field_files: list[RecipeUploadedFile] = []

        for upload in uploads:
            filename = upload.filename or ""
            suffix = Path(filename).suffix.lower()
            if accept and suffix not in accept:
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"{field_name}: file {filename!r} has extension {suffix!r}, "
                        f"not one of {sorted(accept)}"
                    ),
                )

            # Check the size Starlette's multipart parser already recorded
            # before reading the content, so an oversized part can be
            # rejected without pulling its bytes into memory.
            if upload.size is not None and upload.size > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"{field_name}: file {filename!r} exceeds the per-file limit "
                    f"of {MAX_FILE_BYTES} bytes",
                )

            content = await upload.read()
            if len(content) > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"{field_name}: file {filename!r} exceeds the per-file limit "
                    f"of {MAX_FILE_BYTES} bytes",
                )

            total_bytes += len(content)
            if total_bytes > MAX_TOTAL_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"total upload size exceeds {MAX_TOTAL_BYTES} bytes",
                )

            staged_path = Path(tempdir) / f"{uuid.uuid4().hex}_{filename}"
            staged_path.write_bytes(content)

            field_files.append(RecipeUploadedFile(filename=filename, content=content))

        staged[field_name] = field_files

    return staged


async def parse_run_request(
    recipe: DiscoveredRecipe,
    loaded: LoadedRecipe,
    form: FormData,
) -> ParsedRunRequest:
    """Parse and validate `form` (from `await request.form()`) against
    `recipe`/`loaded`, returning a `ParsedRunRequest`.

    Raises `fastapi.HTTPException` (422 for bad/undeclared params or config,
    413 for an upload cap breach) before any recipe code ever runs. Unknown
    slug handling is not this function's job — the caller already resolved
    `recipe`/`loaded` via a 404 lookup one layer up.
    """
    raw_params = _parse_json_object_field(form, "params")
    raw_config = _parse_json_object_field(form, "config")
    config = _validate_config(raw_config, recipe)

    file_fields = _file_field_hints(loaded.params_cls)

    tempdir = tempfile.mkdtemp(prefix="skillet-run-")
    try:
        staged_files = await _stage_uploads(form, file_fields, tempdir)

        raw_values: dict[str, Any] = dict(raw_params)
        raw_values.update(staged_files)

        try:
            params = loaded.params_cls.model_validate(raw_values)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc
    except Exception:
        # Broad on purpose: any failure past this point (HTTPException from
        # cap/validation checks, or anything unexpected) must still remove
        # the tempdir we just created before propagating — never leak
        # staged upload bytes on an error path.
        shutil.rmtree(tempdir, ignore_errors=True)
        raise

    return ParsedRunRequest(params=params, config=config, tempdir=tempdir)
