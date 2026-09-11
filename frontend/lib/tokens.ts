/**
 * Typed references to the CSS custom properties defined in `app/globals.css`.
 *
 * Color/spacing/radius tokens are consumed via Tailwind utility classes
 * (`bg-primary`, `text-muted-foreground`, `rounded-lg`, ...) almost
 * everywhere — most components never need this file. It exists for the
 * handful of Skillet-only tokens that aren't wired into Tailwind's color/
 * radius scale (layout and motion), for the rare case a component needs the
 * raw value in JS (e.g. a duration passed to a JS timer that must match the
 * CSS transition it's paired with) rather than a class name.
 *
 * Never hardcode a duration, easing curve, or the sidebar width elsewhere —
 * reference these, or the equivalent `var(--token)` / `(--token)` Tailwind
 * arbitrary-value syntax, so there is exactly one place each is defined.
 */

export const tokens = {
  sidebarW: "var(--sidebar-w)",
  spaceGutter: "var(--space-gutter)",
  contentMax: "var(--content-max)",
  easeOut: "var(--ease-out)",
  durFast: "var(--dur-fast)",
  dur: "var(--dur)",
} as const;

export type TokenName = keyof typeof tokens;

/** Numeric milliseconds for the motion tokens, for JS code (e.g. a
 * `setTimeout` matched to a CSS transition) that can't consume a CSS
 * variable directly. Keep in sync with `--dur-fast` / `--dur` in
 * `globals.css` by hand — there's no build-time link between the two.
 */
export const durationsMs = {
  fast: 120,
  base: 200,
} as const;
