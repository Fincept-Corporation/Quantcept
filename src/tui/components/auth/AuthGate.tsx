import { defaultTextareaKeyBindings, type TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { Logo } from "@tui/components/logo"
import { useAuth } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"

type Mode = "landing" | "register" | "otp" | "login"

interface AuthField {
  key: string
  label: string
}

const REGISTER_FIELDS: AuthField[] = [
  { key: "username", label: "Username (3–50 chars)" },
  { key: "email", label: "Email" },
  { key: "password", label: "Password" },
  { key: "phone", label: "Phone (7–15 digits)" },
  { key: "country_code", label: "Country code (e.g. +91)" },
  { key: "country", label: "Country" },
]

const LOGIN_FIELDS: AuthField[] = [
  { key: "email", label: "Email" },
  { key: "password", label: "Password" },
]

// Enter submits the current field; never inserts a newline (single-line entry).
const fieldKeyBindings = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  ...defaultTextareaKeyBindings.filter((b) => b.name !== "return" && b.name !== "kpenter" && b.name !== "linefeed"),
]

/**
 * The mandatory auth gate. A single focused input walks one field at a time
 * (landing → register/login fields → submit; register → otp). Backend errors
 * surface inline from auth.error. Rendered by App() whenever status is "unauthed".
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
  let inputRef: TextareaRenderable | undefined

  const fields = createMemo<AuthField[]>(() =>
    mode() === "register" ? REGISTER_FIELDS : mode() === "login" ? LOGIN_FIELDS : [],
  )

  function clearInput() {
    inputRef?.setText("")
    renderer.requestRender()
  }

  function start(next: Mode) {
    setValues({})
    setFieldIndex(0)
    setForceLogin(false)
    auth.clearError()
    setMode(next)
    clearInput()
  }

  const prompt = createMemo(() => {
    const m = mode()
    if (m === "landing") return "Type 'login' or 'register', then Enter"
    if (m === "otp") return "Enter the 6-digit code sent to your email"
    return fields()[fieldIndex()]?.label ?? ""
  })

  async function onSubmit() {
    const text = (inputRef?.plainText ?? "").trim()
    clearInput()
    const m = mode()

    if (m === "landing") {
      const c = text.toLowerCase()
      if (c === "register" || c === "r") start("register")
      else if (c === "login" || c === "l") start("login")
      return
    }

    if (m === "otp") {
      await auth.verifyOtp(otpEmail(), text)
      renderer.requestRender()
      return
    }

    const fs = fields()
    const f = fs[fieldIndex()]
    if (!f) return
    const nextValues = { ...values(), [f.key]: text }
    setValues(nextValues)

    if (fieldIndex() < fs.length - 1) {
      setFieldIndex(fieldIndex() + 1)
      renderer.requestRender()
      return
    }

    if (m === "register") {
      const ok = await auth.register({
        username: nextValues.username ?? "",
        email: nextValues.email ?? "",
        password: nextValues.password ?? "",
        phone: nextValues.phone ?? "",
        country: nextValues.country ?? "",
        country_code: nextValues.country_code ?? "",
      })
      if (ok) {
        setOtpEmail(nextValues.email ?? "")
        setMode("otp")
        setFieldIndex(0)
        clearInput()
      } else {
        setFieldIndex(0) // let the user re-enter after a validation/conflict error
        renderer.requestRender()
      }
      return
    }

    // login
    const ok = await auth.login(nextValues.email ?? "", nextValues.password ?? "", forceLogin())
    if (!ok) {
      if ((auth.error ?? "").includes("force_login")) setForceLogin(true)
      setFieldIndex(0)
      renderer.requestRender()
    }
  }

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

      <box flexDirection="column" paddingTop={1} paddingBottom={1}>
        <For each={fields().slice(0, fieldIndex())}>
          {(f) => (
            <text fg={theme.textMuted}>
              {f.label}:{" "}
              <span style={{ fg: theme.text }}>{f.key === "password" ? "••••••" : (values()[f.key] ?? "")}</span>
            </text>
          )}
        </For>
      </box>

      <text fg={theme.accent}>{prompt()}</text>
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

      <Show when={auth.error}>
        <text fg="#ff5555">{auth.error}</text>
      </Show>
      <Show when={forceLogin()}>
        <text fg={theme.accent}>Another session is active — re-enter to take over (force login).</text>
      </Show>

      <box height={1} minHeight={0} />
      <text fg={theme.textMuted}>
        <Switch>
          <Match when={mode() === "landing"}>Ctrl+Q quit</Match>
          <Match when={true}>Enter submit · Ctrl+Q quit</Match>
        </Switch>
      </text>
    </box>
  )
}
