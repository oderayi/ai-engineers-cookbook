"""Tests for skillet.recipe.manifest — TOML parsing, no Python import involved."""

from pathlib import Path

import pytest

from skillet.recipe.manifest import (
    GroupManifest,
    ManifestError,
    RecipeManifest,
    parse_group_toml,
    parse_recipe_toml,
)

RECIPE_TOML = """
[recipe]
slug = "rag-basics"
title = "RAG over your documents"
summary = "Index a set of documents and answer questions grounded in them."
difficulty = "basic"
order = 10
estimated_runtime_seconds = 20

use_cases = [
  "Question answering over a private knowledge base",
  "Customer-support assistants scoped to your docs",
]

[[recipe.env]]
key = "OPENAI_API_KEY"
provider = "openai"
required = true
description = "Used for both embeddings and the chat completion."

[[recipe.example]]
title = "Ask about the sample docs"
summary = "Uses the bundled sample-docs fixture set."
expect = "A 2-3 sentence answer citing the onboarding policy."
[recipe.example.params]
question = "How many vacation days do new hires get?"
top_k = 4

[recipe.entrypoint]
module = "recipe"
"""

GROUP_TOML = """
[group]
id = "rag"
title = "Retrieval-Augmented Generation"
order = 20
summary = "Ground an LLM in your own documents."
"""


def write(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content)
    return path


def test_parse_recipe_toml_full_example(tmp_path: Path) -> None:
    manifest = parse_recipe_toml(write(tmp_path, "recipe.toml", RECIPE_TOML))

    assert isinstance(manifest, RecipeManifest)
    assert manifest.slug == "rag-basics"
    assert manifest.difficulty == "basic"
    assert manifest.order == 10
    assert manifest.use_cases == [
        "Question answering over a private knowledge base",
        "Customer-support assistants scoped to your docs",
    ]
    assert len(manifest.env) == 1
    assert manifest.env[0].key == "OPENAI_API_KEY"
    assert manifest.env[0].provider == "openai"
    assert manifest.env[0].required is True
    assert len(manifest.example) == 1
    assert manifest.example[0].title == "Ask about the sample docs"
    assert manifest.entrypoint.module == "recipe"


def test_parse_group_toml_full_example(tmp_path: Path) -> None:
    manifest = parse_group_toml(write(tmp_path, "group.toml", GROUP_TOML))

    assert isinstance(manifest, GroupManifest)
    assert manifest.id == "rag"
    assert manifest.order == 20
    assert manifest.icon is None  # optional, absent here


def test_group_toml_optional_icon(tmp_path: Path) -> None:
    content = GROUP_TOML + '\nicon = "flask-conical"\n'
    manifest = parse_group_toml(write(tmp_path, "group.toml", content))
    assert manifest.icon == "flask-conical"


def test_missing_required_field_raises_named_error(tmp_path: Path) -> None:
    # drop the required `slug` field
    broken = RECIPE_TOML.replace('slug = "rag-basics"\n', "")
    path = write(tmp_path, "recipe.toml", broken)

    with pytest.raises(ManifestError) as exc_info:
        parse_recipe_toml(path)

    assert "slug" in str(exc_info.value)


def test_missing_top_level_table_raises(tmp_path: Path) -> None:
    path = write(tmp_path, "recipe.toml", 'title = "no [recipe] table"\n')
    with pytest.raises(ManifestError, match=r"\[recipe\]"):
        parse_recipe_toml(path)


def test_invalid_toml_syntax_raises(tmp_path: Path) -> None:
    path = write(tmp_path, "recipe.toml", "[recipe\nslug = broken")
    with pytest.raises(ManifestError):
        parse_recipe_toml(path)


def test_example_params_stored_as_plain_dict_not_validated(tmp_path: Path) -> None:
    """Task 1 only stores example.params as a dict — validating it against a
    recipe's Params model happens later (Task 13), so an arbitrary/incompatible
    shape here must not raise."""
    content = RECIPE_TOML.replace("top_k = 4", 'top_k = 4\nanything_goes = ["a", "b"]')
    manifest = parse_recipe_toml(write(tmp_path, "recipe.toml", content))
    assert manifest.example[0].params["anything_goes"] == ["a", "b"]


def test_env_defaults_when_omitted(tmp_path: Path) -> None:
    # a recipe.toml with no [[recipe.env]] and no [[recipe.example]] at all
    minimal = """
[recipe]
slug = "no-env"
title = "No env needed"
summary = "..."
difficulty = "basic"
order = 1
estimated_runtime_seconds = 5
"""
    manifest = parse_recipe_toml(write(tmp_path, "recipe.toml", minimal))
    assert manifest.env == []
    assert manifest.example == []
    assert manifest.entrypoint.module == "recipe"  # default
