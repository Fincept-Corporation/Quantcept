import { loadConfig } from "@core/config/load"
import { buildTool, type Tool, type ToolResult } from "@core/tools/Tool"
import { FinceptAuthError, FinceptError, InsufficientCreditsError } from "@shared/errors"
import { z } from "zod/v4"
import { FinceptClient, type FinceptResult } from "./client"
import { FinceptMarket } from "./market"

/** Run a Fincept client call as a tool result, mapping the typed errors to clear agent-facing text. */
async function run<T>(p: Promise<FinceptResult<T>>, title: string): Promise<ToolResult> {
  try {
    const r = await p
    const t = r.creditsCost ? `${title} · ${r.creditsCost}cr (${r.creditsBalance ?? "?"} left)` : title
    return { output: r.data, title: t }
  } catch (e) {
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
  const market = new FinceptMarket(new FinceptClient(loadConfig().fincept.baseUrl), () => loadConfig().fincept.apiKey)

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
  ]
}
