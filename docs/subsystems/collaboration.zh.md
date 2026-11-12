# 协作房间

[English](collaboration.md) | 中文

实验性的协作 bundle（`@deepseek-ai/dsh-experimental-collaboration`）把一个 Session 变成多位已登录 actor 共享的房间：每位占用者在自己的子 Session（分支）里工作，人类帖子会投递给被提及的占用者，占用者完成的回复可以发布回房间 Session 的日志。[包 README](../../packages/experimental/collaboration/README.zh.md) 负责配置与房间工作流；[Remote 控制器](../../packages/experimental/api-collaboration/README.zh.md) 负责 Web 客户端调用的线路接口。

源码：[`packages/experimental/collaboration/src/index.ts`](../../packages/experimental/collaboration/src/index.ts)

<a id="rooms-and-branches"></a>

## 房间与分支

房间是一个根 Session，其日志承载协作事件（`collaboration/room-created`、`collaboration/occupant-joined`、`collaboration/message`、`collaboration/branch-opened`、`collaboration/actor-invoked`、`collaboration/occupant-removed`）。每位占用者——创建人和每位加入的 actor——都在该根的一个子 Session 中工作，用 `openBranch` 打开；分支继承分叉点之前的房间历史，之后各自演进。分支属主还能在分支内部再分一层：在那里 @ 另一个模型会把帖子追加到分支日志，并以分支为种子打开一个子分支，因此同一套编译与水位机制会把分支当作发起方父级再跑一遍。房间是惰性恢复的：从一个房间未驻活的分支发布时，会先重放房间日志重建活房间再落盘发布，所以冷房间不会拒绝发布。会话从初始化起就命名：开启 identity 时新根 Session 先叫 `{账号名} 的会话`，被认领或第一次按房间发帖后升级为 `{创建人名} 的协作房间`，每条提及分支则叫 `{模型名} 分叉 · {属主名}`；这些都是 `default` 来源标题，首轮生成仍可替换根会话名与房间名，用户改名永远胜出，分支名保持钉住。必须跨重启存活的状态都在 Session 日志本身里；服务只保留一份房间到分支归属的 journal 和一份占用缓存，节流清扫会在条目既未持久化又不在线时将其删除。

<a id="access"></a>

## 访问

所有协作问题由一份策略决定。[`access-policy.ts`](../../packages/experimental/collaboration/src/access-policy.ts) 中的 `decideCollaborationAccess` 读取房间投影并按 Session 回答：房间创建人和分支所有者对自己的 Session 拥有完整的 Session 动作集——属主权会传递到分支内开出的子分支——占用者对房间有读和发帖权，种子管理员可以列表并只读查看全部房间、但不能写入自己未占用的房间，与房间没有任何占用关系的调用者被拒绝。同一个判定结果喂给 Gateway 的 `remoteAccess` 策略，因此会话列表、`@` 提及候选和直接 Remote 调用对谁能看到房间不会产生分歧。认领房间只绑定确实带有房间占用关系的根 Session；分支 Session 永远不能被认领为房间。

<a id="posting-and-publishing"></a>

## 发帖与发布

带房间提及 chip 的 Composer 发送通过 `ui-conversation` 拥有的 `conversation/before-send` 串行事件走同一条路径，普通回车不会把提及当作普通房间 prompt 丢掉。同样的改道在分支内把模型 chip 发给 `postBranchMessage`：帖子落盘在分支日志，每个被 @ 的模型拿到自其水位以来的分支誊本编译，工作在该分支的子分支里继续。从子分支发布时，回复通过同一套 `publishFromChild` 来源字段与重复拒绝追加到它的父分支，而不是房间。人类帖子会点名被提及的占用者；服务按每位被提及的 actor 从房间记录编译一份任务（[`compiler.ts`](../../packages/experimental/collaboration/src/compiler.ts)），编译文本超过配置的 `maxCompileBytes` 预算时从最旧的行开始丢弃，并把每份任务投递到该 actor 的分支。投递是逐收件人的：无法接收任务的分支会记入结果的 `failedActorIds`，不会让整帖失败，帖子本身只在房间日志里记录一次。分支里每条助手回复的消息动作条都带有自己的发布动作，按 message id 定位；Composer 的「推到主会话」按钮则发布最新一条。发布把分支里一条完成的助手回复连同其 `branchSessionId` 与 `assistantSeq` 来源追加进房间日志；同一条回复第二次发布会被 `COLLAB_ALREADY_PUBLISHED` 拒绝，而不是重复写入。创建人可以移除其他占用者，任何占用者可以离开；两者都会从下一次访问判定起结束该 actor 的分支访问权。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcollaboration--collaborationservice"></a>

