import { loadConfig } from "@core/config/load"
import { clearFinceptAuth, setFinceptAuth } from "@core/config/persist"
import {
  type Account,
  FinceptAccount,
  FinceptAuth,
  FinceptBilling,
  FinceptClient,
  FinceptLearnings,
  type FinceptSession,
  FinceptSync,
  FinceptTelegram,
  type RegisterReq,
  type SocialProvider,
  startSocialLogin,
  subscribeCredits,
  subscribeSessionInvalidated,
} from "@core/fincept"
import { LearningsSidecar } from "@core/learnings/sidecar"
import { FinceptAuthError, FinceptError, SocialLoginRequiredError } from "@shared/errors"
import { openBrowser } from "@shared/open-browser"
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
    const knowledgeCfg = loadConfig().knowledge
    const baseUrl = props.baseUrl ?? cfg.baseUrl

    const [status, setStatus] = createSignal<AuthStatus>("checking")
    const [account, setAccount] = createSignal<Account | undefined>()
    const [session, setSession] = createSignal<FinceptSession | undefined>(
      cfg.apiKey ? { apiKey: cfg.apiKey, sessionToken: cfg.sessionToken } : undefined,
    )
    const [error, setError] = createSignal<string | undefined>()
    const [interruptedReason, setInterruptedReason] = createSignal<string | undefined>()

    const apiKey = () => session()?.apiKey
    const client = new FinceptClient(baseUrl, undefined, () => session())
    const auth = new FinceptAuth(client)

    // Account + billing services bound to the live key — Settings UI calls these.
    const accountApi = new FinceptAccount(client, apiKey)
    const billing = new FinceptBilling(client, apiKey)
    // Cloud-sync (watchlists/notes/portfolios) + community learnings — the /cloud and /learnings modals call these.
    const sync = new FinceptSync(client, apiKey)
    const learnings = new FinceptLearnings(client, apiKey)
    const telegram = new FinceptTelegram(client, apiKey)
    // P2P learnings client (drives the Go `learnings` sidecar binary). The
    // tracker URL is learned from /stats so the sidecar can seed.
    const [trackerUrl, setTrackerUrl] = createSignal<string | undefined>(undefined)
    const learningsSidecar = new LearningsSidecar({
      apiUrl: baseUrl,
      token: apiKey,
      trackerUrl: () => trackerUrl(),
    })

    // "Connected to the network by default": when signed in, seed downloaded
    // learnings in the background to contribute to the swarm. Opt out via
    // fincept.seedByDefault=false. Graceful no-op if the sidecar binary or a
    // tracker URL isn't available, so it never blocks or breaks sign-in.
    let seedHandle: { stop: () => void } | undefined
    async function connectToNetwork() {
      if (cfg.seedByDefault === false || seedHandle) return
      try {
        const r = await learnings.stats()
        const url = r.data?.tracker_url
        if (!url) return
        setTrackerUrl(url)
        seedHandle = learningsSidecar.seedStart()
        // Pull the latest knowledge corpus snapshot (corpus.json) in the
        // background so local routing has an offline fallback. Fire-and-forget;
        // the sidecar never throws (returns an {event:"error"} on failure).
        if (knowledgeCfg.syncCorpus !== false) void learningsSidecar.sync()
      } catch {
        /* offline / sidecar unavailable — user can still download on demand */
      }
    }

    async function refresh() {
      const t = apiKey()
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
          void connectToNetwork()
        } else {
          clearFinceptAuth()
          setSession(undefined)
          setStatus("unauthed")
        }
      } catch (e) {
        if (e instanceof FinceptAuthError) {
          clearFinceptAuth()
          setSession(undefined)
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
      const t = apiKey()
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

    function adopt(s: FinceptSession, partial: { userId?: string; email?: string; username?: string }) {
      setSession(s)
      setFinceptAuth({
        apiKey: s.apiKey,
        sessionToken: s.sessionToken,
        ...partial,
        lastValidatedAt: new Date().toISOString(),
      })
    }

    onMount(refresh)

    // Live-sync the displayed balance: any Fincept call (UI or agent tool) that returns a fresh
    // Credits-Balance header patches account.credit_balance — no manual refresh needed.
    const unsubCredits = subscribeCredits((balance) => {
      setAccount((a) => (a ? { ...a, credit_balance: balance } : a))
    })
    const unsubInvalidated = subscribeSessionInvalidated((reason) => {
      clearFinceptAuth()
      setSession(undefined)
      setAccount(undefined)
      setInterruptedReason(
        reason === "session_invalidated"
          ? "Signed in on another device — please log in again."
          : "Session ended — please log in again.",
      )
      setStatus("unauthed")
    })
    onCleanup(() => {
      unsubCredits()
      unsubInvalidated()
      seedHandle?.stop()
    })

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
          adopt({ apiKey: r.data.api_key, sessionToken: r.data.session_token }, { userId: r.data.user_id, email })
          return "ok"
        } catch (e) {
          const code = e instanceof FinceptError ? e.code : ""
          setError((e as Error).message)
          return code === "otp_expired" || code === "too_many_attempts" ? "expired" : "error"
        }
      },
      login: async (
        email: string,
        password: string,
        forceLogin = false,
      ): Promise<"ok" | "unverified" | "active_session" | "use_social" | "error"> => {
        setError(undefined)
        try {
          const r = await auth.login(email, password, forceLogin)
          adopt(
            { apiKey: r.data.api_key, sessionToken: r.data.session_token },
            { userId: r.data.user_id, email: r.data.email, username: r.data.username },
          )
          await refresh()
          return "ok"
        } catch (e) {
          // This account uses a social provider (no password) — route to social sign-in.
          if (e instanceof SocialLoginRequiredError) return "use_social"
          // Unverified email: the backend just issued a fresh OTP — route to OTP entry.
          if (e instanceof FinceptError && e.code === "account_not_verified") return "unverified"
          // Already signed in elsewhere — the gate offers a one-key "take over" confirm
          // (which retries with forceLogin). Don't surface the raw force_login message.
          if (e instanceof FinceptError && e.code === "active_session_exists") return "active_session"
          setError((e as Error).message)
          return "error"
        }
      },
      socialLogin: async (provider: SocialProvider): Promise<"ok" | "error"> => {
        setError(undefined)
        try {
          const s = await startSocialLogin(provider, { baseUrl, open: openBrowser })
          adopt(s, {})
          await refresh()
          return "ok"
        } catch (e) {
          setError((e as Error).message)
          return "error"
        }
      },
      logout: async () => {
        const t = apiKey()
        if (t) {
          try {
            await auth.logout(t)
          } catch {
            /* best-effort — clear locally regardless */
          }
        }
        clearFinceptAuth()
        setSession(undefined)
        setAccount(undefined)
        setStatus("unauthed")
      },
      regenerate: async () => {
        const t = apiKey()
        if (!t) return
        try {
          const r = await auth.regenerate(t)
          // Rotating the long-lived API key does NOT end the device session, so keep the current
          // sessionToken. If the backend ever invalidates the session on key-regen, the next call
          // 401s with session_invalidated and we re-gate — safe either way, never a silent break.
          adopt({ apiKey: r.data.api_key, sessionToken: session()?.sessionToken }, {})
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
      get interruptedReason() {
        return interruptedReason()
      },
      clearInterrupted: () => setInterruptedReason(undefined),
      telegram,
      accountApi,
      billing,
      sync,
      learnings,
      learningsSidecar,
      refresh,
      reloadAccount,
    }
  },
})

export type AuthContext = ReturnType<typeof useAuth>
