import type { FinceptClient, FinceptResult } from "./client"
import { queryString } from "./http"

type Query = Record<string, string | number | boolean | undefined>

/**
 * Base paths for every per-user cloud-sync domain, verified against the Go
 * `creditinfo.Register` declarations. The four with a real Quantcept/agent
 * use-case get typed wrappers below; the rest are reachable via
 * `FinceptSync.resource(path)` pending a local consumer.
 */
export const CLOUD_DOMAINS = {
  settings: "/v1/settings",
  watchlists: "/v1/watchlists",
  notes: "/v1/notes",
  portfolios: "/v1/portfolios",
  dashboard: "/v1/dashboard",
  newsCloud: "/v1/news-cloud",
  workflows: "/v1/workflows",
  notebooks: "/v1/notebooks",
  reports: "/v1/reports",
  agentConfigs: "/v1/agent-configs",
  customIndices: "/v1/custom-indices",
  strategies: "/v1/strategies",
  paperTrading: "/v1/paper-trading",
} as const

// ── Typed payloads (verified against the Go handlers) ───────────────────

export interface SettingEntry {
  key: string
  value: string
  category: string
  updated_at?: string
}

export interface WatchlistStock {
  id: string
  symbol: string
  name?: string
  exchange?: string
  notes?: string | null
  sort_order?: number
  added_at?: string
}
export interface Watchlist {
  id: string
  name: string
  description?: string
  color?: string
  sort_order?: number
  is_default?: boolean
  stock_count?: number
  stocks?: WatchlistStock[]
  created_at?: string
  updated_at?: string
}
export interface WatchlistInput {
  name: string
  description?: string
  color?: string
  is_default?: boolean
}
export interface WatchlistStockInput {
  symbol: string
  name?: string
  exchange?: string
  notes?: string
}

export interface Note {
  id: string
  title: string
  content: string
  category: string
  priority?: number
  tags?: string
  tickers?: string
  sentiment?: string
  is_favorite?: boolean
  is_archived?: boolean
  color_code?: string
  word_count?: number
  created_at?: string
  updated_at?: string
}
export interface NotesPage {
  notes: Note[]
  pagination: { page: number; page_size: number; total: number; total_pages?: number }
}
export interface NoteInput {
  title: string
  content: string
  category?: string
  priority?: number
  tags?: string
  tickers?: string
  sentiment?: string
  color_code?: string
  reminder_date?: string
}
export interface NotesQuery {
  category?: string
  search?: string
  favorites?: boolean
  archived?: boolean
  page?: number
  page_size?: number
}

export interface Portfolio {
  id: string
  name: string
  [k: string]: unknown
}

// ── Generic per-user CRUD resource ──────────────────────────────────────

/**
 * The uniform per-user cloud spine shared by the sync domains:
 * `GET / · POST / · GET/PUT/DELETE /:id`. `T` is the item type, `C` the create
 * body, `L` the list payload (defaults to `T[]`; some domains wrap it).
 */
export class SyncResource<T = unknown, C = Record<string, unknown>, L = T[]> {
  constructor(
    protected readonly client: FinceptClient,
    protected readonly base: string,
    protected readonly token: () => string | undefined,
  ) {}

  protected req<R>(method: FinceptRequestMethod, sub = "", body?: unknown): Promise<FinceptResult<R>> {
    return this.client.request<R>({ method, path: this.base + sub, token: this.token(), body })
  }

  list(query?: Query) {
    return this.req<L>("GET", queryString(query))
  }
  get(id: string) {
    return this.req<T>("GET", `/${encodeURIComponent(id)}`)
  }
  create(body: C) {
    return this.req<T>("POST", "", body)
  }
  update(id: string, body: Partial<C> & Record<string, unknown>) {
    return this.req<null>("PUT", `/${encodeURIComponent(id)}`, body)
  }
  remove(id: string) {
    return this.req<null>("DELETE", `/${encodeURIComponent(id)}`)
  }
}

type FinceptRequestMethod = "GET" | "POST" | "PUT" | "DELETE"

// ── Typed domain wrappers ───────────────────────────────────────────────

export class Watchlists extends SyncResource<Watchlist, WatchlistInput> {
  addStock(id: string, stock: WatchlistStockInput) {
    return this.req<WatchlistStock>("POST", `/${encodeURIComponent(id)}/stocks`, stock)
  }
  removeStock(id: string, symbol: string) {
    return this.req<null>("DELETE", `/${encodeURIComponent(id)}/stocks/${encodeURIComponent(symbol)}`)
  }
}

