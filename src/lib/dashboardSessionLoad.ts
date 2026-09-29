type SessionIdentity = { user: { id: string }; access_token: string };

/** Deduplicate auth notifications, never data or authorization results.
 * Scoped to a mounted data hook; polling and explicit reload bypass this. */
export class DashboardSessionLoad {
  #identity: SessionIdentity | null = null;
  generation = 0;

  authEvent(): void { this.generation += 1; }
  clear(): void { this.#identity = null; }

  accept(session: SessionIdentity): "initial" | "changed" | "duplicate" {
    const previous = this.#identity;
    if (previous?.user.id === session.user.id && previous.access_token === session.access_token) {
      return "duplicate";
    }
    this.#identity = { user: { id: session.user.id }, access_token: session.access_token };
    return previous ? "changed" : "initial";
  }
}
