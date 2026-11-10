/** Observable signed-in local account for other Client plugins. */

import type {
  IdentityAccountView,
  IdentityCatalogModel,
  IdentityLineView,
  IdentityMethodRow,
} from '@deepseek-ai/dsh-experimental-api-identity/types'

/** Signed-in account plus advertised sign-in methods, lines, and Settings models. */
export interface IdentitySessionSnapshot {
  readonly current: IdentityAccountView | undefined
  readonly methods: readonly IdentityMethodRow[]
  readonly lines: readonly IdentityLineView[]
  readonly models: readonly IdentityCatalogModel[]
  readonly accounts: readonly IdentityAccountView[]
}

/** Bare snapshot source of Host `identity.status`. */
export class IdentitySessionStore {
  private snapshot: IdentitySessionSnapshot = {
    current: undefined,
    methods: [],
    lines: [],
    models: [],
    accounts: [],
  }
  private readonly listeners = new Set<() => void>()

  /**
   * Current identity snapshot for `useSyncExternalStore`.
   * @returns the latest snapshot handed to {@link set}.
   */
  getSnapshot(): IdentitySessionSnapshot {
    return this.snapshot
  }

  /**
   * Subscribe to status replacements.
   * @param listener - runs after {@link set}.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Replace the signed-in account, methods, lines, and Settings catalog.
   * @param next - Host snapshot.
   */
  set(next: IdentitySessionSnapshot): void {
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}
