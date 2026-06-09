import type { ActionCommand } from "../types"

const KICKOFF = [
  "I want to create a new custom agent. Interview me step by step — one question at a time —",
  "about its purpose, the expertise it should have, its focus areas, its tone, and when I'd use it.",
  "Also ask whether I want a specific model (optional), and whether the agent should INHERIT the base",
  "assistant's abilities and instructions (the default — pass mode: append) or fully REPLACE the system",
  "prompt with only its own persona (pass mode: replace).",
  "Then draft the agent: a short name, a one-line description, and a detailed system prompt that defines",
  "its behavior. Show me the draft and iterate on my feedback.",
  "When I approve, save it with the create_agent tool (default scope: user). To edit an existing agent,",
  "save over it with the same name and overwrite: true.",
].join(" ")

export function createAgentCommand(): ActionCommand {
  return {
    kind: "action",
    id: "agent.create",
    name: "create-agent",
    description: "Build a new custom agent step by step with AI assistance",
    category: "Agents",
    source: "builtin",
    run(_args, ctx) {
      // In a live session, build in place; otherwise open a fresh builder session.
      if (ctx.inSession()) {
        ctx.submitPrompt(KICKOFF)
      } else {
        ctx.navigate({
          type: "session",
          sessionID: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          initialMessage: KICKOFF,
        })
      }
    },
  }
}
