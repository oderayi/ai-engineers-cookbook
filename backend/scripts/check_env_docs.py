"""CI check: fail the build if a spec references an env var that isn't
documented, with a non-empty description, in one of the two `.env.example`
files.

Catches drift per docs/SPEC-distribution.md's own Testing Strategy: "a
small script/test asserts every env var referenced in recipe-framework,
execution, trial-limits, and settings' specs appears in
backend/.env.example or frontend/.env.local.example with a non-empty
description ... catches drift when a future module spec adds a var and
forgets to document it."

## What counts as "referenced"

A pragmatic regex scan, not a real markdown/AST parse: any backtick-quoted
identifier in the four named specs matching a known env-var-shaped prefix
(`SKILLET_`, `UPSTASH_`, `NEXT_PUBLIC_`). Verified against the real specs
before relying on this (see the module's own plan doc): as of writing, only
`SKILLET_CORS_ORIGINS`, `SKILLET_TRIAL_DAILY_CAP`, and
`SKILLET_TRIAL_OPENAI_API_KEY` actually appear backtick-quoted this way —
the *complete* env-var inventory (also `UPSTASH_REDIS_REST_URL/TOKEN`,
`SKILLET_TRIAL_COOKIE_SECRET`, `SKILLET_TRIAL_DAILY_BUDGET_USD`,
`NEXT_PUBLIC_BACKEND_URL`) came from grepping the real source
(`os.environ.get(...)`/`process.env.*`) while writing the `.env.example`
files themselves, not from this script — this script is a narrower,
CI-automatable drift catcher for the specific "spec mentions it, example
file doesn't" gap, not a substitute for that broader manual inventory.

## The one deliberate exclusion

`OPENAI_API_KEY` (and any other bare `<PROVIDER>_API_KEY`-shaped
identifier) is a per-recipe, dynamically-declared env var
(`recipe.toml`'s own `env` entries, per `recipe-framework`) — there is no
fixed, enumerable set of these, so they are deliberately NOT documented
var-by-var in either global `.env.example` file (the README's own
"Add a recipe" section explains this instead). Flagging one of these as
"missing" would be a false positive against a real, intentional design
decision, not a real doc-drift bug — so it's excluded from the scan by
name, with this comment as the record of why.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent

SPEC_FILES = [
    REPO_ROOT / "docs" / "SPEC-recipe-framework.md",
    REPO_ROOT / "docs" / "SPEC-execution.md",
    REPO_ROOT / "docs" / "SPEC-trial-limits.md",
    REPO_ROOT / "docs" / "SPEC-settings.md",
]

EXAMPLE_FILES = [
    BACKEND_ROOT / ".env.example",
    REPO_ROOT / "frontend" / ".env.local.example",
]

# Deliberately excluded — see this module's own doc comment above.
EXCLUDED = re.compile(r"^[A-Z0-9]+_API_KEY$")

ENV_VAR_PATTERN = re.compile(r"`((?:SKILLET|UPSTASH|NEXT_PUBLIC)_[A-Z0-9_]+)`")


def referenced_env_vars(spec_text: str) -> set[str]:
    return {name for name in ENV_VAR_PATTERN.findall(spec_text) if not EXCLUDED.match(name)}


def documented_env_vars(example_text: str) -> set[str]:
    """A var counts as documented if it appears as a (possibly commented-out)
    `KEY=...` assignment line preceded by at least one non-empty comment
    line — matching this repo's own convention (see `.env.example`'s own
    header) of commenting every var out by default with a description
    above it, never a bare `VAR=` with no explanation.
    """
    documented: set[str] = set()
    lines = example_text.splitlines()
    assignment = re.compile(r"^#?\s*([A-Z][A-Z0-9_]*)=")
    for i, line in enumerate(lines):
        match = assignment.match(line)
        if not match:
            continue
        # Walk upward over contiguous comment lines looking for a real
        # description (not just more `# KEY=` assignment lines, e.g. a
        # multi-line UPSTASH_REDIS_REST_URL/TOKEN pair sharing one
        # description above both).
        has_description = False
        j = i - 1
        while j >= 0 and lines[j].startswith("#"):
            if not assignment.match(lines[j]) and lines[j].strip("# ").strip():
                has_description = True
            j -= 1
        if has_description:
            documented.add(match.group(1))
    return documented


def main() -> int:
    referenced: set[str] = set()
    for spec_path in SPEC_FILES:
        if not spec_path.is_file():
            print(f"error: spec file not found: {spec_path}", file=sys.stderr)
            return 1
        referenced |= referenced_env_vars(spec_path.read_text())

    documented: set[str] = set()
    for example_path in EXAMPLE_FILES:
        if not example_path.is_file():
            print(f"error: example file not found: {example_path}", file=sys.stderr)
            return 1
        documented |= documented_env_vars(example_path.read_text())

    missing = sorted(referenced - documented)
    if missing:
        print("env vars referenced in specs but not documented in an .env.example file:")
        for name in missing:
            print(f"  - {name}")
        return 1

    print(f"OK: all {len(referenced)} spec-referenced env var(s) are documented.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
