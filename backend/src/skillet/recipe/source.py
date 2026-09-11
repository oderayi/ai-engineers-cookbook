"""Read a recipe's source files and hash them — the mechanics behind the
1-to-1 source guarantee: the bytes served here must equal the bytes the
executor imports. See docs/SPEC-recipe-framework.md.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

_LANGUAGE_BY_SUFFIX = {".py": "python"}


@dataclass(frozen=True)
class SourceFile:
    path: str  # filename relative to the recipe dir, e.g. "recipe.py"
    language: str
    text: str
    sha256: str


@dataclass(frozen=True)
class SourceBundle:
    files: list[SourceFile]
    bundle_sha256: str


def read_source(recipe_dir: Path, entrypoint_module: str = "recipe") -> SourceBundle:
    """Enumerate the recipe's entrypoint module plus any sibling `.py` helper
    files (the entrypoint always listed first), read their bytes, and hash
    each file plus the whole bundle.

    Only `.py` files are included — `recipe.toml` and anything else in the
    directory (fixtures, a README) is not part of the displayed source.
    """
    entrypoint_path = recipe_dir / f"{entrypoint_module}.py"
    if not entrypoint_path.is_file():
        raise FileNotFoundError(f"entrypoint not found: {entrypoint_path}")

    helpers = sorted(p for p in recipe_dir.glob("*.py") if p.is_file() and p != entrypoint_path)
    ordered = [entrypoint_path, *helpers]

    files: list[SourceFile] = []
    bundle_hasher = hashlib.sha256()
    for path in ordered:
        data = path.read_bytes()
        file_hash = hashlib.sha256(data).hexdigest()
        bundle_hasher.update(file_hash.encode())
        files.append(
            SourceFile(
                path=path.name,
                language=_LANGUAGE_BY_SUFFIX.get(path.suffix, "text"),
                text=data.decode("utf-8"),
                sha256=file_hash,
            )
        )

    return SourceBundle(files=files, bundle_sha256=bundle_hasher.hexdigest())
