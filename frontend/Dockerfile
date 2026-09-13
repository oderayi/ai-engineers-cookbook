# Multi-stage, bun-based build (SPEC-distribution.md Confirmed Decision 4):
# deps -> build -> run, on Next.js's `output: "standalone"` bundle. The
# same image serves local `docker compose up` and Vercel is NOT used for
# this image -- Vercel deploys straight from the repo via its own
# auto-detection (see the root README's deploy section); this Dockerfile is
# for local Docker Compose / any self-hoster who prefers a container over
# Vercel.

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Matches `bun run build` (`next build --webpack`) — Serwist's manifest
# injection is webpack-based; Turbopack (Next 16's default) refuses to run
# at all once a `webpack()` config key is present (see `next.config.ts`'s
# own comment on this). `NEXT_PUBLIC_BACKEND_URL` is inlined at this build
# step specifically, not read at container start -- overriding it later
# requires rebuilding the image, not just restarting the container.
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# `output: "standalone"` traces only the files actually needed at runtime
# into `.next/standalone` (a self-contained `node_modules`, no full install
# needed here) -- `public/` and `.next/static/` are deliberately excluded
# from that trace and must be copied alongside it by hand, per Next's own
# documented standalone-output contract.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
# `next start` does not support `output: "standalone"` (confirmed: Next
# itself warns "next start does not work with output: standalone
# configuration" and points at this exact invocation instead) -- the
# generated `server.js` is the officially supported way to run this output.
CMD ["bun", "run", "server.js"]
