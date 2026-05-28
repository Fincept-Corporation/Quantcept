import { z } from "zod/v4"

export const MarketplaceEntrySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  description: z.string().optional(),
})

export const MarketplaceIndexSchema = z.object({
  plugins: z.array(MarketplaceEntrySchema),
})

export type MarketplaceIndex = z.infer<typeof MarketplaceIndexSchema>
