This is an AI Engineer's Cookbook.
It comprises of a Next.js frontend and Python FastAPI backend.
It has the look and feel of OpenAI desktop application.
It can be viewed on the web and at the same time installed on the desktop (i.e PWA).
It is an open source project MIT license.

## Goals
- Help begineer AI engineers learn AI engineering (Agentic, RAG etc) concepts faster hands-on in a clean self-contained application.
- Present clear use-cases and code to achieve them

## Audience
- Backend or fullstack engineers trying to break into AI engineering but confused about where to start due to the noise.

## What it does
- To help begineers in AI Engineering understand concepts hands-on
- On the left side of the display, it has a list of recipes that can be clicked
- Then it displays a description of the recipe (colapsible)
- Below that it displays the source code properly formated as code (also colapsible)
- Below that it displays the front end form to actually run the cookbook with inputs for environment variables (e.g OPENAI_API_KEY) and other env vars specific to that recipe
- Some settings will be global default (like model providers' API keys) which can be overriden in the recipes.
- If a env var is not set in the recipe, the global default is used and noted that is copied from global.
- Settings are persisted for each user locally
- The form also contains other inputs e.g to upload a custom list of documents used in a RAG pipeline.
- All inputs will be specific to the recipe, all it needs to actually run but allows the user to change the parameters via the UI
- The code displayed is 1-to-1 mapped to the actuall source run at the backend
- We do need to secure the platform so that bad actors cannot mess up the system.
- Users can also specify custom backend URL because they will be able to clone the backend repo too and customize it. MIT license.
- UI should be simple, uncluttered, subtly animated for premium UX.


## How we build
We build the frontend first and iterate to make sure it looks perfect. Use sample data to just fill it in first.
Then we build the backend.

## Framework Decisions
- Frontend: Next.js, shadcn/ui, Tailwind
- Backend: FastAPI

## Additional details
- The frontend should allow multiple tabs of recipees to be opened like in RunJS app
- Both FE/BE can also be packaged as docker compose for easier deployment locally and cloud later
- (v2) We can have a demo hosted freely with Vercel and Render. For the demo, there will be no run button until the user has supplied their own keys.
- We use uv not pip for python deps.
- Users can add their own recipes and save them for later use.
- Test-driven-development is CRUCIAL. Generated codes in large amount are hard to review.
- Parallelize heavily - use multiple agents where tasks can be safely paralellized.
- Agent: Use sub-agents for faster delivery where necessary.

## Questions I have
- Should I build this with Rust or Next.js/Python?
- Should we support Electron packaging like ChatGPT?

----
## Interview-me summary
- Outcome: A polished open-source web app where beginner AI engineers learn AI-engineering concepts by reading real recipe source and running it live — grouped by theme, ordered basic → advanced within each group.
- User: Beginners who know Python basics but have never built RAG / agents / evals. Primary driver is reach; a portfolio trophy is the welcome bonus.
Why now: You've learned this material and found it teaches far better as a hands-on app than as prose; you want to get that in front of as many people as possible.
- Success: Someone lands on the hosted URL and runs their first recipe with zero setup (keyless, your key, capped at 1–2/day behind a global spend kill-switch), then either adds their own key or clones the repo (uv or Docker, both first-class) to run everything locally.
- Constraint: Your time — specifically authoring genuinely good, pedagogically-ordered recipes. So v1 ships few recipes (3–4) but a rock-solid recipe framework: one Python module per recipe, executed by the backend and displayed byte-for-byte in the UI (true 1-to-1, single source of truth), with global settings that recipes inherit and can override.
- v1 includes: hosted demo + IP/cookie rate limiting (Upstash Redis), 3–4 recipes across 2–3 groups, local clone via uv + Docker, multi-tab recipes, settings override/inheritance, progress tracking (localStorage), OpenAI-desktop look, PWA, MIT.
- Out of scope for v1: accounts/login, server-side or cross-device progress sync, Electron packaging, cross-group linear curriculum path, Rust.