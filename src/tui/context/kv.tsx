import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import os from "os"
import path from "path"
import { createSignal } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { createSimpleContext } from "./helper"

function getKvPath() {
  const dir = path.join(os.homedir(), ".quantcept", "state")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return path.join(dir, "kv.json")
}

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false)
    const [store, setStore] = createStore<Record<string, any>>()
    const filePath = getKvPath()
    let write = Promise.resolve()

    try {
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, "utf-8"))
        setStore(data)
      }
    } catch {
      // ignore corrupt file
    }
    setReady(true)

    const result = {
      get ready() {
        return ready()
      },
      get store() {
        return store
      },
      get(key: string, defaultValue?: any) {
        return store[key] ?? defaultValue
      },
      set(key: string, value: any) {
        setStore(key, value)
        const snapshot = structuredClone(unwrap(store))
        write = write
          .then(() => writeFileSync(filePath, JSON.stringify(snapshot, null, 2)))
          .catch((error) => {
            console.error("Failed to write KV state", { filePath, error })
          })
      },
    }
    return result
  },
})
