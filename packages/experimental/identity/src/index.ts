/** Local identity: password accounts now, with a method registry for later OAuth. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-llm'
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import {
  hashLocalPassword,
  isLocalPassword,
  isLocalUsername,
  LOCAL_USERS_KEY,
  parseDisplayName,
  parseStoredLines,
  parseStoredUsers,
  storedUserWithActiveLine,
  verifyLocalPassword,
} from './accounts.ts'
import type { StoredLine, StoredLocalUser } from './accounts.ts'
import { IdentityError } from './error.ts'
import { AccountId } from './types.ts'
import type {
  Config,
  IdentityAccountView,
  IdentityCatalogModel,
  IdentityLineView,
  IdentityMembership,
  IdentityMethodInfo,
  IdentityMethodKind,
  LocalIdentityPrincipal,
} from './types.ts'

export type * from './types.ts'
export { AccountId, IDENTITY_CLOSED_PROVIDER, occupancyOf } from './types.ts'
export { IdentityError } from './error.ts'
export { LOCAL_USERS_KEY } from './accounts.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Overlay local accounts and sign-in method registry. */
    identity: IdentityService
  }
}

const PASSWORD_METHOD: IdentityMethodInfo = { id: 'password', kind: 'password' }

function viewOf(user: StoredLocalUser, seedAdmins: readonly string[]): IdentityAccountView {
  return {
    id: AccountId(user.id),
    name: user.name,
    admin: accountIsAdmin(user, seedAdmins),
    seedAdmin: seedAdmins.includes(user.id),
    ...(user.activeLineId === undefined ? {} : { activeLineId: user.activeLineId }),
    memberships: user.memberships.map(row => ({
      lineId: row.lineId,
      modelIds: [...row.modelIds],
    })),
  }
}

function accountIsAdmin(user: StoredLocalUser, seedAdmins: readonly string[]): boolean {
  return user.role === 'admin' || seedAdmins.includes(user.id)
}

function lineView(line: StoredLine): IdentityLineView {
  return { id: line.id, name: line.name }
}

/** Local accounts stored in credentials, plus a list of sign-in methods. */
export class IdentityService extends Service {
  static inject = []

