import { QuantceptError } from "@shared/errors"
import { type MarketplaceIndex, MarketplaceIndexSchema } from "./schema"

type Fetcher = (url: string) => Promise<Response>

export async function fetchMarketplaceIndex(url: string, fetcher: Fetcher = fetch): Promise<MarketplaceIndex> {
  const res = await fetcher(url)
  if (!res.ok) throw new QuantceptError(`Failed to fetch marketplace index: ${url}`, "MARKETPLACE")
  const data = await res.json()
  const parsed = MarketplaceIndexSchema.safeParse(data)
  if (!parsed.success) throw new QuantceptError(`Invalid marketplace index: ${parsed.error.message}`, "MARKETPLACE")
  return parsed.data
}
