import { FinceptResource } from "./resource"
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
export class FinceptAccount extends FinceptResource {
  me() {
    return this.client.request<Account>({ method: "GET", path: "/v1/users/me", token: this.requireToken() })
  }
  updateProfile(patch: ProfilePatch) {
    return this.client.request<null>({ method: "PUT", path: "/v1/users/me", token: this.requireToken(), body: patch })
  }
  changePassword(oldPassword: string, newPassword: string) {
    return this.client.request<null>({
      method: "POST",
      path: "/v1/users/me/change-password",
      token: this.requireToken(),
      body: { old_password: oldPassword, new_password: newPassword },
    })
  }
  deleteAccount(password: string) {
    return this.client.request<null>({
      method: "DELETE",
      path: "/v1/users/me",
      token: this.requireToken(),
      body: { password },
    })
  }

  usage() {
    return this.client.request<UsageEntry[]>({ method: "GET", path: "/v1/users/me/usage", token: this.requireToken() })
  }
  transactions() {
    return this.client.request<TransactionEntry[]>({
      method: "GET",
      path: "/v1/users/me/transactions",
      token: this.requireToken(),
    })
  }
  loginHistory() {
    return this.client.request<LoginEntry[]>({
      method: "GET",
      path: "/v1/users/me/login-history",
      token: this.requireToken(),
    })
  }

  notifications() {
    return this.client.request<Notification[]>({
      method: "GET",
      path: "/v1/users/me/notifications",
      token: this.requireToken(),
    })
  }
  markNotificationRead(id: number) {
    return this.client.request<null>({
      method: "PUT",
      path: `/v1/users/me/notifications/${id}/read`,
      token: this.requireToken(),
    })
  }
  markAllNotificationsRead() {
    return this.client.request<null>({
      method: "PUT",
      path: "/v1/users/me/notifications/read-all",
      token: this.requireToken(),
    })
  }
  deleteNotification(id: number) {
    return this.client.request<null>({
      method: "DELETE",
      path: `/v1/users/me/notifications/${id}`,
      token: this.requireToken(),
    })
  }
  notificationPrefs() {
    return this.client.request<NotificationPrefs>({
      method: "GET",
      path: "/v1/users/me/notification-preferences",
      token: this.requireToken(),
    })
  }
  updateNotificationPrefs(patch: NotificationPrefsPatch) {
    return this.client.request<null>({
      method: "PUT",
      path: "/v1/users/me/notification-preferences",
      token: this.requireToken(),
      body: patch,
    })
  }

  mfaEnable() {
    return this.client.request<null>({ method: "POST", path: "/v1/users/me/mfa", token: this.requireToken() })
  }
  mfaDisable(password: string) {
    return this.client.request<null>({
      method: "DELETE",
      path: "/v1/users/me/mfa",
      token: this.requireToken(),
      body: { password },
    })
  }

  subscriptions() {
    return this.client.request<Subscription[]>({
      method: "GET",
      path: "/v1/users/me/database-subscriptions",
      token: this.requireToken(),
    })
  }
  subscribeDatabase(databaseName: string) {
    return this.client.request<null>({
      method: "POST",
      path: "/v1/users/me/database-subscriptions",
      token: this.requireToken(),
      body: { database_name: databaseName },
    })
  }
}
