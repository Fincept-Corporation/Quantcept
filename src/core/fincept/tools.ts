import { loadConfig } from "@core/config/load"
import { buildTool, type Tool, type ToolResult } from "@core/tools/Tool"
import { FinceptAuthError, FinceptError, InsufficientCreditsError } from "@shared/errors"
import { z } from "zod/v4"
import { FinceptClient, type FinceptResult } from "./client"
import { FinceptMarket } from "./market"
import { FinceptResearch } from "./research"

/** Map the typed Fincept errors to clear agent-facing tool errors. */
function mapErr(e: unknown): ToolResult {
  if (e instanceof InsufficientCreditsError) {
    return {
      output: `Insufficient credits: need ${e.required}, have ${e.available}. Top up in Settings → Billing.`,
      isError: true,
    }
  }
  if (e instanceof FinceptAuthError) {
    return { output: "Not signed in to Fincept — authenticate at startup, then retry.", isError: true }
  }
  return { output: e instanceof FinceptError ? e.message : String((e as Error)?.message ?? e), isError: true }
}

/** Title with the server-reported credit cost + remaining balance, when present. */
function ctitle(base: string, r: FinceptResult<unknown>): string {
  return r.creditsCost ? `${base} · ${r.creditsCost}cr (${r.creditsBalance ?? "?"} left)` : base
}

/** Run a Fincept client call as a structured tool result (raw backend payload as output). */
async function run<T>(p: Promise<FinceptResult<T>>, title: string): Promise<ToolResult> {
  try {
    const r = await p
    return { output: r.data, title: ctitle(title, r) }
  } catch (e) {
    return mapErr(e)
  }
}

const sym = z.object({
  symbol: z.string().describe("Ticker symbol, e.g. AAPL or RELIANCE"),
  exchange: z.string().optional(),
})

/**
 * Agent tools backed by the Fincept market API. Each reads the persisted key +
 * baseUrl fresh from config (so it works once the user has signed in), and is
 * credit-metered server-side. Registered via registerBuiltinTools.
 */
export function createFinceptTools(): Tool[] {
  const client = new FinceptClient(loadConfig().fincept.baseUrl)
  const token = () => loadConfig().fincept.apiKey
  const market = new FinceptMarket(client, token)
  const research = new FinceptResearch(client, token)

  return [
    buildTool({
      name: "fincept_market_search",
      description: "Search Fincept for stock tickers by company name or symbol.",
      inputSchema: z.object({ query: z.string(), limit: z.number().int().min(1).max(50).optional() }),
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.search(i.query, i.limit), `search ${i.query}`),
    }),
    buildTool({
      name: "fincept_market_indices",
      description: "List major global market indices (S&P 500, NASDAQ, NIFTY, SENSEX, etc.) with current levels.",
      inputSchema: z.object({}),
      effectClass: "read",
      isReadOnly: () => true,
      call: () => run(market.indices(), "indices"),
    }),
    buildTool({
      name: "fincept_ticker_price",
      description: "Latest price for a ticker (1 credit).",
      inputSchema: sym,
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.price(i.symbol, i.exchange), `price ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_ticker_info",
      description: "Company profile for a ticker (name, sector, market cap, P/E, 52-week range) (1 credit).",
      inputSchema: sym,
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.info(i.symbol, i.exchange), `info ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_ticker_history",
      description: "Historical OHLCV for a ticker (1 credit). period e.g. 1d,5d,1mo,1y,max; interval e.g. 1d,1h,1wk.",
      inputSchema: z.object({
        symbol: z.string(),
        period: z.string().optional(),
        interval: z.string().optional(),
        exchange: z.string().optional(),
      }),
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) =>
        run(
          market.history(i.symbol, { period: i.period, interval: i.interval, exchange: i.exchange }),
          `history ${i.symbol}`,
        ),
    }),
    buildTool({
      name: "fincept_ticker_financials",
      description: "Income/balance/cashflow financials for a ticker (2 credits). Set quarterly=true for quarterly.",
      inputSchema: z.object({ symbol: z.string(), quarterly: z.boolean().optional(), exchange: z.string().optional() }),
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) =>
        run(market.financials(i.symbol, { quarterly: i.quarterly, exchange: i.exchange }), `financials ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_ticker_holders",
      description: "Major + institutional holders for a ticker (2 credits).",
      inputSchema: sym,
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.holders(i.symbol, i.exchange), `holders ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_ticker_analyst",
      description: "Analyst recommendations & price targets for a ticker (1 credit).",
      inputSchema: sym,
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.analyst(i.symbol, i.exchange), `analyst ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_ticker_dividends",
      description: "Dividend history for a ticker (1 credit).",
      inputSchema: sym,
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) => run(market.dividends(i.symbol, i.exchange), `dividends ${i.symbol}`),
    }),
    buildTool({
      name: "fincept_research_llm",
      description:
        "Run a one-shot LLM inference for an isolated sub-analysis or second opinion (5 credits). Set thinking=true for extended reasoning. Server-cached for 1h.",
      inputSchema: z.object({
        prompt: z.string().max(50000),
        thinking: z.boolean().optional(),
        max_tokens: z.number().int().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        model: z.string().optional(),
      }),
      effectClass: "read",
      isReadOnly: () => true,
      call: async (i) => {
        try {
          const r = await research.llm(i.prompt, {
            thinking: i.thinking,
            maxTokens: i.max_tokens,
            temperature: i.temperature,
            model: i.model,
          })
          const out = r.data.thinking ? `${r.data.thinking}\n\n---\n\n${r.data.response}` : r.data.response
          return { output: out, title: ctitle("llm", r) }
        } catch (e) {
          return mapErr(e)
        }
      },
    }),
    buildTool({
      name: "fincept_visual_analysis",
      description:
        "Analyze an image (chart, document, screenshot) at a public URL with a vision model — gives the agent 'eyes' (10 credits).",
      inputSchema: z.object({
        image_url: z.string().url(),
        prompt: z.string(),
        max_tokens: z.number().int().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
      }),
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) =>
        run(
          research.visualAnalysis(i.image_url, i.prompt, { maxTokens: i.max_tokens, temperature: i.temperature }),
          `visual ${i.image_url.slice(0, 40)}`,
        ),
    }),
    buildTool({
      name: "fincept_grokipedia",
      description:
        "Look up a Grokipedia knowledge-base article by slug (1 credit). Set citations=true to include sources.",
      inputSchema: z.object({
        slug: z.string().max(200),
        extract_refs: z.boolean().optional(),
        truncate: z.number().int().min(1).optional(),
        citations: z.boolean().optional(),
      }),
      effectClass: "read",
      isReadOnly: () => true,
      call: (i) =>
        run(
          research.grokipedia(i.slug, { extractRefs: i.extract_refs, truncate: i.truncate, citations: i.citations }),
          `grokipedia ${i.slug}`,
        ),
    }),
  ]
}
