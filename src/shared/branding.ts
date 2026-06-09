// Product-facing branding for the AI engine.
//
// The backend runs MiniMax (or any Anthropic-compatible engine) — that is
// infrastructure and must NEVER surface in the UI. Everywhere a model name is
// shown to the user it reads as the product brand instead. The real model id is
// still used unchanged on the wire (provider calls, pricing keys, config edit);
// this only rewrites what is DISPLAYED.

/** The single product name for the assistant/engine shown anywhere in the UI. */
export const PRODUCT_AI_NAME = "FinceptAI"

/**
 * Map a raw model id to its user-facing name. Any MiniMax (backend) model — or a
 * missing model — renders as {@link PRODUCT_AI_NAME}; an explicitly-configured
 * non-MiniMax model is shown as-is. Display only; never feed the result back to
 * the provider or a config write.
 */
export function displayModel(model?: string | null): string {
  if (!model) return PRODUCT_AI_NAME
  return /minimax/i.test(model) ? PRODUCT_AI_NAME : model
}
