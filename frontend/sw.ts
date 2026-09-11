import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";

// This file is the Serwist service worker entry (`swSrc` in next.config.ts).
// It is bundled by `@serwist/next`'s webpack `InjectManifest` plugin, not by
// the app's `tsc --noEmit` program — see next.config.ts. It therefore must
// not depend on TypeScript's ambient `webworker` lib, which the repo's
// tsconfig.json doesn't include (adding it would conflict with `dom`, the
// lib the rest of the app needs, in the same `tsc` program). Instead we type
// only the tiny slice of the global scope this file actually touches by
// shadowing `self` locally — see the `declare const self` below — rather
// than widening the whole program's ambient globals.
//
// Docs: https://serwist.pages.dev/docs/next/getting-started
//       https://serwist.pages.dev/docs/next/worker-exports#default-cache

declare const self: {
  // Injected at build time by `InjectManifest` (default `injectionPoint`:
  // `self.__SW_MANIFEST`) — the precache manifest for the app shell.
  __SW_MANIFEST?: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Serwist's Next.js-recommended runtime caching set (stale-while-revalidate
  // / network-first strategies per resource type). This is the offline-browse
  // *mechanism*; final "recipe source" cache rules land once `catalog` exists
  // — see docs/SPEC-app-shell.md Task 7 scope note.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
