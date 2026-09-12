"""CI check: fail the build if a sentinel author trial-key value ever
appears in captured log/stdout/stderr output.

Sibling to `check_log_redaction.py` (execution's own version of this check)
rather than an extension of it: per docs/SPEC-trial-limits.md's Confirmed
Decision 8, `trial_limits` implements no redaction of its own and relies
entirely on `execution`'s already-covered `RedactingFilter`/
`redaction_context` — but the LEAK VECTOR under test here is specific to
this module (the author's *injected* key, which the client never sends,
rather than a client-supplied one), so it gets its own dedicated script
rather than folding into execution's, keeping each module's own CI concern
self-contained.

Wiring this into a real CI pipeline is `distribution`'s job (per
docs/CAPABILITY-MAP.md); this script is the concrete mechanism it should
invoke. Until then, run it manually:

    cd backend && uv run python scripts/check_trial_key_redaction.py

Exit code 0: the sentinel never appeared anywhere in captured output.
Exit code 1: it did — treat as a release-blocking failure.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SENTINEL = "sk-ci-trial-key-sentinel-2b6e9a4d1f5c8073b4e6a1c9d0f2536e"


def _write_sentinel_recipe(recipes_root: Path) -> None:
    """A throwaway recipe requiring a key it never receives from the
    client — the only way a granted keyless-trial run injects the author's
    key at all — that both logs it directly and raises with it in the
    exception message, mirroring `check_log_redaction.py`'s own two leak
    vectors.
    """
    recipe_dir = recipes_root / "ci-check" / "10-sentinel-leaker"
    recipe_dir.mkdir(parents=True, exist_ok=True)
    (recipes_root / "ci-check" / "group.toml").write_text(
        '[group]\nid = "ci-check"\ntitle = "CI Check"\norder = 1\n'
    )
    (recipe_dir / "recipe.toml").write_text(
        "[recipe]\n"
        'slug = "sentinel-leaker"\ntitle = "Sentinel Leaker"\nsummary = "..."\n'
        'difficulty = "basic"\norder = 10\nestimated_runtime_seconds = 1\n'
        '\n[[recipe.env]]\nkey = "OPENAI_API_KEY"\nprovider = "openai"\nrequired = true\n'
    )
    (recipe_dir / "recipe.py").write_text(
        "import logging\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "logger = logging.getLogger('skillet.recipe.executor')\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    logger.info('calling upstream with key %s', ctx.config['OPENAI_API_KEY'])\n"
        "    raise RuntimeError(f\"upstream rejected key {ctx.config['OPENAI_API_KEY']}\")\n"
    )


_SUBPROCESS_SCRIPT = """
import os
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app


class FakeUpstashRedis:
    def __init__(self):
        self._counts = {}

    async def incr(self, key):
        self._counts[key] = self._counts.get(key, 0) + 1
        return self._counts[key]

    async def incrby(self, key, amount):
        self._counts[key] = self._counts.get(key, 0) + amount
        return self._counts[key]

    async def expire(self, key, seconds):
        pass

    async def get(self, key):
        return str(self._counts[key]) if key in self._counts else None


recipes_root = Path(os.environ["SKILLET_CI_RECIPES_ROOT"])
# SKILLET_TRIAL_OPENAI_API_KEY (the actual sentinel) is already set in this
# subprocess's own environment by the parent -- never re-embedded as a
# source-level literal here, so a crash's own traceback can't trivially
# "leak" it by printing back this script's own source line.

app = create_app(recipes_root=recipes_root)
app.state.trial_redis = FakeUpstashRedis()
app.state.cookie_secret = b"ci-check-secret"

client = TestClient(app)
resp = client.post(
    "/recipes/sentinel-leaker/run",
    data={"params": "{}", "config": "{}"},  # no client-supplied key -> grants a keyless trial
)
print(resp.text)
"""


def main() -> int:
    import os
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        recipes_root = Path(tmp) / "recipes"
        _write_sentinel_recipe(recipes_root)

        env = {
            **os.environ,
            "SKILLET_TRIAL_OPENAI_API_KEY": SENTINEL,
            "SKILLET_CI_RECIPES_ROOT": str(recipes_root),
        }

        result = subprocess.run(
            [sys.executable, "-c", _SUBPROCESS_SCRIPT],
            cwd=BACKEND_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )

    captured = result.stdout + result.stderr
    if SENTINEL in captured:
        print("FAIL: sentinel trial key leaked into captured output:", file=sys.stderr)
        print(captured, file=sys.stderr)
        return 1

    print("OK: sentinel trial key never appeared in captured output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
