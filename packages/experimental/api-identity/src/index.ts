/** Authenticated Client access to local identity. */

import { Context } from '@deepseek-ai/cordis'
import { IdentityError } from '@deepseek-ai/dsh-experimental-identity'
import type { IdentityAccountView as HostAccount } from '@deepseek-ai/dsh-experimental-identity'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  IdentityAccountView,
  IdentityCapability,
  IdentityCatalogModel,
  IdentityLineView,
  IdentityStatus,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Authenticated local identity. */
    identityController: IdentityController
  }
}

/**
 * Map a domain failure onto the identity Remote code table.
 * @param error - thrown identity failure.
 * @returns a wire `RemoteError`.
 */
function toRemoteError(error: IdentityError): RemoteError {
  switch (error.code) {
    case 'IDENTITY_UNKNOWN_METHOD':
      return new RemoteError('identity/unknown-method', error.message, { reason: error.message }, { cause: error })
    case 'IDENTITY_BAD_CREDENTIALS':
    case 'IDENTITY_UNAUTHORIZED':
      return new RemoteError('identity/unauthorized', error.message, { reason: error.message }, { cause: error })
    case 'IDENTITY_ACCOUNT_EXISTS':
    case 'IDENTITY_LINE_EXISTS':
      return new RemoteError('identity/conflict', error.message, { reason: error.message }, { cause: error })
    case 'IDENTITY_INVALID_ARGUMENT':
    case 'IDENTITY_UNKNOWN_LINE':
    case 'IDENTITY_NOT_MEMBER':
      return new RemoteError('identity/invalid-argument', error.message, { reason: error.message }, { cause: error })
    default:
      return new RemoteError('identity/failed', error.message, { reason: error.message }, { cause: error })
  }
}

function toWire(account: HostAccount): IdentityAccountView {
  return {
    id: account.id,
    name: account.name,
    admin: account.admin,
    seedAdmin: account.seedAdmin,
    ...(account.capabilities === undefined || account.capabilities.length === 0
      ? {}
      : { capabilities: [...account.capabilities] }),
    activeLineId: account.activeLineId ?? null,
    memberships: account.memberships.map(row => ({
      lineId: row.lineId,
      modelIds: [...row.modelIds],
    })),
  }
}

/**
 * Run an identity mutation and map domain failures onto Remote codes.
 * @param signal - Client cancellation.
 * @param run - Host call.
 * @returns the Host result.
 */
async function mutate<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  try {
    const value = await run()
    signal.throwIfAborted()
    return value
  } catch (error: unknown) {
    signal.throwIfAborted()
    if (error instanceof IdentityError) throw toRemoteError(error)
    throw error
  }
}

/** Local identity never activates an Agent. */
export default class IdentityController extends TypertRemoteService {
  static inject = ['identity', 'typert']

  constructor(ctx: Context) {
    super(ctx, 'identityController', { namespace: 'identity' })
  }

  /**
   * Signed-in account, advertised methods, and Host business lines.
   * @returns `current: null` when nobody is signed in.
   */
  @Remote
  status(): IdentityStatus {
    const current = this.ctx.identity.currentAccount()
    const admin = current?.admin === true
    return {
      current: current === undefined ? null : toWire(current),
      methods: this.ctx.identity.listMethods().map(method => ({ id: method.id, kind: method.kind })),
      lines: this.ctx.identity.listLines().map(line => ({ id: line.id, name: line.name })),
      accounts: admin ? this.ctx.identity.listAccounts().map(toWire) : [],
    }
  }

  /**
   * Registered accounts without secrets. Requires the signed-in admin.
   * @returns accounts in store order.
   */
  @Remote
  listAccounts(): IdentityAccountView[] {
    const current = this.ctx.identity.currentAccount()
    if (current === undefined || !current.admin) {
      throw new RemoteError(
        'identity/unauthorized',
        'only an admin may list every account',
        { reason: 'only an admin may list every account' },
      )
    }
    return this.ctx.identity.listAccounts().map(toWire)
  }

  /**
   * Settings mention routes the account panel may offer.
   * @param signal - Client cancellation.
   * @returns `{provider}/{model}` rows.
   */
  @Remote
  async listCatalogModels(signal: AbortSignal): Promise<IdentityCatalogModel[]> {
    return [...await mutate(signal, () => this.ctx.identity.listCatalogModels())]
  }

  /**
   * Register a local username and password. Does not sign in.
   * @param username - account id.
   * @param password - secret.
   * @param name - display name.
   * @param signal - Client cancellation.
   * @returns the new account without the secret.
   */
  @Remote
  async registerPassword(
    username: string,
    password: string,
    name: string,
    signal: AbortSignal,
  ): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.registerPassword(username, password, name)))
  }

  /**
   * Sign in a local password account for this Remote caller.
   * @param username - registered account id.
   * @param password - secret.
   * @param signal - Client cancellation.
   * @returns the signed-in account without the secret.
   */
  @Remote
  async loginPassword(
    username: string,
    password: string,
    signal: AbortSignal,
  ): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.loginPassword(username, password)))
  }

  /**
   * Clear the signed-in account for this Remote caller.
   */
  @Remote
  logout(): void {
    this.ctx.identity.logout()
  }

  /**
   * Store or clear another account's admin role. Requires the signed-in admin.
   * @param username - registered account id, not the signed-in admin.
   * @param admin - true to promote, false to demote.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async setAccountAdmin(username: string, admin: boolean, signal: AbortSignal): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.setAccountAdmin(username, admin)))
  }

  /**
   * Replace one account's Host feature capabilities. Requires a Config `seedAdmin`.
   * @param username - registered account id.
   * @param capabilities - feature groups to enable.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async setAccountCapabilities(
    username: string,
    capabilities: readonly IdentityCapability[],
    signal: AbortSignal,
  ): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.setAccountCapabilities(username, capabilities)))
  }

  /**
   * Create a Host-wide business line and join the signed-in admin. Requires admin.
   * @param id - username-shaped line id.
   * @param name - display name.
   * @param signal - Client cancellation.
   * @returns the new line.
   */
  @Remote
  async createLine(id: string, name: string, signal: AbortSignal): Promise<IdentityLineView> {
    const line = await mutate(signal, () => this.ctx.identity.createLine(id, name))
    return { id: line.id, name: line.name }
  }

  /**
   * Join the signed-in account to an existing business line.
   * @param lineId - stored line id.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async joinLine(lineId: string, signal: AbortSignal): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.joinLine(lineId)))
  }

  /**
   * Leave a business line.
   * @param lineId - stored line id.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async leaveLine(lineId: string, signal: AbortSignal): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.leaveLine(lineId)))
  }

  /**
   * Replace the signed-in account's model allowlist on one joined line.
   * @param lineId - joined line id.
   * @param modelIds - Settings mention routes; empty means every connected model.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async setLineModels(
    lineId: string,
    modelIds: readonly string[],
    signal: AbortSignal,
  ): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.setLineModels(lineId, modelIds)))
  }

  /**
   * Switch which joined line drives `@` models.
   * @param lineId - a joined line, or `null` to clear.
   * @param signal - Client cancellation.
   * @returns the updated account.
   */
  @Remote
  async setActiveLine(lineId: string | null, signal: AbortSignal): Promise<IdentityAccountView> {
    return toWire(await mutate(signal, () => this.ctx.identity.setActiveLine(lineId ?? undefined)))
  }
}
