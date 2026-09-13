import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `distribution`'s Docker image copies only this standalone output (plus
  // `public/` and `.next/static/`) into its final stage, not the full
  // `node_modules` tree — see `frontend/Dockerfile`. Harmless for `next dev`,
  // which ignores `output` entirely.
  output: "standalone",
};

// @serwist/next's InjectManifest plugin is webpack-based, so wrapping the
// config with it adds a `webpack()` function *unconditionally* — the
// `disable` option only skips Serwist's own runtime logic, it does not stop
// that key from being added. Next.js 16 refuses to run *either* `next dev`
// or `next build` under Turbopack (the default for both) when a `webpack`
// config is present, so the wrapped config must only ever be exported for an
// actual production build — never for dev, where Turbopack must see a config
// with no `webpack` key at all. The "build" script in package.json also opts
// back into webpack (`next build --webpack`) for the one command that needs
// Serwist's manifest injection; `next dev`/`next start` stay on Turbopack.
// See docs/SPEC-app-shell.md Task 7 and
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
// ("Turbopack by default").
const withSerwist = withSerwistInit({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
});

export default process.env.NODE_ENV === "production" ? withSerwist(nextConfig) : nextConfig;
