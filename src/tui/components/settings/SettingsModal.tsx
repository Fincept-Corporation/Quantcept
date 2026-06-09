import { loadConfig } from "@core/config/load"
import { setUserSettingPath } from "@core/config/persist"
import { useRenderer } from "@opentui/solid"
import { openBrowser } from "@shared/open-browser"
import type { AuthContext } from "@tui/context/auth"
import { useTheme } from "@tui/context/theme"
import { formatPlan } from "@tui/format/plan"
import {
  computeWindow,
  type FormSpec,
  ModalFormView,
  ModalList,
  nextIndex,
  useModalForm,
  useModalKeyboard,
  useNotice,
} from "@tui/ui/modal"
import { createMemo, createSignal, For, Show } from "solid-js"
import { commitField, configSections, cycleValue, type Field } from "./fields"

// Row model — everything in a section is one of these.
type EditRow = {
  kind: "string" | "secret" | "number" | "enum" | "bool"
  label: string
  value: () => string
  choices?: string[]
  hint?: string
  commit: (raw: string) => void | Promise<void>
}
type ActionRow = { kind: "action"; label: string; danger?: boolean; run: () => void | Promise<void> }
type InfoRow = { kind: "info"; label: string; value: string }
type Row = EditRow | ActionRow | InfoRow

type MenuItem = { key: string; label: string; group: string }
type MenuLine = { header: string } | { label: string; idx: number }

const ACCOUNT_SECTIONS: MenuItem[] = [
  { key: "profile", label: "Profile & key", group: "Account" },
  { key: "logout", label: "Log out", group: "Account" },
  { key: "security", label: "Security (MFA, password)", group: "Account" },
  { key: "notifications", label: "Notifications", group: "Account" },
  { key: "telegram", label: "Telegram", group: "Account" },
  { key: "usage", label: "Usage", group: "Account" },
  { key: "transactions", label: "Transactions", group: "Account" },
  { key: "logins", label: "Login history", group: "Account" },
  { key: "subscriptions", label: "Data subscriptions", group: "Account" },
  { key: "billing", label: "Billing & plan", group: "Billing" },
  { key: "plans", label: "Plans", group: "Billing" },
  { key: "credits", label: "Credit costs", group: "Billing" },
  { key: "payments", label: "Payment history", group: "Billing" },
  { key: "danger", label: "Danger zone", group: "Account" },
]

