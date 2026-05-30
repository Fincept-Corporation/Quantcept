import type { SyntaxStyle } from "@opentui/core"
import { createMemo } from "solid-js"
import { healStreamingMarkdown } from "./heal"

/**
 * One render path for assistant markdown, live and final.
 *
 * While `streaming`, the content is run through {@link healStreamingMarkdown} so
 * an unterminated span (e.g. `**bol`) is completed before it reaches the parser
 * and never shows a raw marker. Because well-formed markdown heals to itself, the
 * moment the turn finishes the healed output already equals the final output —
 * there is no second formatting pass and no visible swap. OpenTUI's own streaming
 * mode (`streaming` + `internalBlockMode="top-level"`) freezes completed blocks
 * and only re-parses the trailing one.
 */
export function StreamingMarkdown(props: {
  content: string
  streaming: boolean
  syntaxStyle: SyntaxStyle
  fg?: string
  bg?: string
}) {
  const content = createMemo(() => (props.streaming ? healStreamingMarkdown(props.content) : props.content))
  return (
    <markdown
      content={content()}
      streaming={props.streaming}
      internalBlockMode="top-level"
      tableOptions={{ style: "grid" }}
      syntaxStyle={props.syntaxStyle}
      fg={props.fg}
      bg={props.bg}
    />
  )
}