### `ctx.collaboration` — `CollaborationService`

Collaboration-room service backed by the exact live room Session log.

```ts cordis-catalog
/**
 * List Host occupants for this process. Clients use the Remote of the same name.
 * @returns identity humans, then Config occupants.
 */
listActors(): readonly ResolvedActor[]

/**
 * Settings-connected models this human may `@`.
 * @param actorId - posting human.
 * @returns advertised models on allowed providers, skipping providers whose catalog fails.
 */
async listMentionModels(actorId: ActorId): Promise<readonly ResolvedAiActor[]>

/**
 * Append one room line. Human mentions admit those occupants; AI mentions start a branch.
 * @param session - exact live room Session.
 * @param request - author, text, and optional human or AI mentions.
 * The child Session is private to the posting human. The reply stays on
 * the branch until that human calls {@link publishFromChild}.
 * @returns started branch Session ids; empty when no AI was mentioned.
 */
async postMessage(session: Session, request: PostMessageRequest): Promise<PostMessageResult>

/**
 * Record this human as the room's creator when the room has no occupants yet.
 * @param session - live room Session.
 * @param actorId - posting human.
 */
async claimRoom(session: Session, actorId: ActorId): Promise<void>

/**
 * Describe the room branch this Session belongs to, when it is one.
 * @param session - candidate branch Session.
 * @returns the owning room and AI occupant from the latest mention source, or `undefined`.
 */
branchOf(session: Session): { roomId: SessionId; actorId: ActorId } | undefined

/**
 * Copy one assistant reply from the branch onto the room as that AI's room line.
 * The room Agent is cold-resumed when it is not live. Publishing the same
 * branch reply twice is refused instead of duplicating the room line.
 * @param child - live branch Session started by a mention.
 * @param actorId - human occupant publishing from the branch.
 * @param assistantSeq - branch assistant-message seq to publish; omitted publishes the latest reply.
 * @param assistantMessageId - branch assistant message id to publish, for clients that address a reply by its message identity instead of its seq.
 */
async publishFromChild( child: Session, actorId: ActorId, assistantSeq?: SessionSeq, assistantMessageId?: string, ): Promise<void>

/**
 * Remove the calling human from this room. The creator may not leave
 * while other occupants remain; they remove the others first.
 * @param session - live room Session.
 * @param actorId - human leaving the room.
 */
async leaveRoom(session: Session, actorId: ActorId): Promise<void>

/**
 * Remove one occupant from this room. Only the room creator may remove others.
 * @param session - live room Session.
 * @param actorId - human performing the removal (the room creator).
 * @param targetId - occupant to remove.
 */
async removeOccupant(session: Session, actorId: ActorId, targetId: ActorId): Promise<void>

/**
 * Admit uncompiled room lines, then followup this Agent with the composer draft.
 * @param agent - live room Agent.
 * @param text - non-empty composer draft.
 * @param actorId - human occupant sending from the room.
 */
async sendWithRoom(agent: Agent, text: string, actorId: ActorId): Promise<void>

/**
 * Log the uncompiled room delta as a model-visible user message. Does not followup.
 * @param session - live room Session (not an AI child).
 * @param actorId - human occupant admitting the delta.
 */
async admitRoomContext(session: Session, actorId: ActorId): Promise<void>
```

Types: [Agent](core.zh.md) · [Session](session.zh.md) · [SessionId](core.zh.md) · [SessionSeq](session.zh.md)

