import { defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { Logo } from "@tui/components/logo"
import { useAuth } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import { filterCountries } from "./countries"

type Mode = "landing" | "register" | "otp" | "login" | "reset"

interface AuthField {
  key: string
  label: string
  secret?: boolean
  hint?: string
}

const REGISTER_FIELDS: AuthField[] = [
  { key: "username", label: "Username (3–50 chars)", hint: "Letters, numbers, hyphens and underscores only." },
  { key: "email", label: "Email", hint: "A one-time code is emailed here to verify — enter a real, correct address." },
  { key: "password", label: "Password (min 8 chars)", secret: true },
  { key: "phone", label: "Phone (7–15 digits)", hint: "Just the number — you'll pick the country code next." },
]

const LOGIN_FIELDS: AuthField[] = [
  { key: "email", label: "Email" },
  { key: "password", label: "Password", secret: true },
]

const RESET_FIELDS: AuthField[] = [
  { key: "email", label: "Email", hint: "Where the reset code will be sent." },
  { key: "code", label: "Reset code (from email)" },
  { key: "new_password", label: "New password", secret: true },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[A-Za-z0-9_-]{3,50}$/

/** Client-side validation mirroring the backend's register rules — fail fast before the round-trip. */
function validateField(key: string, text: string): string | undefined {
  if (key === "username") {
    return USERNAME_RE.test(text) ? undefined : "Username must be 3–50 chars: letters, numbers, hyphens, underscores."
  }
  if (key === "email") {
    return EMAIL_RE.test(text)
      ? undefined
      : "That doesn't look like a valid email — a verification code will be sent there."
  }
  if (key === "new_password" || key === "password") {
    // Login doesn't need the min-length nudge; only enforce on register/reset.
    return undefined
  }
  if (key === "phone") {
    const digits = text.replace(/\D/g, "")
    return digits.length >= 7 && digits.length <= 15 ? undefined : "Phone must be 7–15 digits."
  }
  return undefined
}

// Enter submits the current field; never inserts a newline (single-line entry).
const fieldKeyBindings = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  ...defaultTextareaKeyBindings.filter((b) => b.name !== "return" && b.name !== "kpenter" && b.name !== "linefeed"),
]

/**
 * The mandatory auth gate. A single focused input walks one field at a time, with client-side
 * validation (email/username/phone) before each step. Register ends with a searchable country-code
 * picker (sets country + country_code), then email OTP.
 *  - landing → 'login' | 'register' | 'reset'
 *  - register → username/email/password/phone → country picker → OTP
 *  - login → ok | unverified (→ otp) | error
 *  - reset → email (request code) → code + new password → back to login
 */
export function AuthGate() {
  const { theme } = useTheme()
  const auth = useAuth()
  const renderer = useRenderer()

  const [mode, setMode] = createSignal<Mode>("landing")
  const [values, setValues] = createSignal<Record<string, string>>({})
  const [fieldIndex, setFieldIndex] = createSignal(0)
  const [otpEmail, setOtpEmail] = createSignal("")
  const [forceLogin, setForceLogin] = createSignal(false)
  const [notice, setNotice] = createSignal<string | undefined>()
  const [vErr, setVErr] = createSignal<string | undefined>()

  // Country-code picker (the final register step).
  const [picking, setPicking] = createSignal(false)
  const [cFilter, setCFilter] = createSignal("")
  const [cIndex, setCIndex] = createSignal(0)
  const filtered = createMemo(() => filterCountries(cFilter()))

  let inputRef: TextareaRenderable | undefined

  const fields = createMemo<AuthField[]>(() => {
    switch (mode()) {
      case "register":
        return REGISTER_FIELDS
      case "login":
        return LOGIN_FIELDS
      case "reset":
        return RESET_FIELDS
      default:
        return []
    }
  })

  const rerender = () => renderer.requestRender()
  function clearInput() {
    inputRef?.setText("")
    rerender()
  }

  function start(next: Mode) {
    setValues({})
    setFieldIndex(0)
    setForceLogin(false)
    setNotice(undefined)
    setVErr(undefined)
    setPicking(false)
    setCFilter("")
    setCIndex(0)
    auth.clearError()
    setMode(next)
    clearInput()
  }

  const prompt = createMemo(() => {
    switch (mode()) {
      case "landing":
        return "Type 'login', 'register', or 'reset', then Enter"
      case "otp":
        return "Enter the 6-digit code sent to your email"
      default:
        return fields()[fieldIndex()]?.label ?? ""
    }
  })

  async function doRegister(v: Record<string, string>) {
    const ok = await auth.register({
      username: v.username ?? "",
      email: v.email ?? "",
      password: v.password ?? "",
      phone: v.phone ?? "",
      country: v.country ?? "",
      country_code: v.country_code ?? "",
    })
    if (ok) {
      setOtpEmail(v.email ?? "")
      setNotice("Account created — enter the code we emailed you.")
      setPicking(false)
      setMode("otp")
      setFieldIndex(0)
      clearInput()
    } else {
      // validation/conflict error (e.g. email taken) → restart the register fields
      setPicking(false)
      setFieldIndex(0)
      rerender()
    }
  }

  async function onSubmit() {
    if (picking()) return // the picker handles its own keys
    const text = (inputRef?.plainText ?? "").trim()
    clearInput()
    const m = mode()

    if (m === "landing") {
      const c = text.toLowerCase()
      if (c === "register" || c === "r") start("register")
      else if (c === "login" || c === "l") start("login")
      else if (c === "reset" || c === "p") start("reset")
      return
    }

    if (m === "otp") {
      await auth.verifyOtp(otpEmail(), text)
      rerender()
      return
    }

    const fs = fields()
    const f = fs[fieldIndex()]
    if (!f) return

    // Validate before accepting (skip on login, where the backend is authoritative).
    if (m !== "login") {
      const vmsg = validateField(f.key, text)
      if (vmsg) {
        setVErr(vmsg)
        rerender()
        return
      }
    }
    setVErr(undefined)

    const cleaned = f.key === "phone" ? text.replace(/\D/g, "") : text
    const nextValues = { ...values(), [f.key]: cleaned }
    setValues(nextValues)

    // Reset: after the email field, request the code before collecting it.
    if (m === "reset" && fieldIndex() === 0) {
      await auth.requestPasswordReset(nextValues.email ?? "")
      setNotice("If that email is registered, a reset code has been sent.")
      setFieldIndex(1)
      rerender()
      return
    }

    if (fieldIndex() < fs.length - 1) {
      setFieldIndex(fieldIndex() + 1)
      rerender()
      return
    }

    // Last text field reached.
    if (m === "register") {
      // → country picker (it runs doRegister on select).
      setFieldIndex(fs.length)
      setCFilter("")
      setCIndex(0)
      setPicking(true)
      rerender()
      return
    }

    if (m === "login") {
      const res = await auth.login(nextValues.email ?? "", nextValues.password ?? "", forceLogin())
      if (res === "unverified") {
        setOtpEmail(nextValues.email ?? "")
        setNotice("Email not verified — we sent a fresh code. Enter it below.")
        setMode("otp")
        setFieldIndex(0)
        clearInput()
      } else if (res === "error") {
        if ((auth.error ?? "").includes("force_login")) setForceLogin(true)
        setFieldIndex(0)
        rerender()
      }
      return
    }

    if (m === "reset") {
      const ok = await auth.confirmPasswordReset(
        nextValues.code ?? "",
        nextValues.email ?? "",
        nextValues.new_password ?? "",
      )
      if (ok) {
        start("login")
        setNotice("Password reset — please log in with your new password.")
      } else {
        setFieldIndex(1)
        rerender()
      }
    }
  }

  // Country picker keys — gated on picking() so it never interferes with the textarea steps.
  // biome-ignore lint/suspicious/noExplicitAny: @opentui keyboard event is untyped (matches other modals)
  useKeyboard((e: any) => {
    if (!picking()) return
    if (e.name === "escape") {
      start("landing")
      return
    }
    if (e.name === "up") {
      e.preventDefault?.()
      setCIndex((i) => Math.max(0, i - 1))
      rerender()
      return
    }
    if (e.name === "down") {
      e.preventDefault?.()
      setCIndex((i) => Math.min(Math.max(0, filtered().length - 1), i + 1))
      rerender()
      return
    }
    if (e.name === "return" || e.name === "kpenter") {
      e.preventDefault?.()
      const c = filtered()[cIndex()]
      if (c) {
        const v = { ...values(), country: c.name, country_code: `+${c.dial}` }
        setValues(v)
        void doRegister(v)
      }
      return
    }
    if (e.name === "backspace") {
      setCFilter((s) => s.slice(0, -1))
      setCIndex(0)
      rerender()
      return
    }
    if (typeof e.sequence === "string" && e.sequence.length === 1 && !e.ctrl && !e.meta) {
      setCFilter((s) => s + e.sequence)
      setCIndex(0)
      rerender()
    }
  })

  const PWIN = 8
  const pickerWindow = createMemo(() => {
    const list = filtered()
    if (list.length <= PWIN) return { slice: list, offset: 0 }
    const off = Math.min(Math.max(0, cIndex() - Math.floor(PWIN / 2)), list.length - PWIN)
    return { slice: list.slice(off, off + PWIN), offset: off }
  })

  const currentHint = () => (mode() === "register" || mode() === "reset" ? fields()[fieldIndex()]?.hint : undefined)

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" paddingLeft={2} paddingRight={2}>
      <box flexShrink={0}>
        <Logo />
      </box>
      <box height={1} minHeight={0} />
      <text fg={theme.textMuted}>Sign in to Fincept to continue</text>

      <Show when={auth.status === "offline"}>
        <text fg={theme.accent}>● Offline — backend unavailable. Using cached session.</text>
      </Show>
      <Show when={notice()}>
        <text fg={theme.accent}>{notice()}</text>
      </Show>

      <box flexDirection="column" paddingTop={1} paddingBottom={1}>
        <For each={fields().slice(0, fieldIndex())}>
          {(f) => (
            <text fg={theme.textMuted}>
              {f.label}: <span style={{ fg: theme.text }}>{f.secret ? "••••••" : (values()[f.key] ?? "")}</span>
            </text>
          )}
        </For>
      </box>

      {/* Country-code picker — the final register step */}
      <Show when={picking()}>
        <text fg={theme.accent}>Select your country — type to filter · ↑/↓ · Enter</text>
        <box flexDirection="column" paddingTop={1} width="100%" maxWidth={60}>
          <For each={pickerWindow().slice}>
            {(c, i) => {
              const idx = () => pickerWindow().offset + i()
              const sel = () => idx() === cIndex()
              return (
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  backgroundColor={sel() ? theme.backgroundElement : undefined}
                >
                  <text fg={sel() ? theme.accent : theme.text}>{(sel() ? "› " : "  ") + c.name}</text>
                  <text fg={theme.textMuted}>+{c.dial}</text>
                </box>
              )
            }}
          </For>
          <Show when={filtered().length === 0}>
            <text fg={theme.textMuted}>No country matches "{cFilter()}".</text>
          </Show>
        </box>
        <box height={1} minHeight={0} />
        <text fg={theme.text}>
          filter: {cFilter()}
          <span style={{ fg: theme.accent }}>▏</span>
        </text>
      </Show>

      {/* Single-field text entry for every non-picker step */}
      <Show when={!picking()}>
        <text fg={theme.accent}>{prompt()}</text>
        <Show when={currentHint()}>
          <text fg={theme.textMuted}>{currentHint()}</text>
        </Show>
        <box width="100%" maxWidth={60} paddingTop={1}>
          <textarea
            width="100%"
            minHeight={1}
            maxHeight={1}
            focused={true}
            textColor={theme.text}
            focusedTextColor={theme.text}
            cursorColor={theme.text}
            keyBindings={fieldKeyBindings}
            onSubmit={() => {
              setTimeout(() => void onSubmit(), 0)
            }}
            ref={(r: TextareaRenderable) => {
              inputRef = r
            }}
          />
        </box>
      </Show>

      <Show when={vErr()}>
        <text fg="#ff5555">{vErr()}</text>
      </Show>
      <Show when={auth.error}>
        <text fg="#ff5555">{auth.error}</text>
      </Show>
      <Show when={forceLogin()}>
        <text fg={theme.accent}>Another session is active — re-enter to take over (force login).</text>
      </Show>

      <box height={1} minHeight={0} />
      <text fg={theme.textMuted}>
        <Switch>
          <Match when={picking()}>Type to filter · ↑/↓ select · Enter confirm · Esc cancel · Ctrl+Q quit</Match>
          <Match when={mode() === "landing"}>Ctrl+Q quit</Match>
          <Match when={true}>Enter submit · Ctrl+Q quit</Match>
        </Switch>
      </text>
    </box>
  )
}
