import { describe, expect, test } from "bun:test"
import { type CloudMessage, FinceptChat, partitionResumeMessages } from "@core/fincept/chat"
import type { FinceptClient, FinceptRequest } from "@core/fincept/client"

function msg(role: "user" | "assistant", status: string, text: string, id = `${role}-${text}`): CloudMessage {
  return { id, role, status, parts: [{ idx: 0, type: "text", text }], created_at: "2026-06-05T00:00:00Z" }
}

function stub() {
  const calls: FinceptRequest[] = []
  const client = {
    request: async (r: FinceptRequest) => {
      calls.push(r)
      return { data: {} }
    },
  } as unknown as FinceptClient
  return { client, calls }
}

describe("FinceptChat request shaping", () => {
  test("createConversation POSTs /v1/chat/conversations with token", async () => {
    const { client, calls } = stub()
    await new FinceptChat(client, "fk_user_x", "http://h").createConversation({ title: "T", mode: "deep" })
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/conversations",
      body: { title: "T", mode: "deep" },
      token: "fk_user_x",
    })
  })

  test("send POSTs to the conversation messages path", async () => {
    const { client, calls } = stub()
    await new FinceptChat(client, "fk_user_x", "http://h").send("cnv_1", { content: "hi", client_message_id: "c1" })
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/conversations/cnv_1/messages",
      body: { content: "hi", client_message_id: "c1" },
    })
  })

  test("listConversations encodes pagination", async () => {
    const { client, calls } = stub()
    await new FinceptChat(client, "t", "http://h").listConversations(2, 25)
    expect(calls[0]!.path).toBe("/v1/chat/conversations?page=2&page_size=25")
  })

  test("cancelGeneration hits the cancel path", async () => {
    const { client, calls } = stub()
    await new FinceptChat(client, "t", "http://h").cancelGeneration("gen_9")
    expect(calls[0]).toMatchObject({ method: "POST", path: "/v1/chat/generations/gen_9/cancel" })
  })

  test("importMessages POSTs the turn batch to /import", async () => {
    const { client, calls } = stub()
    await new FinceptChat(client, "t", "http://h").importMessages("cnv_1", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
    ])
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/v1/chat/conversations/cnv_1/import",
      body: { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }] },
    })
  })
})

describe("partitionResumeMessages (resume failed-turn handling)", () => {
  test("drops an unanswered (failed-reply) turn and reloads it as the retry question", () => {
    const { rendered, lastFailedQuestion } = partitionResumeMessages([
      msg("user", "complete", "first ok"),
      msg("assistant", "complete", "answer 1"),
      msg("user", "complete", "rites price?"),
      msg("assistant", "failed", ""), // generation failed
    ])
    expect(rendered.map((m) => m.role)).toEqual(["user", "assistant"]) // only the answered turn
    expect(rendered[0]!.parts[0]!.text).toBe("first ok")
    expect(lastFailedQuestion).toBe("rites price?")
  })

  test("drops a trailing user message with NO assistant reply", () => {
    const { rendered, lastFailedQuestion } = partitionResumeMessages([
      msg("user", "complete", "dangling question"),
    ])
    expect(rendered).toHaveLength(0)
    expect(lastFailedQuestion).toBe("dangling question")
  })

  test("keeps only the LAST failed question when several pile up", () => {
    const { rendered, lastFailedQuestion } = partitionResumeMessages([
      msg("user", "complete", "q1"),
      msg("assistant", "failed", ""),
      msg("user", "complete", "q2"),
      msg("assistant", "failed", ""),
      msg("user", "complete", "q3"),
      msg("assistant", "failed", ""),
    ])
    expect(rendered).toHaveLength(0) // no dead "You" bubbles
    expect(lastFailedQuestion).toBe("q3")
  })

  test("a fully-answered conversation is untouched", () => {
    const input = [
      msg("user", "complete", "hello"),
      msg("assistant", "complete", "hi"),
    ]
    const { rendered, lastFailedQuestion } = partitionResumeMessages(input)
    expect(rendered).toHaveLength(2)
    expect(lastFailedQuestion).toBe("")
  })
})
