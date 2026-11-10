# Local identity

English | [中文](identity.zh.md)

The experimental local-identity bundle (`@deepseek-ai/dsh-experimental-identity`) gives a single-machine deployment named accounts: people sign in with a local username and password, and everything afterwards — which Sessions a caller may list, read, or drive — is decided per actor instead of per machine. The [package README](../../packages/experimental/identity/README.md) owns account administration and configuration; the [Remote controller](../../packages/experimental/api-identity/README.md) owns the sign-in surface the Web client calls.

Source: [`packages/experimental/identity/src/index.ts`](../../packages/experimental/identity/src/index.ts)

<a id="accounts-and-sign-in"></a>

## Accounts and sign-in

Accounts live in one local store under the DSH home; passwords are kept only as salted hashes, and a sign-in binds the caller's Remote Peer to the account in Host memory, so later calls are recognized by that binding and a Host restart ends every binding. One seeded administrator account exists from first run: it holds the workspace capability, so it can administer workspaces and list and read every Session on the machine, but administration alone never grants writing into another actor's collaboration room — room writes still require occupancy. There is no disable, removal, or password-reset surface: an admin can promote or demote an account, and replacing capabilities stays with the seeded administrator. There is no anonymous fallback once identity is enabled, and callers whose Peer is not bound to an account are refused before any Session surface answers.

<a id="peer-binding"></a>

## Peer binding

The Remote layer does not trust a client-supplied actor name. Each authenticated connection is bound to exactly one actor, and every controller call runs as that actor: the identity a request claims is replaced by the bound one before a service sees it, so a client cannot act as another account by editing its request. The Web client mirrors this with its own session store (`ctx.identitySession` in the browser face): it holds the current sign-in, refreshes the Session list immediately after a sign-in completes so per-actor filtering applies to what is already on screen, and drops the stored token on sign-out. Capability checks stay on the host — the client only ever renders what the host's per-actor answers return.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxidentity--identityservice"></a>

### `ctx.identity` — `IdentityService`

Local accounts stored in credentials, plus a list of sign-in methods.

```ts cordis-catalog
/**
 * Advertise one sign-in method. Duplicate ids fail.
 * @param method - method id and credential kind.
 * @returns disposer that withdraws the method.
 */
registerMethod(method: IdentityMethodInfo): () => void

/**
 * Sign-in methods Clients may render.
 * @returns methods in registration order.
 */
listMethods(): readonly IdentityMethodInfo[]

/**
 * Registered accounts without secrets.
 * @returns accounts in store order.
 */
listAccounts(): readonly IdentityAccountView[]

/**
 * Host-wide business lines. Memberships do not leak across lines.
 * @returns stored lines, or Config seed when the store has none.
 */
listLines(): readonly IdentityLineView[]

/**
 * Settings mention routes the account panel may offer.
 * @returns `{provider}/{model}` rows; empty when `llm` is not loaded.
 */
async listCatalogModels(): Promise<readonly IdentityCatalogModel[]>

/**
 * Signed-in account for the current Remote caller, or the Host process
 * when called outside a Remote invocation.
 * @returns the current account, or `undefined`.
 */
currentAccount(): IdentityAccountView | undefined

/**
 * Signed-in account for one v3 browser-session Peer, if that Peer logged in.
 * @param browserSessionId - cookie Peer id stored on the local-identity principal.
 * @returns the bound account, or `undefined` when that browser is signed out.
 */
accountForBrowserSession(browserSessionId: string): IdentityAccountView | undefined

/**
 * Create a local username and password. Does not sign in.
 * @param username - account id, lowercase hyphenated.
 * @param password - secret, 8–128 characters.
 * @param name - display name.
 * @returns the new account without the secret.
 */
async registerPassword( username: string, password: string, name: string, ): Promise<IdentityAccountView>

/**
 * Sign in a local password account for the current Remote caller.
 * @param username - registered account id.
 * @param password - secret.
 * @returns the signed-in account.
 */
async loginPassword(username: string, password: string): Promise<IdentityAccountView>

/**
 * Clear the signed-in account for the current Remote caller. Registered users stay stored.
 */
logout(): void

/**
 * Store or clear another account's admin role. Config `admins` stay admin.
 * @param username - registered account id, not the signed-in admin.
 * @param admin - true to promote, false to demote.
 * @returns the updated account.
 */
async setAccountAdmin(username: string, admin: boolean): Promise<IdentityAccountView>

/**
 * Replace one account's Host feature capabilities. Requires a Config `seedAdmin`.
 * @param username - registered account id.
 * @param capabilities - subset of {@link IDENTITY_CAPABILITIES}.
 * @returns the updated account.
 */
async setAccountCapabilities( username: string, capabilities: readonly IdentityCapability[], ): Promise<IdentityAccountView>

/**
 * Create a Host-wide business line and join the signed-in admin to it.
 * @param id - username-shaped line id.
 * @param name - display name.
 * @returns the new line.
 */
async createLine(id: string, name: string): Promise<IdentityLineView>

/**
 * Join the signed-in account to an existing business line.
 * @param lineId - stored line id.
 * @returns the updated account.
 */
async joinLine(lineId: string): Promise<IdentityAccountView>

/**
 * Leave a business line. Models on that line stay stored for nobody.
 * @param lineId - stored line id.
 * @returns the updated account.
 */
async leaveLine(lineId: string): Promise<IdentityAccountView>

/**
 * Replace the signed-in account's model allowlist on one joined line.
 * @param lineId - stored line id the account already joined.
 * @param modelIds - Settings mention routes; empty means every connected model on that line.
 * @returns the updated account.
 */
async setLineModels(lineId: string, modelIds: readonly string[]): Promise<IdentityAccountView>

/**
 * Switch which joined line drives `@` models and room group.
 * @param lineId - a joined line, or `undefined` to clear.
 * @returns the updated account.
 */
async setActiveLine(lineId: string | undefined): Promise<IdentityAccountView>
```

