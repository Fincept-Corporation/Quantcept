import { FinceptResource } from "./resource"
import type { TelegramLink, TelegramStatus } from "./types"

/**
 * Telegram OTP delivery — a logged-in add-on that lets the user also receive one-time codes on
 * Telegram. Distinct linking lifecycle, so it lives apart from FinceptAccount. Token-bound like
 * the other resources; HTTP/errors live in FinceptClient.
 */
export class FinceptTelegram extends FinceptResource {
  /** Mint a deep link; the user opens it and presses START to link their chat. */
  link() {
    return this.client.request<TelegramLink>({ method: "POST", path: "/v1/telegram/link", token: this.requireToken() })
  }
  status() {
    return this.client.request<TelegramStatus>({ method: "GET", path: "/v1/telegram/link", token: this.requireToken() })
  }
  unlink() {
    return this.client.request<null>({ method: "DELETE", path: "/v1/telegram/link", token: this.requireToken() })
  }
}
