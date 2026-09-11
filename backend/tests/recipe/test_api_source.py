"""Tests for GET /recipes/{slug}/source."""

import hashlib
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app

FIXTURES_ROOT = Path(__file__).parent.parent / "fixtures" / "recipes"


def make_client() -> TestClient:
    return TestClient(create_app(recipes_root=FIXTURES_ROOT))


def test_source_includes_both_files_with_correct_hashes() -> None:
    resp = make_client().get("/recipes/echo-with-helper/source")
    assert resp.status_code == 200
    body = resp.json()

    by_path = {f["path"]: f for f in body["files"]}
    assert set(by_path) == {"recipe.py", "helpers.py"}

    recipe_dir = FIXTURES_ROOT / "demo" / "20-echo-with-helper"
    for path, file in by_path.items():
        raw = (recipe_dir / path).read_bytes()
        assert file["sha256"] == hashlib.sha256(raw).hexdigest()
        assert file["text"] == raw.decode("utf-8")

    assert "bundleSha256" in body


def test_source_unknown_slug_is_404() -> None:
    resp = make_client().get("/recipes/does-not-exist/source")
    assert resp.status_code == 404
