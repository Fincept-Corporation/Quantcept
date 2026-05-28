import { z } from "zod/v4"

export const PluginManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  skillsPaths: z.array(z.string()).default(["./skills"]),
  author: z.object({ name: z.string(), email: z.string().optional() }).optional(),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>
