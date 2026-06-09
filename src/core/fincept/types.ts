/** Shared DTOs for the Fincept backend (finceptgo). Snake_case mirrors the API wire shapes. */

export interface FinceptEnvelope<T = unknown> {
  success: boolean
  message?: string
  data?: T
  error?: string
  hint?: string
  credits?: { required: number; available: number }
}

/** The credential pair sent on every authed request. apiKey = long-lived; sessionToken = device session. */
export interface FinceptSession {
  apiKey: string
  sessionToken?: string
}

export interface RegisterReq {
  username: string
  email: string
  password: string
  phone: string
  country: string
  country_code: string
}

export interface LoginData {
  api_key: string
  session_token: string
  user_id: string
  username: string
  email: string
  account_type: string
  credit_balance: number
  is_admin: boolean
}

/** Every auth entry point (verify, login, social) now returns this same bundle. */
export interface SessionData {
  api_key: string
  session_token: string
  user_id: string
  account_type: string
  username?: string
  email?: string
  credit_balance?: number
  is_admin?: boolean
}

/** Signup OTP verify — now returns a full session bundle (api_key + session_token). */
export type VerifyOtpData = SessionData

/** Register response — telegram_link present only when the backend has Telegram configured. */
export interface RegisterData {
  telegram_link?: string
}

export interface StatusData {
  authenticated: boolean
  user?: { id: string; username: string; email: string; account_type: string; is_admin: boolean }
}

export interface Account {
  id: string
  username: string
  email: string
  account_type: string
  credit_balance: number
  is_admin: boolean
  is_verified: boolean
  support_type: string
  rate_limit_per_hour: number
  api_key: string
  // present on GET /v1/users/me (not on the lighter auth/status payload)
  credits_expire_at?: string | null
  phone?: string
  country?: string
  country_code?: string
  created_at?: string
  notify_email?: boolean
  notify_telegram?: boolean
  notify_in_app?: boolean
}

export interface ProfilePatch {
  username?: string
  phone?: string
  country?: string
  country_code?: string
}

export interface UsageEntry {
  endpoint: string
  method: string
  credits_used: number
  response_time_ms: number
  status_code: number
  created_at: string
}

export interface TransactionEntry {
  transaction_id: string
  payment_gateway: string
  credits: number
  amount_cents: number
  currency: string
  status: string
  created_at: string
  completed_at?: string | null
}

export interface LoginEntry {
  ip_address: string
  user_agent: string
  device_info: string
  login_source: string
  country: string
  city: string
  login_successful: boolean
  failure_reason: string
  created_at: string
}

export interface Notification {
  id: number
  title: string
  description: string
  message: string
  category: string
  image_url: string
  action_url: string
  is_read: boolean
  created_at: string
  read_at?: string | null
}

export interface NotificationPrefs {
  notify_email: boolean
  notify_telegram: boolean
  notify_in_app: boolean
  telegram_chat_id: string
  telegram_connected: boolean
}

export interface NotificationPrefsPatch {
  notify_email?: boolean
  notify_telegram?: boolean
  notify_in_app?: boolean
  telegram_chat_id?: string
}

export interface Subscription {
  id: number
  database_name: string
  display_name: string
  subscription_type: string
  is_active: boolean
  subscribed_at: string
  expires_at?: string | null
}

export interface TelegramLink {
  deep_link: string
  token?: string
  expires_in?: number
}

export interface TelegramStatus {
  linked: boolean
  notify_telegram: boolean
}
