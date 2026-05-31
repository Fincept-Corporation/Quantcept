import { FinceptAuthError } from "@shared/errors"
import type { FinceptClient } from "./client"
import type {
  Account,
  LoginEntry,
  Notification,
  NotificationPrefs,
  NotificationPrefsPatch,
  ProfilePatch,
  Subscription,
  TransactionEntry,
  UsageEntry,
} from "./types"

/**
 * Account/profile operations over the Fincept backend (/v1/users/me/* + sessions).
 * Bound to a live token getter (the AuthProvider supplies the current key) so the
 * UI calls methods without threading the token. Thin — HTTP/errors live in FinceptClient.
 */
export class FinceptAccount {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {}

  private t(): string {
    const tok = this.token()
    if (!tok) throw new FinceptAuthError("Not signed in")
    return tok
  }

  me() {
    return this.client.request<Account>({ method: "GET", path: "/v1/users/me", token: this.t() })
  }
  updateProfile(patch: ProfilePatch) {
    return this.client.request<null>({ method: "PUT", path: "/v1/users/me", token: this.t(), body: patch })
  }
  changePassword(oldPassword: string, newPassword: string) {
    return this.client.request<null>({
      method: "POST",
      path: "/v1/users/me/change-password",
      token: this.t(),
      body: { old_password: oldPassword, new_password: newPassword },
    })
  }
  deleteAccount(password: string) {
    return this.client.request<null>({ method: "DELETE", path: "/v1/users/me", token: this.t(), body: { password } })
  }

  usage() {
    return this.client.request<UsageEntry[]>({ method: "GET", path: "/v1/users/me/usage", token: this.t() })
  }
  transactions() {
    return this.client.request<TransactionEntry[]>({
      method: "GET",
      path: "/v1/users/me/transactions",
      token: this.t(),
    })
  }
  loginHistory() {
    return this.client.request<LoginEntry[]>({ method: "GET", path: "/v1/users/me/login-history", token: this.t() })
  }

  notifications() {
    return this.client.request<Notification[]>({ method: "GET", path: "/v1/users/me/notifications", token: this.t() })
  }
  markNotificationRead(id: number) {
    return this.client.request<null>({ method: "PUT", path: `/v1/users/me/notifications/${id}/read`, token: this.t() })
  }
  markAllNotificationsRead() {
    return this.client.request<null>({ method: "PUT", path: "/v1/users/me/notifications/read-all", token: this.t() })
  }
  deleteNotification(id: number) {
    return this.client.request<null>({ method: "DELETE", path: `/v1/users/me/notifications/${id}`, token: this.t() })
  }
  notificationPrefs() {
    return this.client.request<NotificationPrefs>({
      method: "GET",
      path: "/v1/users/me/notification-preferences",
      token: this.t(),
    })
  }
  updateNotificationPrefs(patch: NotificationPrefsPatch) {
    return this.client.request<null>({
      method: "PUT",
      path: "/v1/users/me/notification-preferences",
      token: this.t(),
      body: patch,
    })
  }

  mfaEnable() {
    return this.client.request<null>({ method: "POST", path: "/v1/users/me/mfa", token: this.t() })
  }
  mfaDisable(password: string) {
    return this.client.request<null>({
      method: "DELETE",
      path: "/v1/users/me/mfa",
      token: this.t(),
      body: { password },
    })
  }

  subscriptions() {
    return this.client.request<Subscription[]>({
      method: "GET",
      path: "/v1/users/me/database-subscriptions",
      token: this.t(),
    })
  }
  subscribeDatabase(databaseName: string) {
    return this.client.request<null>({
      method: "POST",
      path: "/v1/users/me/database-subscriptions",
      token: this.t(),
      body: { database_name: databaseName },
    })
  }
}
