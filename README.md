# Skillet — the AI engineer's cookbook

Skillet is a learn-by-reading-and-running collection of AI engineering
"recipes": small, real, working programs (RAG, agents, tool use, evals, and
more) that show their own source code next to their live output. Browse the
catalog, read exactly the code that's about to run, run it with your own key
(or a free keyless trial on the hosted demo), and see the real result stream
back.

## Quickstart

Two first-class local paths — pick whichever you already have installed.
Both produce the same app at the same URLs: backend on
[localhost:8000](http://localhost:8000), frontend on
[localhost:3000](http://localhost:3000).

**Native** (needs [`uv`](https://docs.astral.sh/uv/) and
[`bun`](https://bun.sh/)):

```
make dev
```

**Docker** (needs only Docker itself):

```
make docker
```

Either way, `Ctrl-C` stops everything. Nothing else to configure — every
environment variable is optional, and a fresh checkout runs in full
bring-your-own-key mode with zero setup (see [Environment variables](#environment-variables)
below).

> Windows needs WSL or Git Bash for `make` — the terminal you'd want for this
> anyway.

## Other commands

```
make test              # uv run pytest && bun run test
make lint               # ruff check && eslint
make validate           # uv run skillet recipes validate — checks every recipe's contract
make check-redaction    # fails if a secret ever leaks into real captured log output
make new-recipe RECIPE=<group>/<slug>   # scaffold a new recipe
```

These are the exact commands CI runs (`.github/workflows/ci.yml`) — if CI is
red, one of these reproduces it locally.

## Architecture

Skillet is a small monorepo: a FastAPI backend (`backend/`) that discovers,
validates, and runs recipes; a Next.js frontend (`frontend/`) that renders
the catalog, the run form, and the streamed output. Built as eight
independent modules, in dependency order:

```
recipe-framework, app-shell
        │
        ├─→ catalog, settings
        │        │
        │        └─→ execution
        │                │
        │                ├─→ trial-limits
        │                └─→ workspace
        │                        │
        └────────────────────────┴─→ distribution
```

See [`docs/CAPABILITY-MAP.md`](docs/CAPABILITY-MAP.md) for what each module
owns, and `docs/SPEC-<module>.md` for that module's full spec (objective,
confirmed decisions, success criteria).

## Add a recipe

```
make new-recipe RECIPE=<group>/<slug>
```

scaffolds a new recipe into `backend/recipes/<group>/<slug>/` — metadata,
parameters, and a starting `recipe.py`. See
[`docs/SPEC-recipe-framework.md`](docs/SPEC-recipe-framework.md) for the full
contract (what a recipe declares, the **1-to-1 source guarantee** — the file
shown in the UI is the exact file that runs). Before opening a PR:

```
make validate   # every recipe's manifest, examples, and fixture references
make test        # the full suite
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full checklist.

## Environment variables

Every variable below is **optional** — a completely empty environment still
runs the full app in bring-your-own-key mode (a learner supplies their own
provider key per-request in the UI; no trial/rate-limiting activates without
`SKILLET_TRIAL_OPENAI_API_KEY` set). `make dev`/`make docker` copy the two
`.env.example` files below into real, gitignored `.env`/`.env.local` files on
first run if they don't already exist. Real, non-empty descriptions live in
those two files themselves (each var is commented out by default there) —
this table is the one consolidated index across both, not a duplicate copy.

| Var | Service | Required? | Default | Defined by |
|---|---|---|---|---|
| `SKILLET_CORS_ORIGINS` | backend | no | `http://localhost:3000` | `execution` |
| `SKILLET_TRIAL_OPENAI_API_KEY` | backend | no — absence = BYOK-only mode | unset | `trial-limits` |
| `UPSTASH_REDIS_REST_URL` | backend | only if a trial key is configured | — | `trial-limits` |
| `UPSTASH_REDIS_REST_TOKEN` | backend | only if a trial key is configured | — | `trial-limits` |
| `SKILLET_TRIAL_COOKIE_SECRET` | backend | only if a trial key is configured | — | `trial-limits` |
| `SKILLET_TRIAL_DAILY_BUDGET_USD` | backend | no | `5.00` | `trial-limits` |
| `SKILLET_TRIAL_DAILY_CAP` | backend | no | `2` | `trial-limits` |
| `NEXT_PUBLIC_BACKEND_URL` | frontend | no | `http://localhost:8000` | `execution` |

Full detail: [`backend/.env.example`](backend/.env.example),
[`frontend/.env.local.example`](frontend/.env.local.example).

## Deploy

The hosted demo runs the backend on [Render](https://render.com) and the
frontend on [Vercel](https://vercel.com) — both free tiers.

**Backend (Render):** click "New Blueprint Instance," point it at this repo
— [`render.yaml`](render.yaml) does the rest (free-tier Docker web service,
building `backend/Dockerfile`). Render prompts for each `sync: false`
variable during that first setup; every one is optional (see
[Environment variables](#environment-variables)) — leave any of them blank
for a BYOK-only hosted instance with no trial/rate-limiting.

**Frontend (Vercel):** import this repo, set the project's **root
directory** to `frontend/` — Next.js auto-detection handles the rest, no
committed `vercel.json` needed (a self-hoster's fork deploys exactly the
same way). Set `NEXT_PUBLIC_BACKEND_URL` in the Vercel project's environment
variables to the deployed Render backend's URL, then redeploy (it's inlined
at build time, not read at runtime). Once the frontend's real URL is known,
set the backend's `SKILLET_CORS_ORIGINS` on Render to that origin and
redeploy the backend too.

## License

[MIT](LICENSE).
