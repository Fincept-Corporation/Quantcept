import { useTheme } from "@tui/context/theme"
import { createContext, createSignal, onCleanup, type ParentProps, Show, useContext } from "solid-js"

interface Toast {
  message: string
  variant: "info" | "error" | "warning" | "success"
  title?: string
  duration?: number
}

interface ToastContext {
  show(toast: Toast): void
  error(error: unknown): void
}

const ToastCtx = createContext<ToastContext>()

export function useToast() {
  const value = useContext(ToastCtx)
  if (!value) throw new Error("ToastProvider required")
  return value
}

export function ToastProvider(props: ParentProps) {
  const { theme } = useTheme()
  const [current, setCurrent] = createSignal<Toast | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  const ctx: ToastContext = {
    show(toast) {
      clearTimeout(timer)
      setCurrent(toast)
      timer = setTimeout(() => setCurrent(null), toast.duration ?? 3000)
    },
    error(error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.show({ message, variant: "error", duration: 5000 })
    },
  }

  onCleanup(() => clearTimeout(timer))

  return (
    <ToastCtx.Provider value={ctx}>
      {props.children}
      <Show when={current()}>
        {(toast) => (
          <box
            position="absolute"
            top={0}
            left={0}
            right={0}
            height={3}
            backgroundColor={
              toast().variant === "error"
                ? theme.error
                : toast().variant === "warning"
                  ? theme.warning
                  : toast().variant === "success"
                    ? theme.success
                    : theme.info
            }
            justifyContent="center"
            alignItems="center"
            zIndex={1000}
          >
            <text fg={theme.background}>
              {toast().title ? `${toast().title}: ` : ""}
              {toast().message}
            </text>
          </box>
        )}
      </Show>
    </ToastCtx.Provider>
  )
}
