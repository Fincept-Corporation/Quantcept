import { describe, expect, test } from "bun:test"
import { FinceptChat } from "@core/fincept/chat"
import type { FinceptClient, FinceptRequest } from "@core/fincept/client"

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
})