export function SettingsModal(props: { auth: AuthContext; onClose: () => void }) {
  const themeCtx = useTheme()
  const { theme } = themeCtx
  const renderer = useRenderer()
  const auth = props.auth

  // Self-heal: if the account hasn't loaded yet (e.g. startup validated while the API was
  // unreachable → "offline", with no auto-retry), re-fetch it now without disturbing the gate.
  if (!auth.account) void auth.reloadAccount()

  const [view, setView] = createSignal<"menu" | string>("menu")
  const [cursor, setCursor] = createSignal(0)
  const [bump, setBump] = createSignal(0) // force re-read of config-backed rows after a commit

  // async section rows (usage/transactions/logins/notifications/subscriptions)
  const [asyncRows, setAsyncRows] = createSignal<InfoRow[] | null>(null)
  const [loading, setLoading] = createSignal(false)

  const notice = useNotice()
  const form = useModalForm({ onError: notice.fail })
  const rerender = () => renderer.requestRender()
  // Thin aliases so the section builders (syncRows/loadAsync) stay unchanged.
  const flash = (m: string) => notice.flash(m)
  const fail = (e: unknown) => notice.fail(e)
  const startInput = (spec: FormSpec, prefill = "") => form.start(spec, prefill)

  const menu = createMemo<MenuItem[]>(() => [
    ...ACCOUNT_SECTIONS,
    { key: "appearance", label: "Appearance", group: "Settings" },
    { key: "permrules", label: "Permission rules", group: "Settings" },
    ...configSections().map((s) => ({ key: `cfg:${s.key}`, label: s.label, group: "Settings" })),
  ])

  // The menu renders as a FLAT, windowed list of single-line texts: group headers are their own
  // rows (not two texts crammed into one per-item column box, which rendered overlapping), and only
  // a window is shown so a long menu never overflows the dialog (which collided the bottom rows +
  // footer). `cursor` still indexes menu() items; each item line carries its index.
  const MENU_WINDOW = 16
  const menuLines = createMemo<MenuLine[]>(() => {
    const m = menu()
    const out: MenuLine[] = []
    m.forEach((item, i) => {
      if (i === 0 || m[i - 1]?.group !== item.group) out.push({ header: item.group.toUpperCase() })
      out.push({ label: item.label, idx: i })
    })
    return out
  })
  const windowedMenu = createMemo<MenuLine[]>(() => {
    const lines = menuLines()
    if (lines.length <= MENU_WINDOW) return lines
    const cur = lines.findIndex((l) => "label" in l && l.idx === cursor())
    const off = Math.min(Math.max(0, cur - Math.floor(MENU_WINDOW / 2)), lines.length - MENU_WINDOW)
    return lines.slice(off, off + MENU_WINDOW)
  })

  // Build the rows for the current non-async section.
  function syncRows(key: string): Row[] {
    bump() // dependency so a commit re-reads
    if (key === "appearance") {
      return [
        {
          kind: "enum",
          label: "Theme",
          choices: Object.keys(themeCtx.all()),
          value: () => themeCtx.selected,
          commit: (v) => {
            themeCtx.set(v)
            flash("Theme applied")
          },
        },
        {
          kind: "enum",
          label: "Mode",
          choices: ["dark", "light"],
          value: () => themeCtx.mode(),
          commit: (v) => {
            themeCtx.setMode(v === "light" ? "light" : "dark")
            flash("Mode applied")
          },
        },
      ]
    }
    if (key.startsWith("cfg:")) {
      const sec = configSections().find((s) => s.key === key.slice(4))
      return (sec?.fields ?? []).map((f: Field) => ({
        kind: f.kind,
        label: f.label,
        value: f.get,
        choices: f.choices,
        hint: f.hint,
        commit: async (raw: string) => {
          commitField(f, raw)
          setBump((n) => n + 1)
          flash("Saved · applies next session")
        },
      }))
    }
    if (key === "profile") {
      const a = auth.account
      const fincept = loadConfig().fincept
      const editProfile = (apiField: string) => async (raw: string) => {
        const r = await auth.accountApi.updateProfile({ [apiField]: raw })
        if (r) {
          await auth.reloadAccount()
          setBump((n) => n + 1)
          flash("Profile updated")
        }
      }
      return [
        { kind: "info", label: "Email", value: a?.email ?? fincept.email ?? "—" },
        { kind: "info", label: "Plan", value: formatPlan(a?.account_type) ?? "—" },
        { kind: "info", label: "Credits", value: a ? String(a.credit_balance) : "—" },
        {
          kind: "string",
          label: "Username",
          value: () => a?.username ?? fincept.username ?? "",
          commit: editProfile("username"),
        },
        { kind: "string", label: "Phone", value: () => a?.phone ?? "", commit: editProfile("phone") },
        { kind: "string", label: "Country", value: () => a?.country ?? "", commit: editProfile("country") },
        {
          kind: "string",
          label: "Country code",
          value: () => a?.country_code ?? "",
          commit: editProfile("country_code"),
        },
        {
          kind: "action",
          label: "Regenerate API key",
          run: async () => {
            await auth.regenerate()
            flash("API key regenerated")
          },
        },
      ]
    }
    if (key === "logout") {
      return [
        {
          kind: "action",
          label: "Confirm log out",
          danger: true,
          run: () => auth.logout().then(props.onClose),
        },
      ]
    }
    if (key === "security") {
      return [
        {
          kind: "action",
          label: "Change password",
          run: () =>
            startInput({
              title: "Change password",
              fields: [
                { label: "Current password", secret: true },
                { label: "New password", secret: true },
              ],
              onComplete: async ([oldP, newP]) => {
                const r = await auth.accountApi.changePassword(oldP ?? "", newP ?? "")
                if (r) flash("Password changed")
                else fail("Couldn't change password")
              },
            }),
        },
        {
          kind: "action",
          label: "Enable MFA (email code on login)",
          run: async () => {
            await auth.accountApi.mfaEnable()
            flash("MFA enabled")
          },
        },
        {
          kind: "action",
          label: "Disable MFA",
          run: () =>
            startInput({
              title: "Disable MFA",
              fields: [{ label: "Password", secret: true }],
              onComplete: async ([pw]) => {
                await auth.accountApi.mfaDisable(pw ?? "")
                flash("MFA disabled")
              },
            }),
        },
      ]
    }
    if (key === "telegram") {
      // status() is async, but action rows only fire in SYNC sections (async sections store
      // InfoRow[] and don't dispatch run()), so we keep this sync and surface status via flash.
      const showStatus = async () => {
        const r = await auth.telegram.status()
        const d = r.data
        flash(`Telegram: ${d.linked ? "linked" : "not linked"} · notifications ${d.notify_telegram ? "on" : "off"}`)
      }
      return [
        {
          kind: "action",
          label: "Link Telegram",
          run: async () => {
            const r = await auth.telegram.link()
            const link = r.data.deep_link
            void openBrowser(link)
            flash(`Opened Telegram — press START in the chat to finish linking. Link: ${link}`)
          },
        },
        { kind: "action", label: "Refresh status", run: showStatus },
        {
          kind: "action",
          label: "Unlink Telegram",
          danger: true,
          run: async () => {
            await auth.telegram.unlink()
            flash("Telegram unlinked")
          },
        },
      ]
    }
    if (key === "billing") {
      const a = auth.account
      return [
        { kind: "info", label: "Plan", value: formatPlan(a?.account_type) ?? "—" },
        { kind: "info", label: "Credits", value: a ? String(a.credit_balance) : "—" },
        { kind: "info", label: "Credits expire", value: a?.credits_expire_at ?? "never" },
        {
          kind: "action",
          label: "Buy credits / upgrade plan",
          run: () =>
            startInput({
              title: "Top up — enter a plan id (see the Plans section)",
              fields: [{ label: "Plan id (e.g. pro)" }],
              onComplete: async ([planId]) => {
                const r = await auth.billing.createOrder((planId ?? "").trim())
                flash(
                  `Order created (${r.data.environment}). Finish payment in your browser — session ${r.data.payment_session_id.slice(0, 12)}…`,
                )
              },
            }),
        },
        { kind: "action", label: "Refresh account", run: () => auth.reloadAccount().then(() => flash("Refreshed")) },
      ]
    }
    if (key === "permrules") {
      const rules = loadConfig().permissions.rules
      const persist = (next: typeof rules) => {
        setUserSettingPath("permissions.rules", next)
        setBump((n) => n + 1)
        flash("Saved · applies next session")
      }
      const out: Row[] = [
        {
          kind: "action",
          label: "＋ Add rule",
          run: () =>
            startInput({
              title: "Add permission rule",
              fields: [
                { label: "Permission (tool or category, e.g. shell)" },
                { label: "Pattern (glob, e.g. * or 'git *')" },
                { label: "Action (allow | ask | deny)" },
              ],
              onComplete: ([permission, pattern, action]) => {
                const a = action === "allow" || action === "deny" ? action : "ask"
                persist([
                  ...rules,
                  { permission: (permission ?? "").trim(), pattern: (pattern ?? "").trim() || "*", action: a },
                ])
              },
            }),
        },
      ]
      rules.forEach((r, i) => {
        out.push({
          kind: "action",
          label: `${r.permission} ${r.pattern} → ${r.action}`,
          run: () => {
            const order = ["allow", "ask", "deny"] as const
            const next = order[(order.indexOf(r.action) + 1) % order.length] ?? "ask"
            persist(rules.map((x, j) => (j === i ? { ...x, action: next } : x)))
          },
        })
      })
      if (rules.length) {
        out.push({
          kind: "action",
          label: "✕ Remove last rule",
          danger: true,
          run: () => persist(rules.slice(0, -1)),
        })
      }
      return out
    }
    if (key === "danger") {
      return [
        {
          kind: "action",
          label: "Delete account (permanent)",
          danger: true,
          run: () =>
            startInput({
              title: "Delete account — enter password to confirm",
              fields: [{ label: "Password", secret: true }],
              onComplete: async ([pw]) => {
                await auth.accountApi.deleteAccount(pw ?? "")
                await auth.logout()
                props.onClose()
              },
            }),
        },
      ]
    }
    return []
  }

  // Load an async account view into asyncRows.
  async function loadAsync(key: string) {
    setLoading(true)
    setAsyncRows(null)
    notice.clear()
    try {
      if (key === "usage") {
        const r = await auth.accountApi.usage()
        setAsyncRows(
          (r.data ?? []).map((u) => ({
            kind: "info",
            label: `${u.method} ${u.endpoint}`,
            value: `${u.credits_used}cr · ${u.status_code}`,
          })),
        )
      } else if (key === "transactions") {
        const r = await auth.accountApi.transactions()
        setAsyncRows(
          (r.data ?? []).map((t) => ({
            kind: "info",
            label: `${t.created_at?.slice(0, 10)} ${t.payment_gateway}`,
            value: `${t.credits}cr · ${t.status}`,
          })),
        )
      } else if (key === "logins") {
        const r = await auth.accountApi.loginHistory()
        setAsyncRows(
          (r.data ?? []).map((l) => ({
            kind: "info",
            label: `${l.created_at?.slice(0, 16)} ${l.ip_address}`,
            value: l.login_successful ? "ok" : l.failure_reason || "failed",
          })),
        )
      } else if (key === "subscriptions") {
        const r = await auth.accountApi.subscriptions()
        const rows: InfoRow[] = (r.data ?? []).map((s) => ({
          kind: "info",
          label: s.display_name,
          value: s.is_active ? "active" : "inactive",
        }))
        setAsyncRows(rows)
      } else if (key === "notifications") {
        const r = await auth.accountApi.notifications()
        setAsyncRows(
          (r.data ?? []).map((n) => ({
            kind: "info",
            label: (n.is_read ? "  " : "● ") + n.title,
            value: n.created_at?.slice(0, 10) ?? "",
          })),
        )
      } else if (key === "credits") {
        const r = await auth.billing.creditsMap()
        const rows: InfoRow[] = []
        for (const m of r.data?.modules ?? []) {
          for (const ep of m.endpoints) {
            rows.push({
              kind: "info",
              label: `${ep.method} ${m.prefix}${ep.path}`,
              value: ep.cost === 0 ? "free" : `${ep.cost}cr`,
            })
          }
        }
        setAsyncRows(rows)
      } else if (key === "plans") {
        const r = await auth.billing.plans()
        setAsyncRows(
          (r.data ?? []).map((p) => ({
            kind: "info",
            label: `${p.plan_id} — ${p.name}`,
            value: p.is_free ? "free" : `$${p.price_usd} · ${p.credits}cr`,
          })),
        )
      } else if (key === "payments") {
        const r = await auth.billing.payments()
        setAsyncRows(
          (r.data?.payments ?? []).map((p) => ({
            kind: "info",
            label: `${p.created_at?.slice(0, 10)} ${p.plan_name ?? p.payment_gateway}`,
            value: `$${p.amount_usd} · ${p.status}`,
          })),
        )
      }
    } catch (e) {
      fail((e as Error).message)
    } finally {
      setLoading(false)
      rerender()
    }
  }

  const ASYNC = new Set([
    "usage",
    "transactions",
    "logins",
    "subscriptions",
    "notifications",
    "credits",
    "plans",
    "payments",
  ])

  function enterSection(key: string) {
    setView(key)
    setCursor(0)
    notice.clear()
    if (ASYNC.has(key)) void loadAsync(key)
  }

  function rowsForView(): Row[] {
    const v = view()
    if (v === "menu") return []
    if (ASYNC.has(v)) return asyncRows() ?? []
    return syncRows(v)
  }

  // ── keyboard ────────────────────────────────────────────────────────────
  // One router: the form (when open) owns keys + paste; otherwise this onKey runs
  // the menu/section navigation. Settings keeps its own windowing + typed rows.
  useModalKeyboard({
    form,
    onKey: (e) => {
      e.preventDefault?.()
      const list = view() === "menu" ? menu() : rowsForView()
      if (e.name === "escape" || (e.name === "left" && view() !== "menu")) {
        if (view() === "menu") props.onClose()
        else {
          setView("menu")
          setCursor(0)
          setAsyncRows(null)
        }
        rerender()
        return true
      }
      if (e.name === "up") {
        setCursor((c) => nextIndex(list.length, c, -1))
        rerender()
        return true
      }
      if (e.name === "down") {
        setCursor((c) => nextIndex(list.length, c, 1))
        rerender()
        return true
      }

      if (view() === "menu") {
        if (e.name === "return" || e.name === "kpenter") {
          const item = menu()[cursor()]
          if (item) enterSection(item.key)
          rerender()
        }
        return true
      }

      // inside a section
      const row = rowsForView()[cursor()]
      if (!row || row.kind === "info") return true
      if (row.kind === "action") {
        if (e.name === "return" || e.name === "kpenter") {
          void Promise.resolve(row.run()).catch((x) => fail(x))
        }
        return true
      }
      // EditRow
      if (row.kind === "enum" || row.kind === "bool") {
        if (e.name === "left" || e.name === "right") {
          const f: Field = { label: row.label, kind: row.kind, path: "", get: row.value, choices: row.choices }
          const next = cycleValue(f, row.value(), e.name === "right" ? 1 : -1)
          void Promise.resolve(row.commit(next)).catch((x) => fail(x))
        }
        if (e.name === "return" || e.name === "kpenter") {
          const f: Field = { label: row.label, kind: row.kind, path: "", get: row.value, choices: row.choices }
          void Promise.resolve(row.commit(cycleValue(f, row.value(), 1))).catch((x) => fail(x))
        }
        return true
      }
      // string | secret | number → open inline editor
      if (e.name === "return" || e.name === "kpenter") {
        const r = row
        startInput(
          {
            title: r.label,
            fields: [{ label: r.label, secret: r.kind === "secret" }],
            onComplete: ([v]) => r.commit(v ?? ""),
          },
          r.value(),
        )
      }
      return true
    },
  })

  // ── render ────────────────────────────────────────────────────────────────
  const WINDOW = 14
  const sectionWindow = createMemo(() => {
    const rows = rowsForView()
    const w = computeWindow(rows.length, cursor(), WINDOW)
    return { slice: rows.slice(w.offset, w.end), offset: w.offset, selected: w.selected }
  })

  function rowText(row: Row): string {
    if (row.kind === "info") return row.value
    if (row.kind === "action") return ""
    if (row.kind === "secret") {
      const v = row.value()
      return v ? "••••••" : "(unset)"
    }
    return row.value() || "(default)"
  }

  return (
    <box flexDirection="column" minWidth={62} gap={0}>
      <text fg={theme.accent} attributes={undefined}>
        {view() === "menu" ? "⚙  Settings & Account" : `⚙  ${menu().find((m) => m.key === view())?.label ?? view()}`}
      </text>
      <box height={1} minHeight={0} />

      <Show when={form.active()}>
        <ModalFormView form={form} fields={form.spec()?.fields ?? []} title={form.spec()?.title} />
      </Show>

      <Show when={!form.active() && view() === "menu"}>
        <box flexDirection="column">
          <For each={windowedMenu()}>
            {(line) =>
              "header" in line ? (
                <text fg={theme.textMuted}>{line.header}</text>
              ) : (
                <text
                  fg={line.idx === cursor() ? theme.accent : theme.text}
                  bg={line.idx === cursor() ? theme.backgroundElement : undefined}
                >
                  {(line.idx === cursor() ? "› " : "  ") + line.label}
                </text>
              )
            }
          </For>
        </box>
      </Show>

      <Show when={!form.active() && view() !== "menu"}>
        <Show when={!loading()} fallback={<text fg={theme.textMuted}>Loading…</text>}>
          <box flexDirection="column">
            <Show when={rowsForView().length > 0} fallback={<text fg={theme.textMuted}>Nothing here.</text>}>
              <ModalList
                window={sectionWindow()}
                label={(row) => row.label}
                right={(row) => rowText(row)}
                marker={(row, sel) => (row.kind === "action" ? (row.danger ? "⚠ " : "› ") : sel ? "› " : "  ")}
                fg={(row, sel) => (row.kind === "action" && row.danger ? "#ff5555" : sel ? theme.accent : theme.text)}
              />
            </Show>
          </box>
        </Show>
      </Show>

      <box height={1} minHeight={0} />
      <text fg={notice.err() ? "#ff5555" : theme.accent}>{notice.err() ?? notice.notice() ?? ""}</text>
      <text fg={theme.textMuted}>↑/↓ move · Enter edit/act · ‹ ›/Enter cycle · Esc back</text>
    </box>
  )
}