export class Notes extends SyncResource<Note, NoteInput, NotesPage> {
  toggleFavorite(id: string) {
    return this.req<null>("PUT", `/${encodeURIComponent(id)}/favorite`)
  }
  toggleArchive(id: string) {
    return this.req<null>("PUT", `/${encodeURIComponent(id)}/archive`)
  }
}

export class Portfolios extends SyncResource<Portfolio, Record<string, unknown>> {
  importPortfolio(body: Record<string, unknown>) {
    return this.req<Portfolio>("POST", "/import", body)
  }
  exportPortfolio(id: string) {
    return this.req<unknown>("GET", `/${encodeURIComponent(id)}/export`)
  }
  addAsset(id: string, body: Record<string, unknown>) {
    return this.req<unknown>("POST", `/${encodeURIComponent(id)}/assets`, body)
  }
  updateAsset(id: string, assetId: string, body: Record<string, unknown>) {
    return this.req<null>("PUT", `/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`, body)
  }
  removeAsset(id: string, assetId: string) {
    return this.req<null>("DELETE", `/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`)
  }
  sell(id: string, body: Record<string, unknown>) {
    return this.req<unknown>("POST", `/${encodeURIComponent(id)}/sell`, body)
  }
  recordDividend(id: string, body: Record<string, unknown>) {
    return this.req<unknown>("POST", `/${encodeURIComponent(id)}/dividend`, body)
  }
  listTransactions(id: string) {
    return this.req<unknown[]>("GET", `/${encodeURIComponent(id)}/transactions`)
  }
  addTransaction(id: string, body: Record<string, unknown>) {
    return this.req<unknown>("POST", `/${encodeURIComponent(id)}/transactions`, body)
  }
  listSnapshots(id: string) {
    return this.req<unknown[]>("GET", `/${encodeURIComponent(id)}/snapshots`)
  }
  saveSnapshot(id: string, body: Record<string, unknown>) {
    return this.req<unknown>("POST", `/${encodeURIComponent(id)}/snapshots`, body)
  }
}

/** Key-value settings store (categories, not id-CRUD). */
export class Settings {
  constructor(
    private readonly client: FinceptClient,
    private readonly base: string,
    private readonly token: () => string | undefined,
  ) {}

  private req<R>(method: FinceptRequestMethod, sub = "", body?: unknown): Promise<FinceptResult<R>> {
    return this.client.request<R>({ method, path: this.base + sub, token: this.token(), body })
  }

  getAll() {
    return this.req<SettingEntry[]>("GET", "")
  }
  getByCategory(category: string) {
    return this.req<SettingEntry[]>("GET", `/category/${encodeURIComponent(category)}`)
  }
  getKey(key: string) {
    return this.req<SettingEntry>("GET", `/${encodeURIComponent(key)}`)
  }
  set(key: string, value: string, category?: string) {
    return this.req<SettingEntry>("PUT", `/${encodeURIComponent(key)}`, { value, category })
  }
  setBulk(settings: { key: string; value: string; category?: string }[]) {
    return this.req<{ saved: number }>("PUT", "", { settings })
  }
  removeKey(key: string) {
    return this.req<null>("DELETE", `/${encodeURIComponent(key)}`)
  }
  clearCategory(category: string) {
    return this.req<{ deleted: number }>("DELETE", `/category/${encodeURIComponent(category)}`)
  }
}

/**
 * Cloud-sync over the Fincept backend — per-user persistence of the terminal's
 * local state (settings, watchlists, notes, portfolios, …). The four
 * first-class domains are fully typed; the remaining nine are reachable via
 * `resource()` (their list roots differ — e.g. dashboard `/layouts`,
 * paper-trading `/portfolios` — so they need bespoke wrappers, not the CRUD spine).
 */
export class FinceptSync {
  readonly settings: Settings
  readonly watchlists: Watchlists
  readonly notes: Notes
  readonly portfolios: Portfolios

  constructor(
    private readonly client: FinceptClient,
    private readonly token: () => string | undefined,
  ) {
    this.settings = new Settings(client, CLOUD_DOMAINS.settings, token)
    this.watchlists = new Watchlists(client, CLOUD_DOMAINS.watchlists, token)
    this.notes = new Notes(client, CLOUD_DOMAINS.notes, token)
    this.portfolios = new Portfolios(client, CLOUD_DOMAINS.portfolios, token)
  }

  /** Generic per-user CRUD handle for any cloud domain (see CLOUD_DOMAINS). */
  resource<T = unknown>(basePath: string) {
    return new SyncResource<T>(this.client, basePath, this.token)
  }
}
