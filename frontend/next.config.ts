import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// @serwist/next's InjectManifest plugin is webpack-based, so it adds a
// `webpack()` function to the Next config. Next.js 16 builds with Turbopack
// by default and refuses to build when a `webpack` config is present, so the
// "build" script in package.json opts back into webpack (`next build
// --webpack`) — `next dev` stays on Turbopack; Serwist's manifest injection
// is a build-time-only concern. See docs/SPEC-app-shell.md Task 7 and
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
// ("Turbopack by default").
const withSerwist = withSerwistInit({
  swSrc: "sw.ts",
  swDest: "public/sw.js",
  // Manifest injection only matters for production builds; skip it (and the
  // Turbopack-mismatch warning) during `next dev`.
  disable: process.env.NODE_ENV !== "production",
});

export default withSerwist(nextConfig);
