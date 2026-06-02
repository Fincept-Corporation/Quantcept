// Bun's file loader: `import path from "<file>.wasm" with { type: "file" }` resolves to the
// on-disk path in dev and the embedded bunfs path in the compiled binary. Declared here so
// `tsc` (which does not model Bun's file loader) accepts the wasm imports in grammars.ts.
declare module "*.wasm" {
  const path: string
  export default path
}
