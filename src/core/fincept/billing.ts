import type { FinceptClient } from "./client"

export interface CreditEndpoint {
  method: string
  path: string
  cost: number
}
export interface CreditModule {
  name: string
  prefix: string
  endpoints: CreditEndpoint[]
}

export interface Plan {
  plan_id: string
  name: string
  description?: string | null
  price_usd: number
  currency: string
  credits: number
  support_type: string
  validity_days: number
  cost_per_request: number
  max_concurrent_requests: number
  rate_limit_per_minute: number
  modules: string[]
  features: string[]
  is_free: boolean
  display_order: number
}

export interface SubscriptionInfo {
  user_id: string
  account_type: string
  credit_balance: number
  support_type: string
  credits_expire_at?: string | null
  last_credit_purchase_at?: string | null
  created_at?: string
}

export interface Payment {
  payment_uuid: string
  payment_gateway: string
  amount_usd: number
  currency: string
  status: string
  plan_name?: string | null
  credits_purchased?: number | null
  payment_method?: string | null
  created_at: string
  completed_at?: string | null
}

export interface CreateOrderResult {
  order_id: string
  cf_order_id: string
  payment_session_id: string
  order_status: string
  order_amount: number
  order_currency: string
  payment_uuid: string
  plan_name: string
  environment: string
}

/**
 * Billing/credits over the Fincept backend (/v1/credits + /v1/cashfree). The
 * credits map and plans are public; everything else needs the token. Card
 * payment completes in a web checkout — createOrder returns the session id /
 * order the desktop hands off to the browser.
 */
export class FinceptBilling {
  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {}

  /** Public per-endpoint credit cost map. */
  creditsMap() {
    return this.client.request<{ modules: CreditModule[] }>({ method: "GET", path: "/v1/credits/endpoints" })
  }
  /** Public plan catalogue. */
  plans() {
    return this.client.request<Plan[]>({ method: "GET", path: "/v1/cashfree/plans" })
  }
  subscription() {
    return this.client.request<SubscriptionInfo>({
      method: "GET",
      path: "/v1/cashfree/subscription",
      token: this.token(),
    })
  }
  payments() {
    return this.client.request<{ payments: Payment[] }>({
      method: "GET",
      path: "/v1/cashfree/payments",
      token: this.token(),
    })
  }
  orderStatus(orderId: string) {
    return this.client.request<Record<string, unknown>>({
      method: "GET",
      path: `/v1/cashfree/order/${encodeURIComponent(orderId)}`,
      token: this.token(),
    })
  }
  /** Start a top-up. Returns the Cashfree order/session to complete in a browser. */
  createOrder(planId: string, opts?: { currency?: string; returnUrl?: string; customerPhone?: string }) {
    return this.client.request<CreateOrderResult>({
      method: "POST",
      path: "/v1/cashfree/create-order",
      token: this.token(),
      body: {
        plan_id: planId,
        currency: opts?.currency ?? "USD",
        ...(opts?.returnUrl ? { return_url: opts.returnUrl } : {}),
        ...(opts?.customerPhone ? { customer_phone: opts.customerPhone } : {}),
      },
    })
  }
}
