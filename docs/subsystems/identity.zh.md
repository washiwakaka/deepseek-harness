# 本地身份

[English](identity.md) | 中文

实验性的本地身份 bundle（`@deepseek-ai/dsh-experimental-identity`）为单机部署提供具名账号：人们用本地用户名和密码登录，之后的一切——调用者可以列表、读取或驱动哪些 Session——都按 actor 而非按机器判定。[包 README](../../packages/experimental/identity/README.zh.md) 负责账号管理与配置；[Remote 控制器](../../packages/experimental/api-identity/README.zh.md) 负责 Web 客户端调用的登录接口。

源码：[`packages/experimental/identity/src/index.ts`](../../packages/experimental/identity/src/index.ts)

<a id="accounts-and-sign-in"></a>

## 账号与登录

账号存放在 DSH home 下的一份本地存储中；密码只保存加盐哈希，登录会把调用者的 Remote Peer 与账号绑定在 Host 内存中，后续调用靠该绑定识别，Host 重启会结束全部分绑定。一台机器从首次运行起就有一个种子管理员账号：它持有 workspace capability，可以管理工作区、列表并只读查看机器上的全部 Session，但仅凭管理身份不能写入其他 actor 的协作房间——房间写入仍然要求占用关系。不存在禁用、删除或重置密码的接口：管理员可以提升或降级账号，替换 capabilities 保留给种子管理员。启用身份后不存在匿名回退，Peer 未绑定账号的调用者在任何 Session 接口应答之前就会被拒绝。

<a id="peer-binding"></a>

## Peer 绑定

Remote 层不信任客户端自报的 actor 名。每个已认证连接只绑定一个 actor，每次控制器调用都以该 actor 身份运行：请求所声称的身份在到达服务之前会被替换为绑定身份，因此客户端无法通过修改请求冒充另一个账号。Web 客户端用自己的会话存储镜像这一点（浏览器面的 `ctx.identitySession`）：它保存当前登录状态，在登录完成后立即刷新 Session 列表，使按 actor 的过滤作用于已经显示在屏幕上的内容，并在退出登录时丢弃所存令牌。能力检查留在 host 侧——客户端只渲染 host 按 actor 返回的结果。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
