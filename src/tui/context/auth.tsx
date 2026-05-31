import { loadConfig } from "@core/config/load"
import { clearFinceptAuth, setFinceptAuth } from "@core/config/persist"
import {
  type Account,
  FinceptAccount,
  FinceptAuth,
  FinceptBilling,
  FinceptClient,
  FinceptLearnings,
  FinceptSync,
  type RegisterReq,
  subscribeCredits,
} from "@core/fincept"
import { FinceptAuthError, FinceptError } from "@shared/errors"
import { createSignal, onCleanup, onMount } from "solid-js"
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
    // Account + billing services bound to the live token — Settings UI calls these.
    const accountApi = new FinceptAccount(client, token)
    const billing = new FinceptBilling(client, token)
    // Cloud-sync (watchlists/notes/portfolios) + community learnings — the /cloud and /learnings modals call these.
    const sync = new FinceptSync(client, token)
    const learnings = new FinceptLearnings(client, token)

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

    /**
     * Re-fetch ONLY the account (/me) without flipping the global gate to "checking" (which would
     * blank the screen). Recovers an "offline" session to "authed" on success. The account UI calls
     * this so opening it always pulls fresh data — and self-heals if startup validation went offline.
     */
    async function reloadAccount() {
      const t = token()
      if (!t) return
      try {
        const me = await auth.me(t)
        setAccount(me.data)
        setFinceptAuth({ lastValidatedAt: new Date().toISOString() })
        if (status() !== "authed") setStatus("authed")
      } catch {
        /* keep current status; the account view falls back to the stored email/username */
      }
    }

    function adopt(t: string, partial: { userId?: string; email?: string; username?: string }) {
      setToken(t)
      setFinceptAuth({ apiKey: t, ...partial, lastValidatedAt: new Date().toISOString() })
    }

    onMount(refresh)

    // Live-sync the displayed balance: any Fincept call (UI or agent tool) that returns a fresh
    // Credits-Balance header patches account.credit_balance — no manual refresh needed.
    const unsubCredits = subscribeCredits((balance) => {
      setAccount((a) => (a ? { ...a, credit_balance: balance } : a))
    })
    onCleanup(() => unsubCredits())

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
      verifyOtp: async (email: string, otp: string): Promise<"ok" | "expired" | "error"> => {
        setError(undefined)
        try {
          const r = await auth.verifyOtp(email, otp)
          // Adopt the key but DON'T flip the gate yet — AuthGate shows a result screen for a beat,
          // then calls reloadAccount() to transition into the app.
          adopt(r.data.api_key, { userId: r.data.user_id, email })
          return "ok"
        } catch (e) {
          const code = e instanceof FinceptError ? e.code : ""
          setError((e as Error).message)
          return code === "otp_expired" || code === "too_many_attempts" ? "expired" : "error"
        }
      },
      login: async (email: string, password: string, forceLogin = false): Promise<"ok" | "unverified" | "error"> => {
        setError(undefined)
        try {
          const r = await auth.login(email, password, forceLogin)
          adopt(r.data.api_key, { userId: r.data.user_id, email: r.data.email, username: r.data.username })
          await refresh()
          return "ok"
        } catch (e) {
          // Unverified email: the backend just issued a fresh OTP — route to OTP entry.
          if (e instanceof FinceptError && e.code === "account_not_verified") return "unverified"
          setError((e as Error).message)
          return "error"
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
      requestPasswordReset: async (email: string) => {
        setError(undefined)
        try {
          await auth.requestPasswordReset(email)
          return true
        } catch (e) {
          setError((e as Error).message)
          return false
        }
      },
      confirmPasswordReset: async (code: string, email: string, newPassword: string) => {
        setError(undefined)
        try {
          await auth.confirmPasswordReset(code, email, newPassword)
          return true
        } catch (e) {
          setError((e as Error).message)
          return false
        }
      },
      accountApi,
      billing,
      sync,
      learnings,
      refresh,
      reloadAccount,
    }
  },
})

export type AuthContext = ReturnType<typeof useAuth>
