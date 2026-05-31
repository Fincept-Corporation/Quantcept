import type { FinceptClient } from "./client"
import type { Account, LoginData, RegisterReq, StatusData, VerifyOtpData } from "./types"

/** Auth flows over the Fincept backend. Thin — all HTTP/error handling lives in FinceptClient. */
export class FinceptAuth {
  constructor(private readonly client: FinceptClient) {}

  register(req: RegisterReq) {
    return this.client.request<null>({ method: "POST", path: "/v1/users", body: req })
  }
  verifyOtp(email: string, otp: string) {
    return this.client.request<VerifyOtpData>({ method: "POST", path: "/v1/sessions/otp", body: { email, otp } })
  }
  login(email: string, password: string, forceLogin = false) {
    return this.client.request<LoginData>({ method: "POST", path: "/v1/sessions", body: { email, password, force_login: forceLogin } })
  }
  status(token: string) {
    return this.client.request<StatusData>({ method: "GET", path: "/v1/auth/status", token })
  }
  me(token: string) {
    return this.client.request<Account>({ method: "GET", path: "/v1/users/me", token })
  }
  regenerate(token: string) {
    return this.client.request<{ api_key: string }>({ method: "POST", path: "/v1/users/me/api-key/regenerate", token })
  }
  logout(token: string) {
    return this.client.request<null>({ method: "DELETE", path: "/v1/sessions/me", token })
  }
}