  static Config = z.object({
    lines: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).default([]),
    admins: z.array(z.string()).default([]),
  })

  private readonly methods = new Map<string, IdentityMethodInfo>()
  private readonly accounts = new Map<string, IdentityAccountView>()
  private readonly seedLines: readonly IdentityLineView[]
  private readonly seedAdmins: readonly string[]
  private lines: IdentityLineView[] = []
  /** Host-only calls share this account; Remote calls bind `sessions` instead. */
  private processAccount: IdentityAccountView | undefined
  private readonly sessions = new Map<string, string>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'identity')
    const seen = new Set<string>()
    const seed: IdentityLineView[] = []
    for (const line of config.lines ?? []) {
      const display = parseDisplayName(line.name)
      if (!isLocalUsername(line.id) || display === undefined) {
        throw new IdentityError(
          `identity Config line "${line.id}" needs a username-shaped id and a 1–64 character name`,
          'IDENTITY_INVALID_ARGUMENT',
        )
      }
      if (seen.has(line.id)) {
        throw new IdentityError(`duplicate identity Config line "${line.id}"`, 'IDENTITY_INVALID_ARGUMENT')
      }
      seen.add(line.id)
      seed.push({ id: line.id, name: display })
    }
    this.seedLines = seed
    const seedAdmins: string[] = []
    const seenAdmins = new Set<string>()
    for (const id of config.admins ?? []) {
      if (!isLocalUsername(id)) {
        throw new IdentityError(
          `identity Config admin "${id}" needs a username-shaped id`,
          'IDENTITY_INVALID_ARGUMENT',
        )
      }
      if (seenAdmins.has(id)) continue
      seenAdmins.add(id)
      seedAdmins.push(id)
    }
    this.seedAdmins = seedAdmins
    this.lines = [...seed]
    // Remote calls shadow this with the caller Peer; Host-only reads stay undefined.
    if (!Object.hasOwn(this.ctx.root.reflect.props, 'invocation')) {
      this.ctx.root.accessor('invocation', { get: () => undefined })
    }
    this.ctx.inject(['connection'], (ctx) => {
      ctx.connection.registerBrowserPrincipal((id): LocalIdentityPrincipal => ({
        kind: 'local-identity',
        browserSessionId: id,
      }))
    })
    this.ctx.effect(() => this.registerMethod(PASSWORD_METHOD), 'identity.password')
  }

  protected async [Service.init](): Promise<void> {
    this.ctx.inject(['credentials'], () => {
      void this.reloadAccounts()
    })
  }

  /**
   * Advertise one sign-in method. Duplicate ids fail.
   * @param method - method id and credential kind.
   * @returns disposer that withdraws the method.
   */
  registerMethod(method: IdentityMethodInfo): () => void {
    if (this.methods.has(method.id)) {
      throw new IdentityError(`sign-in method "${method.id}" is already registered`, 'IDENTITY_METHOD_EXISTS')
    }
    this.methods.set(method.id, method)
    return () => {
      this.methods.delete(method.id)
    }
  }

  /**
   * Sign-in methods Clients may render.
   * @returns methods in registration order.
   */
  listMethods(): readonly IdentityMethodInfo[] {
    return [...this.methods.values()]
  }

  /**
   * Registered accounts without secrets.
   * @returns accounts in store order.
   */
  listAccounts(): readonly IdentityAccountView[] {
    return [...this.accounts.values()]
  }

  /**
   * Host-wide business lines. Memberships do not leak across lines.
   * @returns stored lines, or Config seed when the store has none.
   */
  listLines(): readonly IdentityLineView[] {
    return this.lines
  }

  /**
   * Settings mention routes the account panel may offer.
   * @returns `{provider}/{model}` rows; empty when `llm` is not loaded.
   */
  async listCatalogModels(): Promise<readonly IdentityCatalogModel[]> {
    const llm = this.ctx.get('llm')
    if (llm === undefined) return []
    const rows: IdentityCatalogModel[] = []
    for (const provider of llm.listProviders()) {
      let models: readonly { readonly id: string; readonly name: string }[]
      try {
        models = await llm.listModels(provider.id)
      } catch (catalogError) {
        void catalogError
        continue
      }
      for (const model of models) {
        rows.push({
          id: `${provider.id}/${model.id}`,
          name: `${provider.id} · ${model.name}`,
        })
      }
    }
    return rows
  }

  /**
   * Signed-in account for the current Remote caller, or the Host process
   * when called outside a Remote invocation.
   * @returns the current account, or `undefined`.
   */
  currentAccount(): IdentityAccountView | undefined {
    const id = this.boundAccountId()
    return id === undefined ? undefined : this.accounts.get(id)
  }

  /**
   * Signed-in account for one v3 browser-session Peer, if that Peer logged in.
   * @param browserSessionId - cookie Peer id stored on the local-identity principal.
   * @returns the bound account, or `undefined` when that browser is signed out.
   */
  accountForBrowserSession(browserSessionId: string): IdentityAccountView | undefined {
    const id = this.sessions.get(browserSessionId)
    return id === undefined ? undefined : this.accounts.get(id)
  }

  /**
   * Create a local username and password. Does not sign in.
   * @param username - account id, lowercase hyphenated.
   * @param password - secret, 8–128 characters.
   * @param name - display name.
   * @returns the new account without the secret.
   */
  async registerPassword(
    username: string,
    password: string,
    name: string,
  ): Promise<IdentityAccountView> {
    this.assertMethod('password', 'password')
    if (!isLocalUsername(username)) {
      throw new IdentityError('username must be 2–32 lowercase letters, digits, or hyphens', 'IDENTITY_INVALID_ARGUMENT')
    }
    const display = parseDisplayName(name)
    if (display === undefined) {
      throw new IdentityError('name must be 1–64 characters', 'IDENTITY_INVALID_ARGUMENT')
    }
    if (!isLocalPassword(password)) {
      throw new IdentityError('password must be 8–128 characters', 'IDENTITY_INVALID_ARGUMENT')
    }
    if (this.accounts.has(username)) {
      throw new IdentityError(`username "${username}" is already registered`, 'IDENTITY_ACCOUNT_EXISTS')
    }
    const hashed = await hashLocalPassword(password)
    await this.mutateStore((users, lines) => {
      if (users.some(user => user.id === username)) {
        throw new IdentityError(`username "${username}" is already registered`, 'IDENTITY_ACCOUNT_EXISTS')
      }
      return {
        users: [...users, {
          id: username,
          name: display,
          salt: hashed.salt,
          hash: hashed.hash,
          n: hashed.n,
          role: this.seedAdmins.includes(username) ? 'admin' : 'member',
          memberships: [],
        }],
        lines,
      }
    })
    return this.loadedAccount(username)
  }

  /**
   * Sign in a local password account for the current Remote caller.
   * @param username - registered account id.
   * @param password - secret.
   * @returns the signed-in account.
   */
  async loginPassword(username: string, password: string): Promise<IdentityAccountView> {
    this.assertMethod('password', 'password')
    const peerId = this.callerPeerId()
    const record = await this.credentials().readRecord(LOCAL_USERS_KEY)
    const users = parseStoredUsers(record)
    const user = users.find(row => row.id === username)
    if (user === undefined || !(await verifyLocalPassword(password, user))) {
      throw new IdentityError('username or password is wrong', 'IDENTITY_BAD_CREDENTIALS')
    }
    const account = viewOf(user, this.seedAdmins)
    this.accounts.set(account.id, account)
    this.bindTo(peerId, account.id)
    this.refreshAccess(peerId)
    return account
  }

  /**
   * Clear the signed-in account for the current Remote caller. Registered users stay stored.
   */
  logout(): void {
    const peerId = this.callerPeerId()
    this.unbind()
    this.refreshAccess(peerId)
  }

  /**
   * Store or clear another account's admin role. Config `admins` stay admin.
   * @param username - registered account id, not the signed-in admin.
   * @param admin - true to promote, false to demote.
   * @returns the updated account.
   */
  async setAccountAdmin(username: string, admin: boolean): Promise<IdentityAccountView> {
    const signed = this.requireSigned()
    if (!signed.admin) {
      throw new IdentityError('only an admin may change another account\'s admin role', 'IDENTITY_UNAUTHORIZED')
    }
    if (username === signed.id) {
      throw new IdentityError('set another account\'s admin role', 'IDENTITY_INVALID_ARGUMENT')
    }
    await this.mutateStore((users, lines) => {
      const target = users.find(user => user.id === username)
      if (target === undefined) {
        throw new IdentityError(`unknown account "${username}"`, 'IDENTITY_INVALID_ARGUMENT')
      }
      if (!admin && this.seedAdmins.includes(username)) {
        throw new IdentityError(`Config admin "${username}" cannot be demoted`, 'IDENTITY_INVALID_ARGUMENT')
      }
      return {
        lines,
        users: users.map(user => (
          user.id === username ? { ...user, role: admin ? 'admin' as const : 'member' as const } : user
        )),
      }
    })
    return this.loadedAccount(username)
  }

  /**
   * Create a Host-wide business line and join the signed-in admin to it.
   * @param id - username-shaped line id.
   * @param name - display name.
   * @returns the new line.
   */
  async createLine(id: string, name: string): Promise<IdentityLineView> {
    const signed = this.requireSigned()
    if (!signed.admin) {
      throw new IdentityError('only an admin may create a business line', 'IDENTITY_UNAUTHORIZED')
    }
    if (!isLocalUsername(id)) {
      throw new IdentityError('line id must be 2–32 lowercase letters, digits, or hyphens', 'IDENTITY_INVALID_ARGUMENT')
    }
    const display = parseDisplayName(name)
    if (display === undefined) {
      throw new IdentityError('line name must be 1–64 characters', 'IDENTITY_INVALID_ARGUMENT')
    }
    if (this.lines.some(line => line.id === id)) {
      throw new IdentityError(`business line "${id}" already exists`, 'IDENTITY_LINE_EXISTS')
    }
    await this.mutateStore((users, lines) => {
      if (lines.some(line => line.id === id)) {
        throw new IdentityError(`business line "${id}" already exists`, 'IDENTITY_LINE_EXISTS')
      }
      return {
        lines: [...lines, { id, name: display }],
        users: users.map(user => user.id === signed.id ? joinUser(user, id) : user),
      }
    })
    const line = this.lines.find(row => row.id === id)
    if (line === undefined) {
      throw new IdentityError('created line is missing after write', 'IDENTITY_ACCOUNTS_CORRUPT')
    }
    return line
  }

  /**
   * Join the signed-in account to an existing business line.
   * @param lineId - stored line id.
   * @returns the updated account.
   */
  async joinLine(lineId: string): Promise<IdentityAccountView> {
    const signed = this.requireSigned()
    this.requireLine(lineId)
    await this.mutateStore((users, lines) => ({
      lines,
      users: users.map(user => user.id === signed.id ? joinUser(user, lineId) : user),
    }))
    return this.requireCurrent(signed.id)
  }

  /**
   * Leave a business line. Models on that line stay stored for nobody.
   * @param lineId - stored line id.
   * @returns the updated account.
   */
  async leaveLine(lineId: string): Promise<IdentityAccountView> {
    const signed = this.requireSigned()
    this.requireLine(lineId)
    await this.mutateStore((users, lines) => ({
      lines,
      users: users.map(user => user.id === signed.id ? leaveUser(user, lineId) : user),
    }))
    return this.requireCurrent(signed.id)
  }

  /**
   * Replace the signed-in account's model allowlist on one joined line.
   * @param lineId - stored line id the account already joined.
   * @param modelIds - Settings mention routes; empty means every connected model on that line.
   * @returns the updated account.
   */
  async setLineModels(lineId: string, modelIds: readonly string[]): Promise<IdentityAccountView> {
    const signed = this.requireSigned()
    this.requireLine(lineId)
    if (!signed.memberships.some(row => row.lineId === lineId)) {
      throw new IdentityError(`account is not a member of "${lineId}"`, 'IDENTITY_NOT_MEMBER')
    }
    const unique: string[] = []
    for (const route of modelIds) {
      const slash = route.indexOf('/')
      if (slash <= 0 || slash === route.length - 1) {
        throw new IdentityError(`model id "${route}" must be provider/model`, 'IDENTITY_INVALID_ARGUMENT')
      }
      if (!unique.includes(route)) unique.push(route)
    }
    await this.mutateStore((users, lines) => ({
      lines,
      users: users.map((user) => {
        if (user.id !== signed.id) return user
        return {
          ...user,
          memberships: user.memberships.map(row => (
            row.lineId === lineId ? { lineId, modelIds: unique } : row
          )),
        }
      }),
    }))
    return this.requireCurrent(signed.id)
  }

  /**
   * Switch which joined line drives `@` models and room group.
   * @param lineId - a joined line, or `undefined` to clear.
   * @returns the updated account.
   */
  async setActiveLine(lineId: string | undefined): Promise<IdentityAccountView> {
    const signed = this.requireSigned()
    if (lineId !== undefined) {
      this.requireLine(lineId)
      const membership = signed.memberships.find(row => row.lineId === lineId)
      if (membership === undefined) {
        throw new IdentityError(`account is not a member of "${lineId}"`, 'IDENTITY_NOT_MEMBER')
      }
    }
    await this.mutateStore((users, lines) => ({
      lines,
      users: users.map((user) => {
        if (user.id !== signed.id) return user
        return storedUserWithActiveLine(user, lineId)
      }),
    }))
    return this.requireCurrent(signed.id)
  }

  private requireSigned(): IdentityAccountView {
    const signed = this.currentAccount()
    if (signed === undefined) {
      throw new IdentityError('sign in before managing business lines', 'IDENTITY_UNAUTHORIZED')
    }
    return signed
  }

  private callerPeerId(): string | undefined {
    return this.ctx.invocation?.peer.id
  }

  private boundAccountId(): string | undefined {
    const peerId = this.callerPeerId()
    return peerId === undefined ? this.processAccount?.id : this.sessions.get(peerId)
  }

  private bindTo(peerId: string | undefined, accountId: string): void {
    if (peerId === undefined) {
      this.processAccount = this.accounts.get(accountId)
      return
    }
    this.sessions.set(peerId, accountId)
  }

  private unbind(): void {
    const peerId = this.callerPeerId()
    if (peerId === undefined) {
      this.processAccount = undefined
      return
    }
    this.sessions.delete(peerId)
  }

  private refreshAccess(peerId: string | undefined): void {
    if (peerId === undefined) return
    this.ctx.get('remoteAccess')?.invalidate({
      kind: 'local-identity',
      browserSessionId: peerId as PeerId,
    })
  }

  private loadedAccount(id: string): IdentityAccountView {
    const account = this.accounts.get(id)
    if (account === undefined) {
      throw new IdentityError('signed-in account is missing after write', 'IDENTITY_ACCOUNTS_CORRUPT')
    }
    return account
  }

  private requireCurrent(id: string): IdentityAccountView {
    return this.loadedAccount(id)
  }

  private requireLine(lineId: string): IdentityLineView {
    const line = this.lines.find(row => row.id === lineId)
    if (line === undefined) {
      throw new IdentityError(`unknown business line "${lineId}"`, 'IDENTITY_UNKNOWN_LINE')
    }
    return line
  }

  private assertMethod(id: string, kind: IdentityMethodKind): void {
    const method = this.methods.get(id)
    if (method === undefined || method.kind !== kind) {
      throw new IdentityError(`sign-in method "${id}" is not registered`, 'IDENTITY_UNKNOWN_METHOD')
    }
  }

  private credentials(): CredentialProvider {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new IdentityError(
        'local accounts need the credentials service',
        'IDENTITY_ACCOUNTS_UNAVAILABLE',
      )
    }
    return credentials
  }

  private async mutateStore(
    fn: (users: StoredLocalUser[], lines: StoredLine[]) => { users: StoredLocalUser[]; lines: StoredLine[] },
  ): Promise<void> {
    await this.credentials().modifyRecord(LOCAL_USERS_KEY, async (current) => {
      const users = parseStoredUsers(current)
      const stored = parseStoredLines(current)
      const lines = stored.length > 0 ? stored : this.seedLines.map(line => ({ id: line.id, name: line.name }))
      const next = fn(users, lines)
      return {
        kind: 'grant',
        payload: {
          users: next.users,
          lines: next.lines,
        },
      }
    })
    await this.reloadAccounts()
  }

  private async reloadAccounts(): Promise<void> {
    let users: StoredLocalUser[]
    let stored: StoredLine[]
    try {
      const record = await this.credentials().readRecord(LOCAL_USERS_KEY)
      users = parseStoredUsers(record)
      stored = parseStoredLines(record)
    } catch (error) {
      throw new IdentityError(
        'local account store is unreadable',
        'IDENTITY_ACCOUNTS_CORRUPT',
        { cause: error },
      )
    }
    this.lines = stored.length > 0 ? stored.map(lineView) : [...this.seedLines]
    this.accounts.clear()
    for (const user of users) {
      this.accounts.set(user.id, viewOf(user, this.seedAdmins))
    }
    if (this.processAccount !== undefined) {
      this.processAccount = this.accounts.get(this.processAccount.id)
    }
  }
}

function joinUser(user: StoredLocalUser, lineId: string): StoredLocalUser {
  if (user.memberships.some(row => row.lineId === lineId)) return user
  const memberships: IdentityMembership[] = [...user.memberships, { lineId, modelIds: [] }]
  return {
    ...user,
    memberships,
    activeLineId: user.activeLineId ?? lineId,
  }
}

function leaveUser(user: StoredLocalUser, lineId: string): StoredLocalUser {
  const memberships = user.memberships.filter(row => row.lineId !== lineId)
  const activeLineId = user.activeLineId === lineId ? memberships[0]?.lineId : user.activeLineId
  return storedUserWithActiveLine({ ...user, memberships }, activeLineId)
}

export default IdentityService
