import { loadConfig } from "@core/config/load"
import { clearFinceptAuth, setFinceptAuth } from "@core/config/persist"
import { type Account, FinceptAuth, FinceptClient, type RegisterReq } from "@core/fincept"
import { FinceptAuthError } from "@shared/errors"
import { createSignal, onMount } from "solid-js"
import { createSimpleContext } from "./helper"

export type AuthStatus = "checking" | "authed" | "unauthed" | "offline"

/**
 * Owns Fincept auth state for the whole app. Seeds the key from loadConfig() (user settings),
 * validates it on mount, and persists changes back to user settings. The mandatory gate in
 * App() renders based on `status`. Graceful-offline: a network failure during validation keeps
 * a previously-stored key usable (status "offline") rather than locking the user out.
 */
export const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  init: (props: { baseUrl?: string }) => {
    const cfg = loadConfig().fincept
    const client = new FinceptClient(props.baseUrl ?? cfg.baseUrl)
    const auth = new FinceptAuth(client)

    const [status, setStatus] = createSignal<AuthStatus>("checking")
    const [account, setAccount] = createSignal<Account | undefined>()
    const [token, setToken] = createSignal<string | undefined>(cfg.apiKey)
    const [error, setError] = createSignal<string | undefined>()

    async function refresh() {
      const t = token()
      if (!t) {
        setStatus("unauthed")
        return
      }
      setStatus("checking")
      try {
        const r = await auth.status(t)
        if (r.data.authenticated) {
          const me = await auth.me(t)
          setAccount(me.data)
          setFinceptAuth({ lastValidatedAt: new Date().toISOString() })
          setStatus("authed")
        } else {
          clearFinceptAuth()
          setToken(undefined)
          setStatus("unauthed")
        }
      } catch (e) {
        if (e instanceof FinceptAuthError) {
          clearFinceptAuth()
          setToken(undefined)
          setStatus("unauthed")
        } else {
          // network/other — trust the stored key, enter offline (graceful-offline decision)
          setStatus("offline")
        }
      }
    }

    function adopt(t: string, partial: { userId?: string; email?: string; username?: string }) {
      setToken(t)
      setFinceptAuth({ apiKey: t, ...partial, lastValidatedAt: new Date().toISOString() })
    }

    onMount(refresh)

    return {
      get status() {
        return status()
      },
      get account() {
        return account()
      },
      get error() {
        return error()
      },
      clearError: () => setError(undefined),

      register: async (req: RegisterReq) => {
        setError(undefined)
        try {
          await auth.register(req)
          return true
        } catch (e) {
          setError((e as Error).message)
          return false
        }
      },
      verifyOtp: async (email: string, otp: string) => {
        setError(undefined)
        try {
          const r = await auth.verifyOtp(email, otp)
          adopt(r.data.api_key, { userId: r.data.user_id, email })
          await refresh()
          return true
        } catch (e) {
          setError((e as Error).message)
          return false
        }
      },
      login: async (email: string, password: string, forceLogin = false) => {
        setError(undefined)
        try {
          const r = await auth.login(email, password, forceLogin)
          adopt(r.data.api_key, { userId: r.data.user_id, email: r.data.email, username: r.data.username })
          await refresh()
          return true
        } catch (e) {
          setError((e as Error).message)
          return false
        }
      },
      logout: async () => {
        const t = token()
        if (t) {
          try {
            await auth.logout(t)
          } catch {
            /* best-effort — clear locally regardless */
          }
        }
        clearFinceptAuth()
        setToken(undefined)
        setAccount(undefined)
        setStatus("unauthed")
      },
      regenerate: async () => {
        const t = token()
        if (!t) return
        try {
          const r = await auth.regenerate(t)
          adopt(r.data.api_key, {})
          await refresh()
        } catch (e) {
          setError((e as Error).message)
        }
      },
      refresh,
    }
  },
})

export type AuthContext = ReturnType<typeof useAuth>
