import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Serwist's generated service-worker bundle (public/sw.js) — fully
    // regenerated per build, not source. Add swe-worker-*.js too if
    // cacheOnNavigation is ever enabled.
    "public/sw.js",
    "public/swe-worker-*.js",
  ]),
]);

export default eslintConfig;
