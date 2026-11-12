# Collaboration rooms

English | [中文](collaboration.zh.md)

The experimental collaboration bundle (`@deepseek-ai/dsh-experimental-collaboration`) turns one Session into a room that several signed-in actors share: each occupant works in its own child Session (a branch), human posts are delivered to the occupants they mention, and an occupant's finished reply can be published back into the room Session's log. The [package README](../../packages/experimental/collaboration/README.md) owns configuration and the room workflows; the [Remote controller](../../packages/experimental/api-collaboration/README.md) owns the wire surface the Web client calls.

Source: [`packages/experimental/collaboration/src/index.ts`](../../packages/experimental/collaboration/src/index.ts)

<a id="rooms-and-branches"></a>

## Rooms and branches

A room is a root Session whose log carries the collaboration events (`collaboration/room-created`, `collaboration/occupant-joined`, `collaboration/message`, `collaboration/branch-opened`, `collaboration/actor-invoked`, `collaboration/occupant-removed`). Every occupant — the creator and each joined actor — works in a child Session of that root, opened with `openBranch`; the branch inherits the room history up to its fork point and then diverges. A branch owner can fork one level further from inside the branch: mentioning another model there appends the post to the branch log and opens a sub-branch seeded from the branch, so the same compile-and-watermark machinery runs against the branch as its invoking parent. A room is resumed lazily: publishing from a branch whose room is not live replays the room log and rebuilds the live room before the publish lands, so a cold room never refuses a publish. Sessions are named from initialization: under identity a new root Session is `${account name} 的会话`, it upgrades to `${creator name} 的协作房间` on claim or first room post, and each mention branch is `${model name} 分叉 · ${owner name}`; these are `default`-source titles that first-prompt generation may replace, while a user rename always wins and the branch name stays pinned. State that must survive a restart lives in the Session logs themselves; the service keeps only a journal of room-to-branch ownership and an occupancy cache that a throttled sweep prunes once an entry is neither persisted nor online.

<a id="access"></a>

## Access

One policy decides every collaboration question. `decideCollaborationAccess` in [`access-policy.ts`](../../packages/experimental/collaboration/src/access-policy.ts) reads the room projection and answers per Session: the room creator and the owner of a branch hold the full Session action set on their own Sessions — ownership expanding transitively over sub-branches opened inside a branch — occupants hold read and post rights on the room, the seeded administrator lists and reads every room without writing to rooms it does not occupy, and a caller with no occupancy relation is denied. The same decision feeds the Gateway's `remoteAccess` policy, so the session list, `@`-mention candidates, and direct Remote calls cannot disagree about who sees a room. Claiming a room binds only a root Session that actually carries room occupancy; a branch Session can never be claimed as a room.

<a id="posting-and-publishing"></a>

## Posting and publishing

A composer Send that carries room mention chips reaches this same path through the `conversation/before-send` serial event that `ui-conversation` owns, so an ordinary Enter never drops the mentions as a plain room prompt. The same route inside a branch sends its model chips to `postBranchMessage`: the post lands on the branch log, each mentioned model is compiled the branch transcript since its watermark, and the work continues in a sub-branch of the branch. Publishing from a sub-branch appends the reply to its parent branch instead of the room, through the same `publishFromChild` origin fields and duplicate refusal. A human post names its mentioned occupants; the service compiles one task per mentioned actor from the room transcript ([`compiler.ts`](../../packages/experimental/collaboration/src/compiler.ts)), dropping the oldest lines once the compiled text exceeds the configured `maxCompileBytes` budget, and delivers each task into that actor's branch. Delivery is per-recipient: a branch that cannot take the task is reported in the result's `failedActorIds` and never fails the whole post, and the post itself is recorded once in the room log. Every assistant reply on a branch carries its own publish action in its message action strip, addressed by message id; the composer's Push to room button publishes the latest reply instead. Publishing appends one finished assistant reply from a branch into the room log with its `branchSessionId` and `assistantSeq` origin fields; a second publish of the same reply is refused with `COLLAB_ALREADY_PUBLISHED` instead of duplicating it. The creator may remove another occupant and any occupant may leave; both end that actor's branch access from the next access decision on.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.md) · [Session](session.md) · [SessionId](core.md) · [SessionSeq](session.md)

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

Types: [Agent](core.md)

Source: [`packages/experimental/api-collaboration/src/index.ts`](../../packages/experimental/api-collaboration/src/index.ts)
<!-- END GENERATED cordis-surface -->
