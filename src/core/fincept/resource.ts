import { FinceptAuthError } from "@shared/errors"
import type { FinceptClient } from "./client"
import { queryString } from "./http"

/**
 * Base for the token-bound Fincept resource modules (account, market, research, learnings,
 * billing). Holds the client + a live token getter and exposes the two helpers each
 * resource used to re-implement: a guarded token accessor and the shared query-string
 * builder. Subclasses declare only their endpoint methods.
 *
 * Deliberately NOT extended by: `auth.ts` (its token is a per-method argument, not a bound
 * getter) and sync's `SyncResource` (it carries an extra base-path, so it keeps its own
 * small CRUD base).
 */
export abstract class FinceptResource {
  constructor(
    protected readonly client: FinceptClient,
    protected readonly token: () => string | undefined,
  ) {}

  /** Current token or throw FinceptAuthError — the client-side gate `account` relies on. */
  protected requireToken(): string {
    const tok = this.token()
    if (!tok) throw new FinceptAuthError("Not signed in")
    return tok
  }

  /** Shared query-string suffix builder (`?a=1&b=2`, or "" when empty). */
  protected qs(params?: Record<string, string | number | boolean | undefined>): string {
    return queryString(params)
  }
}
