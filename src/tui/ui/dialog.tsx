import { useTheme } from "@tui/context/theme"
import { createContext, createSignal, type JSX, type ParentProps, Show, useContext } from "solid-js"

interface DialogContext {
  replace(render: () => JSX.Element): void
  clear(): void
  active(): boolean
}

const DialogCtx = createContext<DialogContext>()

export function useDialog() {
  const value = useContext(DialogCtx)
  if (!value) throw new Error("DialogProvider required")
  return value
}

export function DialogProvider(props: ParentProps) {
  const { theme } = useTheme()
  const [content, setContent] = createSignal<(() => JSX.Element) | null>(null)

  const ctx: DialogContext = {
    replace(render) {
      setContent(() => render)
    },
    clear() {
      setContent(null)
    },
    active() {
      return content() !== null
    },
  }

  return (
    <DialogCtx.Provider value={ctx}>
      {props.children}
      <Show when={content()}>
        {(render) => (
          <box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            justifyContent="center"
            alignItems="center"
            backgroundColor={theme.background + "cc"}
            zIndex={900}
          >
            <box
              backgroundColor={theme.backgroundPanel}
              borderColor={theme.borderActive}
              border={true}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              minWidth={40}
              maxWidth="80%"
              maxHeight="80%"
            >
              {render()()}
            </box>
          </box>
        )}
      </Show>
    </DialogCtx.Provider>
  )
}
