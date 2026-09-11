"""The Params base class every recipe subclasses, and the UploadedFile field
type for declared file inputs.

See docs/SPEC-recipe-framework.md — `Params` is the single source of truth for
both the run form's JSON Schema (`catalog`) and server-side input validation.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, GetCoreSchemaHandler, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema


class Params(BaseModel):
    """Base class for a recipe's declared inputs. Subclass this in recipe.py.

    `extra="forbid"` is deliberate: a run request may only ever supply values
    for fields the recipe explicitly declares (see the framework's "no
    undeclared parameter" boundary).
    """

    model_config = ConfigDict(extra="forbid")


class UploadedFile:
    """A single uploaded file, as recipe code sees it.

    Constructed by the executor from the run request's multipart file parts —
    never parsed from JSON. Recipes only ever read it via `.text()`. No size,
    count, or type enforcement happens here; that's `execution`'s job, using
    the `accept` / `max_files` metadata a `Params` field carries via
    `json_schema_extra`.
    """

    __slots__ = ("filename", "_content")

    def __init__(self, filename: str, content: bytes) -> None:
        self.filename = filename
        self._content = content

    def text(self, encoding: str = "utf-8") -> str:
        return self._content.decode(encoding)

    def __repr__(self) -> str:
        return f"UploadedFile(filename={self.filename!r}, size={len(self._content)})"

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.is_instance_schema(cls)

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema_: core_schema.CoreSchema, handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        # OpenAPI's convention for a file upload; catalog's schema-to-form
        # compiler maps this (plus a field's json_schema_extra) to a dropzone.
        return {"type": "string", "format": "binary"}