Source: [`packages/experimental/collaboration/src/index.ts`](../../packages/experimental/collaboration/src/index.ts)

<a id="ctxcollaborationcontroller--collaborationcontroller"></a>

### `ctx.collaborationController` — `CollaborationController`

Room posts never followup the room Agent; mentioned AI children belong to `ctx.collaboration`.

```ts cordis-catalog
/**
 * List Host Config occupants for the room-post select.
 * @returns humans and optional Config AI occupants in Config order.
 */
@Remote listActors(): CollaborationActorRow[]

/**
 * List Settings-connected models this human may `@`.
 * @param actorId - posting human.
 * @param signal - Client cancellation.
 * @returns advertised models on that human's allowed providers.
 */
@Remote async listMentionModels(actorId: string, signal: AbortSignal): Promise<CollaborationActorRow[]>

/**
 * Append one room line on the Agent's Session. Structured AI mentions start branch turns.
 * @param agent - live room Agent whose Session is the shared log.
 * @param request - author id, text, and optional AI mention ids.
 * @param signal - Client cancellation.
 * @returns started branch Session ids after the room line is flushed.
 */
@Remote async postMessage( agent: Agent, request: CollaborationPostRequest, signal: AbortSignal, ): Promise<CollaborationPostResult>

/**
 * Copy one assistant reply from this branch onto its room as that AI's room line.
 * @param agent - live branch Agent started by a mention.
 * @param actorId - human occupant publishing from the branch.
 * @param assistantSeq - branch assistant-message seq to publish; omitted publishes the latest reply.
 * @param assistantMessageId - branch assistant message id to publish, for clients that address a reply by its message identity instead of its seq.
 * @param signal - Client cancellation.
 */
@Remote async publish( agent: Agent, actorId: string, assistantSeq: number | undefined, assistantMessageId: string | undefined, signal: AbortSignal, ): Promise<void>

/**
 * Describe the room branch this Session belongs to, when it is one.
 * @param agent - candidate branch Agent.
 * @param signal - Client cancellation.
 * @returns the owning room and AI occupant, or `null` when this Session is not a branch.
 */
@Remote branchInfo(agent: Agent, signal: AbortSignal): CollaborationBranchInfo | null

/**
 * Remove the calling human from this room.
 * @param agent - live room Agent.
 * @param actorId - human leaving the room.
 * @param signal - Client cancellation.
 */
@Remote async leaveRoom(agent: Agent, actorId: string, signal: AbortSignal): Promise<void>

/**
 * Remove one occupant from this room; only the room creator may call this.
 * @param agent - live room Agent.
 * @param actorId - room creator performing the removal.
 * @param targetId - occupant to remove.
 * @param signal - Client cancellation.
 */
@Remote async removeOccupant(agent: Agent, actorId: string, targetId: string, signal: AbortSignal): Promise<void>

/**
 * Record this human as creator when the room has no occupants yet.
 * @param agent - live room Agent.
 * @param actorId - claiming human.
 * @param signal - Client cancellation.
 */
@Remote async claimRoom(agent: Agent, actorId: string, signal: AbortSignal): Promise<void>

/**
 * Admit uncompiled room lines, then followup this Agent with the composer draft.
 * @param agent - live room Agent whose Session is the shared log.
 * @param text - non-empty composer draft.
 * @param actorId - human occupant sending from the room.
 * @param signal - Client cancellation.
 * @returns after the room Agent has accepted the followup.
 */
@Remote async sendWithRoom(agent: Agent, text: string, actorId: string, signal: AbortSignal): Promise<void>

/**
 * Log uncompiled room lines onto this Agent's Session. Does not followup.
 * @param agent - live room Agent whose Session is the shared log.
 * @param actorId - human occupant admitting the delta.
 * @param signal - Client cancellation.
 * @returns after the context message is flushed, or immediately when the delta is empty.
 */
@Remote async admitRoomContext(agent: Agent, actorId: string, signal: AbortSignal): Promise<void>
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/api-collaboration/src/index.ts`](../../packages/experimental/api-collaboration/src/index.ts)
<!-- END GENERATED cordis-surface -->
