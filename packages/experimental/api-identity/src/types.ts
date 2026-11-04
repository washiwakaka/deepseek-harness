/** JSON-safe inputs and results of the experimental identity Remote. */

import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Username, password, or display name failed validation. */
    'identity/invalid-argument': { readonly reason: string }
    /** Username is already registered. */
    'identity/conflict': { readonly reason: string }
    /** Username or password is wrong. */
    'identity/unauthorized': { readonly reason: string }
    /** Requested sign-in method is not registered. */
    'identity/unknown-method': { readonly reason: string }
    /** The identity store could not complete the request. */
    'identity/failed': { readonly reason: string }
  }
}

/** One Host-wide business line. */
export interface IdentityLineView {
  readonly id: string
  readonly name: string
}

/** One account's membership on a single business line. */
export interface IdentityMembership {
  readonly lineId: string
  readonly modelIds: readonly string[]
}

/** Signed-in or listed account, without secrets. */
export interface IdentityAccountView {
  readonly id: string
  readonly name: string
  readonly admin: boolean
  /** True when Config `admins` named this username; it cannot be demoted. */
  readonly seedAdmin: boolean
  readonly activeLineId: string | null
  readonly memberships: readonly IdentityMembership[]
}

/** One Settings model the account panel may offer. */
export interface IdentityCatalogModel {
  readonly id: string
  readonly name: string
}

/** One Client-renderable sign-in method. */
export interface IdentityMethodRow {
  readonly id: string
  readonly kind: 'password' | 'oauth'
}

/** Host sign-in snapshot. */
export interface IdentityStatus {
  readonly current: IdentityAccountView | null
  readonly methods: readonly IdentityMethodRow[]
  readonly lines: readonly IdentityLineView[]
  /** Every account, only when the signed-in account is admin; otherwise empty. */
  readonly accounts: readonly IdentityAccountView[]
}
