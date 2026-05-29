import { BuddySprite } from "@tui/buddy/BuddySprite"
import { useTheme } from "@tui/context/theme"

interface SidebarProps {
  sessionID: string
  overlay?: boolean
  messages?: { role: string; content: string }[]
}

export function Sidebar(props: SidebarProps) {
  const { theme } = useTheme()

  const sessionTitle = () => {
    const id = props.sessionID
    return id.startsWith("session-") ? "New Session" : id
  }

  const messageCount = () => props.messages?.length ?? 0
  const userMsgCount = () => props.messages?.filter((m) => m.role === "user").length ?? 0
  const assistantMsgCount = () => props.messages?.filter((m) => m.role === "assistant").length ?? 0

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={42}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      position={props.overlay ? "absolute" : "relative"}
    >
      <scrollbox flexGrow={1}>
        <box flexShrink={0} gap={1} paddingRight={1}>
          {/* Mascot at top */}
          <box alignItems="center" flexShrink={0}>
            <BuddySprite compact />
          </box>

          {/* Divider */}
          <box height={1}>
            <text fg={theme.border}>{"─".repeat(36)}</text>
          </box>

          {/* Session Title */}
          <box>
            <text fg={theme.text}>
              <b>{sessionTitle()}</b>
            </text>
            <text fg={theme.textMuted}>{props.sessionID.slice(0, 16)}</text>
          </box>

          {/* Session Stats */}
          <box>
            <text fg={theme.textMuted}>
              <b>Messages</b>
            </text>
            <box paddingLeft={1} gap={0}>
              <text fg={theme.textMuted}>
                Total: <span style={{ fg: theme.text }}>{messageCount()}</span>
              </text>
              <text fg={theme.textMuted}>
                User: <span style={{ fg: theme.text }}>{userMsgCount()}</span>
              </text>
              <text fg={theme.textMuted}>
                Assistant: <span style={{ fg: theme.text }}>{assistantMsgCount()}</span>
              </text>
            </box>
          </box>

          {/* Tools Section */}
          <box>
            <text fg={theme.textMuted}>
              <b>Tools</b>
            </text>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>No tools connected</text>
            </box>
          </box>

          {/* Files Section */}
          <box>
            <text fg={theme.textMuted}>
              <b>Files</b>
            </text>
            <box paddingLeft={1}>
              <text fg={theme.textMuted}>No files modified</text>
            </box>
          </box>
        </box>
      </scrollbox>

      {/* Footer */}
      <box flexShrink={0} gap={1} paddingTop={1}>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.success }}>•</span> <b>Quant</b>
          <span style={{ fg: theme.text }}>
            <b>cept</b>
          </span>{" "}
          <span>v0.1.0</span>
        </text>
      </box>
    </box>
  )
}
