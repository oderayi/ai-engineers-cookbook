import type { MetadataRoute } from "next";

// Next.js metadata route: served at /manifest.webmanifest.
// The real Skillet brand colors (SPEC-app-shell.md Confirmed Decision 6/7's
// warm accent, `oklch(0.58 0.16 40)` / hex approximation `#C2410C`, and its
// light-neutral background) behind the real Skillet mark — see
// `public/brand/skillet-mark.svg` and `scripts/generate-icons.py`, which
// generated every icon below from that one source.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Skillet",
    short_name: "Skillet",
    description: "The AI engineer's cookbook.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF9",
    theme_color: "#C2410C",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
