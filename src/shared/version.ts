/**
 * Single source of truth for the running app version.
 *
 * `QUANTCEPT_VERSION` is injected at build time by Bun's `define` (see script/build.ts),
 * sourced from package.json. It does not exist when running from source (`bun run dev`),
 * so the `typeof` guard falls back to a dev marker — `typeof` on an undeclared identifier
 * is the one safe reference that returns "undefined" instead of throwing.
 */
declare const QUANTCEPT_VERSION: string | undefined

export const VERSION: string = typeof QUANTCEPT_VERSION === "string" ? QUANTCEPT_VERSION : "0.0.0-dev"
