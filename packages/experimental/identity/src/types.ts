/** Public local-identity account ids, sign-in methods, and service config. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol'

/** Caller identity for one v3 browser cookie on a Host that loaded identity. */
export interface LocalIdentityPrincipal {
  readonly kind: 'local-identity'
  /** Cookie Peer id; identity looks up the signed-in account from this. */
  readonly browserSessionId: PeerId
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /**
     * A browser session on a Host that loaded local identity. The account
     * bound to `browserSessionId` lives in `ctx.identity`, not on this value.
     */
    'local-identity': LocalIdentityPrincipal
  }
}

/** Stable identifier for one local account. */
export type AccountId = Branded<'AccountId'>

/**
 * Brand a validated account id.
 * @param id - username used as the durable account identity.
 * @returns the same string branded as an account identity.
 */
export function AccountId(id: string): AccountId {
  return id as AccountId
}

/** How a Host sign-in method collects credentials. */
export type IdentityMethodKind = 'password' | 'oauth'

/** One registered sign-in method advertised to Clients. */
export interface IdentityMethodInfo {
  /** Stable method id (`password` today; later oauth provider ids). */
  readonly id: string
  /** Credential collection kind. */
  readonly kind: IdentityMethodKind
}

/** One Host-wide business line. Membership and models do not leak across lines. */
export interface IdentityLineView {
  /** Username-shaped line id. */
  readonly id: string
  /** Display name. */
  readonly name: string
}

/** One account's membership on a single business line. */
export interface IdentityMembership {
  /** Business-line id. */
  readonly lineId: string
  /**
   * Settings mention routes (`provider/model`) this account may `@` on that line.
   * Empty means every connected Settings model.
   */
  readonly modelIds: readonly string[]
}

/** Signed-in or listed account, without secrets. */
export interface IdentityAccountView {
  readonly id: AccountId
  readonly name: string
  /** True when this account may list every user, line, and Session. */
  readonly admin: boolean
  /** True when Config `admins` named this username; it cannot be demoted. */
  readonly seedAdmin: boolean
  /** Business line used for `@` models and room group; omitted when none is active. */
  readonly activeLineId?: string
  /** Independent per-line memberships. */
  readonly memberships: readonly IdentityMembership[]
}

/** One Settings model the account panel may offer. */
export interface IdentityCatalogModel {
  /** Settings mention route `{provider}/{model}`. */
  readonly id: string
  /** Provider id plus advertised model name. */
  readonly name: string
}

/** Deployment-varying identity plugin config. */
export interface Config {
  /** Seed business lines written on first store create when none are stored yet. */
  readonly lines?: readonly IdentityLineView[]
  /** Usernames stored as admin when they register. A signed-in admin may also promote later accounts. */
  readonly admins?: readonly string[]
}

/**
 * Provider id that matches no Settings provider. Used when the account has
 * no active business line, so `@` catalogs stay empty instead of opening every model.
 */
export const IDENTITY_CLOSED_PROVIDER = '__identity_none__'

/**
 * Room occupancy derived from the active business line.
 * @param account - listed account.
 * @returns group id plus provider and mention-route allowlists.
 */
export function occupancyOf(account: IdentityAccountView): {
  group: string
  providers: string[]
  models: string[]
} {
  const lineId = account.activeLineId
  if (lineId === undefined) {
    return { group: '', providers: [IDENTITY_CLOSED_PROVIDER], models: [IDENTITY_CLOSED_PROVIDER] }
  }
  const membership = account.memberships.find(row => row.lineId === lineId)
  if (membership === undefined) {
    return { group: lineId, providers: [IDENTITY_CLOSED_PROVIDER], models: [IDENTITY_CLOSED_PROVIDER] }
  }
  if (membership.modelIds.length === 0) {
    return { group: lineId, providers: [], models: [] }
  }
  const providers: string[] = []
  for (const route of membership.modelIds) {
    const slash = route.indexOf('/')
    if (slash <= 0) continue
    const provider = route.slice(0, slash)
    if (!providers.includes(provider)) providers.push(provider)
  }
  return { group: lineId, providers, models: [...membership.modelIds] }
}
