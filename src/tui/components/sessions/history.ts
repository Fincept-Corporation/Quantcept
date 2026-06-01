import { loadConfig } from "@core/config/load"
import { FinceptChat } from "@core/fincept/chat"
import { FinceptClient } from "@core/fincept/client"
import type { SessionRow } from "@core/storage"
import { formatRelativeTime } from "@shared/time"

/** A row in the resume picker / home Recent list — uniform across cloud + local. */
export interface SessionSummary {
  id: string
  title: string
  sub: string
  cloud: boolean
}

/** Chats live in the cloud plane when either axis is cloud (cloud generation always
 *  persists server-side; local generation persists to cloud only when storage=cloud). */
export function chatStoresCloud(): boolean {
  const c = loadConfig().chat
  return c.generation === "cloud" || c.storage === "cloud"
}

function makeChat(): FinceptChat | null {
  const f = loadConfig().fincept
  if (!f.apiKey) return null
  return new FinceptChat(new FinceptClient(f.baseUrl), f.apiKey, f.baseUrl)
}

const titleOf = (t: string | null | undefined) => t?.trim() || "(untitled)"

/** Local SessionStore rows → summaries (sync). */
export function localSummaries(rows: SessionRow[], currentId?: string): SessionSummary[] {
  return rows
    .filter((r) => r.id !== currentId)
    .map((r) => ({
      id: r.id,
      title: titleOf(r.title),
      sub: `${formatRelativeTime(r.updatedAt)} · ${r.msgCount} msgs`,
      cloud: false,
    }))
}

/** Recent cloud conversations → summaries. Empty on signed-out / network failure. */
export async function cloudSummaries(currentId?: string): Promise<SessionSummary[]> {
  const chat = makeChat()
  if (!chat) return []
  try {
    const r = await chat.listConversations(1, 50)
    return r.data.items
      .filter((c) => c.id !== currentId)
      .map((c) => ({
        id: c.id,
        title: titleOf(c.title),
        sub: `${formatRelativeTime(Date.parse(c.updated_at) || Date.now())} · ${c.message_count} msgs`,
        cloud: true,
      }))
  } catch {
    return []
  }
}
