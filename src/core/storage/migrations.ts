// src/core/storage/migrations.ts
export interface Migration {
  id: string
  sql: string
}

// Append-only, ordered. NEVER edit an applied migration — add a new one.
export const MIGRATIONS: Migration[] = [
  {
    id: "0001_session",
    sql: `
      CREATE TABLE IF NOT EXISTS session (
        id           TEXT PRIMARY KEY,
        project_hash TEXT NOT NULL,
        cwd          TEXT NOT NULL,
        title        TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        msg_count    INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS session_project_idx
        ON session(project_hash, updated_at DESC);
    `,
  },
  {
    id: "0002_checkpoint",
    sql: `
      CREATE TABLE IF NOT EXISTS checkpoint (
        id           TEXT PRIMARY KEY,
        session_id   TEXT NOT NULL,
        project_hash TEXT NOT NULL,
        tree_hash    TEXT NOT NULL,
        kind         TEXT NOT NULL,
        label        TEXT,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS checkpoint_session_idx
        ON checkpoint(session_id, created_at DESC);
    `,
  },
  {
    id: "jobs_v1",
    sql: `
      CREATE TABLE IF NOT EXISTS job (
        id TEXT PRIMARY KEY, project_hash TEXT NOT NULL, cwd TEXT NOT NULL,
        goal TEXT NOT NULL, status TEXT NOT NULL, pause_reason TEXT,
        success_spec TEXT, schedule TEXT, missed_policy TEXT,
        max_turns INTEGER NOT NULL DEFAULT 20, turns_used INTEGER NOT NULL DEFAULT 0,
        read_only INTEGER NOT NULL DEFAULT 1,
        next_run_at INTEGER, last_run_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_job_due ON job(status, next_run_at);
      CREATE TABLE IF NOT EXISTS job_turn (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, seq INTEGER NOT NULL,
        model TEXT, prompt_sha TEXT, text TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, UNIQUE(job_id, seq)
      );
      CREATE TABLE IF NOT EXISTS budget_ledger (
        scope TEXT PRIMARY KEY, input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0, usd REAL NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0, data_calls INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `,
  },
  { id: "jobs_v2_budget", sql: `ALTER TABLE job ADD COLUMN budget TEXT;` },
  {
    id: "risk_v1",
    sql: `
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY, cash REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
        high_water_mark REAL NOT NULL, realized_pnl_day REAL NOT NULL DEFAULT 0, pnl_day TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS position (
        account_id TEXT NOT NULL, symbol TEXT NOT NULL, qty REAL NOT NULL,
        avg_cost REAL NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (account_id, symbol)
      );
      CREATE TABLE IF NOT EXISTS reservation (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount REAL NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS order_outbox (
        idempotency_key TEXT PRIMARY KEY, account_id TEXT NOT NULL, symbol TEXT NOT NULL,
        side TEXT NOT NULL, qty REAL NOT NULL, status TEXT NOT NULL,
        broker_order_id TEXT, fill_price REAL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_approval (
        id TEXT PRIMARY KEY, job_id TEXT, action TEXT NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `,
  },
]
