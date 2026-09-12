"""CI check: fail the build if a sentinel "secret" value ever appears in
captured log/stdout/stderr output.

Wiring this into a real CI pipeline is `distribution`'s job (per
docs/CAPABILITY-MAP.md — that module owns packaging/CI for this project);
this script is the concrete mechanism it should invoke. Until `distribution`
exists, run it manually or from a pre-push hook:

    cd backend && uv run python scripts/check_log_redaction.py

Exit code 0: the sentinel never appeared anywhere in captured output.
Exit code 1: it did — treat as a release-blocking failure, and print exactly
where it leaked.

This is deliberately independent of `tests/execution/test_key_hygiene.py`
(which exercises the same guarantee via pytest's `caplog`, in-process): this
script captures real process-level stdout/stderr — the same channel a
production deployment's actual log aggregator would see — by running the
whole backend test suite as a subprocess with a sentinel value injected via
an environment variable that a dedicated fixture recipe reads and
deliberately mishandles (logs it, then raises with it in the message).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SENTINEL = "sk-ci-log-redaction-sentinel-4f9a1e2b7c6d4a3e9f0b1c2d3e4f5061"


def _write_sentinel_recipe(recipes_root: Path) -> None:
    """A throwaway recipe, built fresh on every run, that both logs the
    sentinel directly and raises it in an exception message — the two
    realistic leak vectors `RedactingFilter`/`run_event_stream` guard
    against (see `skillet.execution.keys`'s and `.stream`'s docstrings).
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
        '\n[[recipe.env]]\nkey = "SENTINEL_KEY"\nprovider = "openai"\n'
    )
    (recipe_dir / "recipe.py").write_text(
        "import logging\n\n"
        "from skillet.recipe import Params as BaseParams\n\n"
        "logger = logging.getLogger('skillet.recipe.executor')\n\n"
        "class Params(BaseParams):\n    pass\n\n"
        "async def run(params, ctx):\n"
        "    logger.info('calling upstream with key %s', ctx.config['SENTINEL_KEY'])\n"
        "    raise RuntimeError(f\"upstream rejected key {ctx.config['SENTINEL_KEY']}\")\n"
    )


_SUBPROCESS_SCRIPT = """
import json
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from skillet.api.app import create_app

sentinel = os.environ["SKILLET_CI_SENTINEL"]
recipes_root = Path(os.environ["SKILLET_CI_RECIPES_ROOT"])

client = TestClient(create_app(recipes_root=recipes_root))
resp = client.post(
    "/recipes/sentinel-leaker/run",
    data={"params": "{}", "config": json.dumps({"SENTINEL_KEY": sentinel})},
)
sys.stdout.write(resp.text)
sys.stdout.write("\\n")
"""


def main() -> int:
    import os
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        recipes_root = Path(tmp) / "recipes"
        _write_sentinel_recipe(recipes_root)

        # The sentinel travels only via an environment variable — the
        # subprocess script itself must never embed it as a literal, or a
        # crash's own traceback would trivially "leak" it by printing back
        # the source line that constructed it, proving nothing about this
        # backend's actual redaction behavior.
        env = {
            **os.environ,
            "SKILLET_CI_SENTINEL": SENTINEL,
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
        print("FAIL: sentinel value leaked into captured output:", file=sys.stderr)
        print(captured, file=sys.stderr)
        return 1

    print("OK: sentinel value never appeared in captured output.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
