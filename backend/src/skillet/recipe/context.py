"""RecipeContext and FileBundle — what a recipe's `run()` receives.

`config` here is a plain, already-resolved `Mapping[str, str]`; this module
only defines its shape. Building it (merging global defaults, per-recipe
overrides, and the hosted trial key) is `settings`' and `trial-limits`' job —
see docs/SPEC-recipe-framework.md's Scope.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from skillet.recipe.emitter import Emitter
from skillet.recipe.params import UploadedFile


class FileBundle:
    """Read-only access to a recipe's own `fixtures/` directory.

    Fixture access only ever goes through `.fixtures(name)` — a recipe never
    opens a path itself, and a name that would resolve outside `fixtures/` is
    rejected rather than silently clamped.
    """

    def __init__(self, recipe_dir: Path) -> None:
        self._fixtures_root = (recipe_dir / "fixtures").resolve()

    def fixtures(self, name: str) -> list[UploadedFile]:
        """Read `fixtures/<name>`: a single file, or every file in a directory
        (sorted by filename), each wrapped as an `UploadedFile` so recipe code
        can treat a fixture and a real upload identically.
        """
        target = (self._fixtures_root / name).resolve()
        if not target.is_relative_to(self._fixtures_root):
            raise ValueError(f"fixture name escapes fixtures/: {name!r}")
        if not target.exists():
            raise FileNotFoundError(f"no such fixture: {name!r}")
        if target.is_file():
            return [UploadedFile(filename=target.name, content=target.read_bytes())]
        return [
            UploadedFile(filename=p.name, content=p.read_bytes())
            for p in sorted(target.iterdir())
            if p.is_file()
        ]


@dataclass
class RecipeContext:
    """What `run(params, ctx)` receives, beyond `params` itself."""

    config: Mapping[str, str]
    files: FileBundle
    emit: Emitter
    deadline: float