Source: [`packages/experimental/identity/src/index.ts`](../../packages/experimental/identity/src/index.ts)

<a id="ctxidentitycontroller--identitycontroller"></a>

### `ctx.identityController` — `IdentityController`

Local identity never activates an Agent.

```ts cordis-catalog
/**
 * Signed-in account, advertised methods, and Host business lines.
 * @returns `current: null` when nobody is signed in.
 */
@Remote status(): IdentityStatus

/**
 * Registered accounts without secrets. Requires the signed-in admin.
 * @returns accounts in store order.
 */
@Remote listAccounts(): IdentityAccountView[]

/**
 * Settings mention routes the account panel may offer.
 * @param signal - Client cancellation.
 * @returns `{provider}/{model}` rows.
 */
@Remote async listCatalogModels(signal: AbortSignal): Promise<IdentityCatalogModel[]>

/**
 * Register a local username and password. Does not sign in.
 * @param username - account id.
 * @param password - secret.
 * @param name - display name.
 * @param signal - Client cancellation.
 * @returns the new account without the secret.
 */
@Remote async registerPassword( username: string, password: string, name: string, signal: AbortSignal, ): Promise<IdentityAccountView>

/**
 * Sign in a local password account for this Remote caller.
 * @param username - registered account id.
 * @param password - secret.
 * @param signal - Client cancellation.
 * @returns the signed-in account without the secret.
 */
@Remote async loginPassword( username: string, password: string, signal: AbortSignal, ): Promise<IdentityAccountView>

/**
 * Clear the signed-in account for this Remote caller.
 */
@Remote logout(): void

/**
 * Store or clear another account's admin role. Requires the signed-in admin.
 * @param username - registered account id, not the signed-in admin.
 * @param admin - true to promote, false to demote.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async setAccountAdmin(username: string, admin: boolean, signal: AbortSignal): Promise<IdentityAccountView>

/**
 * Replace one account's Host feature capabilities. Requires a Config `seedAdmin`.
 * @param username - registered account id.
 * @param capabilities - feature groups to enable.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async setAccountCapabilities( username: string, capabilities: readonly IdentityCapability[], signal: AbortSignal, ): Promise<IdentityAccountView>

/**
 * Create a Host-wide business line and join the signed-in admin. Requires admin.
 * @param id - username-shaped line id.
 * @param name - display name.
 * @param signal - Client cancellation.
 * @returns the new line.
 */
@Remote async createLine(id: string, name: string, signal: AbortSignal): Promise<IdentityLineView>

/**
 * Join the signed-in account to an existing business line.
 * @param lineId - stored line id.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async joinLine(lineId: string, signal: AbortSignal): Promise<IdentityAccountView>

/**
 * Leave a business line.
 * @param lineId - stored line id.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async leaveLine(lineId: string, signal: AbortSignal): Promise<IdentityAccountView>

/**
 * Replace the signed-in account's model allowlist on one joined line.
 * @param lineId - joined line id.
 * @param modelIds - Settings mention routes; empty means every connected model.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async setLineModels( lineId: string, modelIds: readonly string[], signal: AbortSignal, ): Promise<IdentityAccountView>

/**
 * Switch which joined line drives `@` models.
 * @param lineId - a joined line, or `null` to clear.
 * @param signal - Client cancellation.
 * @returns the updated account.
 */
@Remote async setActiveLine(lineId: string | null, signal: AbortSignal): Promise<IdentityAccountView>
```

Source: [`packages/experimental/api-identity/src/index.ts`](../../packages/experimental/api-identity/src/index.ts)
<!-- END GENERATED cordis-surface -->
