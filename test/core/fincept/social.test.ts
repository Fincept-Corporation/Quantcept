import { expect, test } from "bun:test"
import { startSocialLogin } from "@core/fincept/social"
import { FinceptError } from "@shared/errors"

/** Pull the loopback redirect target out of the provider-start URL the opener received. */
function redirectFrom(startUrl: string): string {
  return new URL(startUrl).searchParams.get("redirect")!
}

test("resolves api_key + session_token from the loopback callback", async () => {
  const open = async (url: string) => {
    const redirect = redirectFrom(url)
    await fetch(`${redirect}?api_key=fk_user_1&session_token=sess_1`)
  }
  const r = await startSocialLogin("google", { baseUrl: "https://api.test", open })
  expect(r).toEqual({ apiKey: "fk_user_1", sessionToken: "sess_1" })
})

test("rejects with the provider error code on ?error=", async () => {
  const open = async (url: string) => {
    const redirect = redirectFrom(url)
    await fetch(`${redirect}?error=oauth_failed`)
  }
  const p = startSocialLogin("github", { baseUrl: "https://api.test", open })
  await expect(p).rejects.toMatchObject({ code: "oauth_failed" })
  await expect(p).rejects.toBeInstanceOf(FinceptError)
})

test("opens the correct provider-start URL", async () => {
  let opened = ""
  const open = async (url: string) => {
    opened = url
    await fetch(`${redirectFrom(url)}?api_key=k&session_token=s`)
  }
  await startSocialLogin("apple", { baseUrl: "https://api.test", open })
  expect(opened.startsWith("https://api.test/v1/auth/apple/start?redirect=")).toBe(true)
})
