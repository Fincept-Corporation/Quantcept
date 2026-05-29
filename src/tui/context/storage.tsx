// src/tui/context/storage.tsx
import { type SessionRow, SessionStore, type TranscriptRecord } from "@core/storage"
import { logger } from "@shared/logger"
import { onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"

export const { use: useStorage, provider: StorageProvider } = createSimpleContext({
  name: "Storage",
  init: () => {
    let store: SessionStore | null = null
    try {
      store = new SessionStore()
    } catch (error) {
      logger.warn("storage unavailable; running without persistence", { error: String(error) })
    }
    onCleanup(() => store?.close())

    // Every method swallows errors — persistence must never break the UI.
    function guard<T>(fn: () => T, fallback: T): T {
      try {
        return store ? fn() : fallback
      } catch (error) {
        logger.warn("storage operation failed", { error: String(error) })
        return fallback
      }
    }

    return {
      enabled: store !== null,
      projectHashFor(cwd: string): string {
        return guard(() => store!.projectHashFor(cwd), "")
      },
      createSession(opts: { id: string; cwd: string; title?: string }): void {
        guard(() => store!.createSession(opts), undefined)
      },
      appendEvent(sessionId: string, record: TranscriptRecord): void {
        guard(() => store!.appendEvent(sessionId, record), undefined)
      },
      touch(sessionId: string, vals: { msgCount?: number; tokens?: number }): void {
        guard(() => store!.touch(sessionId, vals), undefined)
      },
      loadSession(sessionId: string): TranscriptRecord[] {
        return guard(() => store!.loadSession(sessionId), [])
      },
      listSessions(projectHash: string): SessionRow[] {
        return guard(() => store!.listSessions(projectHash), [])
      },
      ready: true,
    }
  },
})
