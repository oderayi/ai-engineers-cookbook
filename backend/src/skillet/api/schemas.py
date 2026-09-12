"""Response models for the read-only recipe API. Every field serializes as
camelCase (the wire contract `catalog` and `settings` consume); Python code
still uses snake_case internally via `populate_by_name`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RecipeSummary(CamelModel):
    slug: str
    title: str
    summary: str
    group: str
    group_title: str
    group_icon: str | None
    difficulty: str
    order: int
    estimated_runtime_seconds: int


class EnvVarOut(CamelModel):
    key: str
    provider: str
    required: bool
    description: str


class ExampleOut(CamelModel):
    title: str
    summary: str
    expect: str
    params: dict[str, Any]


class SourceFileRef(CamelModel):
    path: str
    language: str


class RecipeDetail(CamelModel):
    slug: str
    title: str
    summary: str
    group: str
    group_title: str
    group_icon: str | None
    difficulty: str
    order: int
    estimated_runtime_seconds: int
    use_cases: list[str]
    readme_markdown: str | None
    examples: list[ExampleOut]
    input_schema: dict[str, Any]
    source_files: list[SourceFileRef]
    env: list[EnvVarOut]


class SourceFileWithContent(CamelModel):
    path: str
    language: str
    text: str
    sha256: str


class SourceBundleOut(CamelModel):
    files: list[SourceFileWithContent]
    bundle_sha256: str
