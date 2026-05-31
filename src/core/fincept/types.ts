/** Shared DTOs for the Fincept backend (finceptgo). Snake_case mirrors the API wire shapes. */

export interface FinceptEnvelope<T = unknown> {
  success: boolean
  message?: string
  data?: T
  error?: string
  hint?: string
  credits?: { required: number; available: number }
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

export interface VerifyOtpData {
  api_key: string
  user_id: string
  account_type: string
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
}
