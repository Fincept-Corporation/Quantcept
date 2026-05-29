// src/tui/context/snapshot.tsx
import { type FileDiff, SnapshotEngine, snapshotGitDir } from "@core/snapshot"
import { type Checkpoint, CheckpointStore } from "@core/storage/checkpoints"
import { projectHash } from "@core/storage/paths"
import { logger } from "@shared/logger"
import { onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"

export const { use: useSnapshot, provider: SnapshotProvider } = createSimpleContext({
  name: "Snapshot",
  init: () => {
    const cwd = process.cwd()
    const ph = projectHash(cwd)
    let engine: SnapshotEngine | null = null
    let store: CheckpointStore | null = null
    try {
      engine = new SnapshotEngine(cwd, snapshotGitDir(ph))
      engine.init()
      engine.prune()
      store = new CheckpointStore()
    } catch (error) {
      logger.warn("snapshot unavailable", { error: String(error) })
    }
    onCleanup(() => store?.close())

    function guard<T>(fn: () => T, fallback: T): T {
      try {
        return engine && store ? fn() : fallback
      } catch (error) {
        logger.warn("snapshot op failed", { error: String(error) })
        return fallback
      }
    }

    // Undo bookkeeping. `consumed` holds the ids of tool checkpoints already
    // undone, so undo always targets the newest NOT-yet-undone checkpoint —
    // robust even when a new edit (and checkpoint) lands between undos. The
    // redo stack pairs each undone checkpoint id with the post-edit tree to
    // reapply, in LIFO order.
    const consumed = new Set<string>()
    const redoStack: { checkpointId: string; redoHash: string }[] = []

    return {
      projectHash: ph,
      enabled: engine !== null && store !== null,

      /** Snapshot now; record a checkpoint row; return the tree hash. */
      track(sessionId: string, kind: "tool" | "turn", label: string): string | null {
        return guard(() => {
          const hash = engine!.track(label)
          if (hash) {
            store!.insert({
              id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              sessionId,
              projectHash: ph,
              treeHash: hash,
              kind,
              label,
              createdAt: Date.now(),
            })
          }
          return hash
        }, null)
      },

      /** Raw engine track without recording (used by executor pre-snapshot). */
      trackRaw(label: string): string | null {
        return guard(() => engine!.track(label), null)
      },
      revertTo(treeHash: string): void {
        guard(() => engine!.restore(treeHash), undefined)
      },
      diff(treeHash: string): FileDiff[] {
        return guard(() => engine!.diff(treeHash), [])
      },
      listCheckpoints(sessionId: string, kind?: "tool" | "turn"): Checkpoint[] {
        return guard(() => store!.listBySession(sessionId, kind), [])
      },

      /** Undo the most recent tool checkpoint not already undone. */
      undo(sessionId: string): { files: string[] } | null {
        return guard(() => {
          // Newest-first; pick the first checkpoint we haven't already undone.
          const tools = store!.listBySession(sessionId, "tool")
          const target = tools.find((c) => !consumed.has(c.id))
          if (!target) return null
          const current = engine!.track("pre-undo")
          const diffs = engine!.diff(target.treeHash)
          const files = diffs.map((d) => d.file)
          engine!.revert(target.treeHash, files)
          consumed.add(target.id)
          if (current) redoStack.push({ checkpointId: target.id, redoHash: current })
          return { files }
        }, null)
      },

      /** Re-apply the last undone change. */
      redo(): boolean {
        return guard(() => {
          const entry = redoStack.pop()
          if (!entry) return false
          engine!.restore(entry.redoHash)
          consumed.delete(entry.checkpointId) // it's undoable again
          return true
        }, false)
      },

      ready: true,
    }
  },
})
