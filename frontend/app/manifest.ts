import type { MetadataRoute } from "next";

// Next.js metadata route: served at /manifest.webmanifest.
// Colors are placeholders, not final branding — see docs/SPEC-app-shell.md
// Confirmed Decision 6/7 for the warm accent (`oklch(0.58 0.16 40)`, hex
// approximation `#C2410C`) and the light-neutral default background.
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
