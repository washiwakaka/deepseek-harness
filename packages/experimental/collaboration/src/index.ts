/** Collaboration-room service: non-surface peer chat, @-invoked AI children, and per-actor compile. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-llm'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import { SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { occupancyOf } from '@deepseek-ai/dsh-experimental-identity'
import type { RemoteAccessAction } from '@deepseek-ai/dsh-api-remote-access'
import type {} from '@deepseek-ai/dsh-typert-protocol'
import { createLocalIdentityAccessPolicy, type RoomOccupancy } from './access-policy.ts'
import {
  humanMayUseProvider,
  listCatalogMentions,
  parseMentionRoute,
} from './catalog.ts'
import { collectRoomConversation, compileMentionTask, compileRoomContext } from './compiler.ts'
import { CollaborationError } from './error.ts'
import { CollaborationJournal } from './journal.ts'
import { childOf, collaborationProjectionDefinition, watermarkOf } from './projection.ts'
import { ActorId, CollaborationMessageId } from './types.ts'
import type {
  ActorConfig,
  Config,
  PostMessageRequest,
  PostMessageResult,
  ResolvedActor,
  ResolvedAiActor,
  ResolvedHumanActor,
} from './types.ts'

export type * from './types.ts'
export { ActorId, CollaborationMessageId } from './types.ts'
export { mentionRouteId, parseMentionRoute } from './catalog.ts'

/**
 * Sidebar title for one model branch of a room.
 * @param modelName - display name of the mentioned model.
 * @param ownerName - display name of the human who owns the branch, when known.
 * @returns `{model} 分叉 · {owner}`, or `{model} 分叉` without a known owner.
 */
export function branchTitle(modelName: string, ownerName?: string): string {
  const owner = ownerName?.trim() ?? ''
  return owner.length === 0 ? `${modelName} 分叉` : `${modelName} 分叉 · ${owner}`
}

/**
 * Initial title for a root Session that has not been used as a room yet.
 * @param ownerName - display name of the human the Session belongs to.
 * @returns `{owner} 的会话`.
 */
export function sessionDefaultTitle(ownerName: string): string {
  return `${ownerName} 的会话`
}

/**
 * Title for a root Session once it is used as a collaboration room.
 * @param ownerName - display name of the room creator.
 * @returns `{owner} 的协作房间`.
 */
export function roomDefaultTitle(ownerName: string): string {
  return `${ownerName} 的协作房间`
}
export { CollaborationError } from './error.ts'
export {
  collectRoomConversation,
  compileMentionTask,
  compileRoomContext,
  fitCompileLines,
  COLLABORATION_COMPILE_OMITTED_LINE,
  COLLABORATION_MENTION_INSTRUCTION,
  COLLABORATION_ROOM_CONTEXT_INSTRUCTION,
  ROOM_ASSISTANT_LABEL,
  ROOM_USER_LABEL,
} from './compiler.ts'
export { collaborationProjectionDefinition } from './projection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    collaboration: CollaborationService
  }
  interface Events {
    /**
     * `session/create` finished announcing the Agent. Occupancy listeners stamp
     * the creating Peer when `peerId` is present.
     * @mode serial
     * @param created - the new Agent and the creating Remote Peer id, when any.
     */
    'api-session/conversation-created'(created: {
      readonly agent: Agent
      readonly peerId?: string
    }): Promise<void> | void
  }
}

const DEFAULT_MAX_MESSAGE_BYTES = 65_536

const DEFAULT_MAX_COMPILE_BYTES = 32_768

const SEED_ADMIN_FORWARDED_EVENTS: readonly RemoteAccessAction[] = [
  'event:agent-preset/selected',
  'event:commands/change',
  'event:deepseek-account/session-expired',
  'event:deepseek-account/model-sign-in-required',
  'event:credentials/record-updated',
  'event:credentials/reference-updated',
  'event:goal/activation-changed',
  'event:cordis/request-run',
  'event:cordis/request-run-resolved',
  'event:cordis/dynamic-package',
  'event:cordis/dynamic-retract',
  'event:cordis/inspect-query',
  'event:cordis/inspect-query-resolved',
  'event:llm/adapters-updated',
  'event:llm/models-updated',
  'event:permission-presets/catalog-changed',
  'event:plugin-manager/changed',
  'event:plugin-manager/install-log',
  'event:plugin-manager/install-state',
  'event:plugin-manager/update-state',
  'event:plugin-market/changed',
  'event:settings/document-updated',
  'event:schedule/changed',
  'event:web/providers-changed',
]

/**
 * Occupant roster used when Config omits `actors`.
 * Overlay YAML may omit the list; Clients call `listActors` instead of reading the patch file.
 */
const defaultActors: readonly ActorConfig[] = [
  { id: 'alice', kind: 'human', name: 'Alice', group: 'core' },
  { id: 'bob', kind: 'human', name: 'Bob', group: 'guest' },
  { id: 'charlie', kind: 'human', name: 'Charlie', group: 'guest' },
  { id: 'david', kind: 'human', name: 'David', group: 'guest' },
  { id: 'eve', kind: 'human', name: 'Eve', group: 'guest' },
  { id: 'frank', kind: 'human', name: 'Frank', group: 'guest' },
  { id: 'george', kind: 'human', name: 'George', group: 'guest' },
  { id: 'hannah', kind: 'human', name: 'Hannah', group: 'guest' },
  { id: 'isaac', kind: 'human', name: 'Isaac', group: 'guest' },
  { id: 'james', kind: 'human', name: 'James', group: 'guest' },
]

/** Validate one positive safe-integer deployment limit. */
function positiveLimit(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CollaborationError(`${name} must be a positive safe integer`, 'COLLAB_INVALID_CONFIG')
  }
  return value
}

/**
 * Resolve and freeze the Config roster.
 * @param actors - raw Config occupants. Empty is valid when identity supplies humans.
 * @returns unique resolved occupants.
 */
function resolveRoster(actors: readonly ActorConfig[]): readonly ResolvedActor[] {
  if (actors.length === 0) return []
  const seen = new Set<string>()
  const resolved: ResolvedActor[] = []
  for (const actor of actors) {
    if (actor.id.length === 0 || actor.name.length === 0) {
      throw new CollaborationError('each actor needs a non-empty id and name', 'COLLAB_INVALID_CONFIG')
    }
    if (seen.has(actor.id)) {
      throw new CollaborationError(`duplicate actor id "${actor.id}"`, 'COLLAB_INVALID_CONFIG')
    }
    seen.add(actor.id)
    if (actor.kind === 'human') {
      resolved.push({
        id: ActorId(actor.id),
        kind: 'human',
        name: actor.name,
        group: actor.group ?? '',
        providers: actor.providers ?? [],
        models: actor.models ?? [],
      })
      continue
    }
    if (actor.kind !== 'ai') {
      throw new CollaborationError(`actor "${actor.id}" has an unknown kind`, 'COLLAB_INVALID_CONFIG')
    }
    if (actor.provider === undefined || actor.provider.length === 0
      || actor.model === undefined || actor.model.length === 0) {
      throw new CollaborationError(`AI actor "${actor.id}" needs provider and model`, 'COLLAB_INVALID_CONFIG')
    }
    resolved.push({
      id: ActorId(actor.id),
      kind: 'ai',
      name: actor.name,
      provider: actor.provider,
      model: actor.model,
    })
  }
  return resolved
}

/** Collaboration-room service backed by the exact live room Session log. */
export class CollaborationService extends Service {
  static inject = ['agents', 'sessions', 'sessionPersistence', 'sessionProjections', 'llm']

  static Config: z<Config> = z.object({
    actors: z.array(z.object({
      id: z.string(),
      kind: z.union([z.const('human'), z.const('ai')]),
      name: z.string(),
      group: z.string().default(''),
      providers: z.array(z.string()).default([]),
      models: z.array(z.string()).default([]),
      provider: z.string().default(''),
      model: z.string().default(''),
    })).default([...defaultActors]),
    maxMessageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_BYTES),
    maxCompileBytes: z.number().step(1).min(1).default(DEFAULT_MAX_COMPILE_BYTES),
  })

  private readonly roster: readonly ResolvedActor[]
  private readonly actorsById: ReadonlyMap<string, ResolvedActor>
  private readonly maxMessageBytes: number
  private readonly maxCompileBytes: number
  private journal!: CollaborationJournal
  private readonly childHandles = new Map<string, AgentHandle>()
  private readonly occupancyCache = new Map<string, RoomOccupancy>()
  private occupancyPrune: Promise<void> | undefined
  private lastOccupancyPrune = 0

  constructor(ctx: Context, config: Config) {
    super(ctx, 'collaboration')
    this.roster = resolveRoster(config.actors ?? defaultActors)
    this.actorsById = new Map(this.roster.map(actor => [actor.id, actor]))
    this.maxMessageBytes = positiveLimit(
      'maxMessageBytes',
      config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    )
    this.maxCompileBytes = positiveLimit(
      'maxCompileBytes',
      config.maxCompileBytes ?? DEFAULT_MAX_COMPILE_BYTES,
    )
  }

  protected async [Service.init](): Promise<void> {
    const handle = await this.ctx.sessionProjections.register(collaborationProjectionDefinition)
    this.journal = new CollaborationJournal(this.ctx, handle)
    this.ctx.on('agent/created', async ({ agent, source }) => {
      await this.claimCreatedRoot(agent.session, source)
    })
    this.ctx.on('api-session/conversation-created', async ({ agent, peerId }) => {
      await this.claimCreatedRoot(agent.session, 'startup', peerId)
    })
    this.ctx.on('session/created', () => {
      this.refreshAccess()
    })
    this.ctx.on('domain/changed', (change) => {
      if (change.domain !== 'workspace') return
      this.refreshAccess()
    })
    this.ctx.on('agent/pre-step', async ({ agent }, next) => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      const roomContext = this.roomContextMessage(agent.session)
      if (roomContext === undefined) return decision
      return {
        ...decision,
        messages: [roomContext, ...decision.messages],
      }
    })
    await this.hydrateOccupancy()
    this.ctx.inject(['remoteAccess'], (ctx) => {
      ctx.remoteAccess.registerPolicy('local-identity', createLocalIdentityAccessPolicy({
        accountForBrowserSession: id => this.ctx.get('identity')?.accountForBrowserSession(id),
        listedSessions: () => {
          this.scheduleOccupancyPrune()
          const ids: SessionId[] = []
          const seen = new Set<string>()
          const add = (id: SessionId) => {
            if (seen.has(id)) return
            seen.add(id)
            ids.push(id)
          }
          for (const session of this.ctx.get('sessions')?.list() ?? []) add(session.id)
          for (const id of this.occupancyCache.keys()) add(SessionId(id))
          return ids
        },
        occupancy: sessionId => this.occupancyOf(sessionId),
        fullGlobalActions: () => {
          const actions: RemoteAccessAction[] = [...SEED_ADMIN_FORWARDED_EVENTS]
          for (const descriptor of this.ctx.get('typert')?.remotes.list() ?? []) {
            actions.push(`${descriptor.namespace}/${descriptor.method}`)
          }
          return actions
        },
        listedWorkspaces: () => (this.ctx.get('workspaceRegistry')?.list() ?? []).map(workspace => workspace.id),
      }))
    })
    this.ctx.effect(() => async () => {
      const handles = [...this.childHandles.values()]
      this.childHandles.clear()
      await Promise.all(handles.map(handle => handle.dispose()))
    }, 'collaboration.childHandles()')
  }

  /**
   * List Host occupants for this process. Clients use the Remote of the same name.
   * @returns identity humans, then Config occupants.
   */
  listActors(): readonly ResolvedActor[] {
    return [...this.identityHumans(), ...this.roster]
  }

  /**
   * Settings-connected models this human may `@`.
   * @param actorId - posting human.
   * @returns advertised models on allowed providers, skipping providers whose catalog fails.
   */
  async listMentionModels(actorId: ActorId): Promise<readonly ResolvedAiActor[]> {
    return await listCatalogMentions(this.ctx.llm, this.postingHuman(actorId))
  }

  /**
   * Append one room line. Human mentions admit those occupants; AI mentions start a branch.
   * @param session - exact live room Session.
   * @param request - author, text, and optional human or AI mentions.
   * The child Session is private to the posting human. The reply stays on
   * the branch until that human calls {@link publishFromChild}.
   * @returns started branch Session ids; empty when no AI was mentioned.
   */
  async postMessage(session: Session, request: PostMessageRequest): Promise<PostMessageResult> {
    this.assertPostText(request.text)
    const author = this.postingHuman(request.actorId)
    const resolved = await this.resolveMentions(author, request.mentions ?? [])
    const childSessionIds: SessionId[] = []
    const failedActorIds: ActorId[] = []
    await this.journal.transact(session.id, async () => {
      this.assertCanAccess(session, author)
      await this.admitHumans(session, [
        author,
        ...resolved.humans.filter(human => human.id !== author.id),
      ])
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/message',
        data: {
          version: 1,
          id: CollaborationMessageId(randomUUID()),
          actorId: author.id,
          kind: author.kind,
          name: author.name,
          text: request.text,
          mentions: [
            ...resolved.humans.map(human => human.id),
            ...resolved.ais.map(recipient => recipient.id),
          ],
        },
      })
      this.nameAsRoom(session)
      if (resolved.ais.length === 0) return
      const state = this.journal.state(session)
      const throughSeq = state.messages.at(-1)?.seq
      if (throughSeq === undefined) {
        throw new CollaborationError('room has no events to compile', 'COLLAB_EMPTY_ROOM')
      }
      // The room line is already durable at this point. A branch that fails
      // to start must not fail the whole post (a client retry would duplicate
      // the room line and re-invoke the branches that did start), so failed
      // recipients are reported and can be mentioned again in a new post.
      for (const recipient of resolved.ais) {
        try {
          childSessionIds.push(await this.startActor(session, author, recipient, throughSeq))
        } catch (startError) {
          void startError
          failedActorIds.push(recipient.id)
        }
      }
    })
    return { childSessionIds, failedActorIds }
  }

  /**
   * Refuse an empty post or one over the configured byte limit.
   * @param text - post body from a room or branch composer.
   */
  private assertPostText(text: string): void {
    if (Buffer.byteLength(text, 'utf8') > this.maxMessageBytes) {
      throw new CollaborationError('message exceeds maxMessageBytes', 'COLLAB_INVALID_ARGUMENT')
    }
    if (text.length === 0) {
      throw new CollaborationError('message text must be non-empty', 'COLLAB_INVALID_ARGUMENT')
    }
  }

  /**
   * Append one line inside a mention branch and wake the AI occupants it
   * mentions, so the branch owner can cross-check models without returning
   * to the room. Each mentioned model works in a sub-branch seeded from this
   * branch; its replies publish back to this branch like a branch reply
   * publishes to its room. Only the branch owner may invoke from a branch,
   * and human mentions stay a room-level gesture.
   * @param session - live branch Session started by a mention.
   * @param request - author, text, and AI mentions.
   * @returns started sub-branch Session ids; empty when no AI was mentioned.
   */
  async postBranchMessage(session: Session, request: PostMessageRequest): Promise<PostMessageResult> {
    this.assertPostText(request.text)
    const author = this.postingHuman(request.actorId)
    const mention = lastMentionSource(session)
    if (mention === undefined || session.header.parentSession === undefined) {
      throw new CollaborationError(
        `session "${session.id}" is not a collaboration branch`,
        'COLLAB_NOT_BRANCH',
      )
    }
    this.assertBranchOwner(session, mention.roomId, author)
    const resolved = await this.resolveMentions(author, request.mentions ?? [])
    if (resolved.humans.length > 0) {
      throw new CollaborationError(
        'human mentions are not available inside a branch; post to the room instead',
        'COLLAB_INVALID_ARGUMENT',
      )
    }
    const childSessionIds: SessionId[] = []
    const failedActorIds: ActorId[] = []
    await this.journal.transact(session.id, async () => {
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/message',
        data: {
          version: 1,
          id: CollaborationMessageId(randomUUID()),
          actorId: author.id,
          kind: author.kind,
          name: author.name,
          text: request.text,
          mentions: resolved.ais.map(recipient => recipient.id),
        },
      })
      if (resolved.ais.length === 0) return
      const state = this.journal.state(session)
      const throughSeq = state.messages.at(-1)?.seq
      if (throughSeq === undefined) {
        throw new CollaborationError('branch has no events to compile', 'COLLAB_EMPTY_ROOM')
      }
      // The branch line is durable at this point; a sub-branch that fails to
      // start is reported like a room mention failure, not a failed post.
      for (const recipient of resolved.ais) {
        try {
          childSessionIds.push(await this.startActor(session, author, recipient, throughSeq))
        } catch (startError) {
          void startError
          failedActorIds.push(recipient.id)
        }
      }
    })
    return { childSessionIds, failedActorIds }
  }

  /**
   * Refuse an invoke from anyone but the branch's recorded owner. A legacy
   * branch without a recorded owner admits any occupant of its parent.
   * @param session - live branch Session.
   * @param parentId - invoking parent Session recorded on the branch mention.
   * @param author - human invoking from the branch.
   */
  private assertBranchOwner(session: Session, parentId: SessionId, author: ResolvedHumanActor): void {
    const parent = this.occupancyOf(parentId)
    const owner = parent?.childOwners[session.id]
    if (owner !== undefined) {
      if (owner !== author.id) {
        throw new CollaborationError(
          `actor "${author.id}" does not own branch "${session.id}"`,
          'COLLAB_ACCESS_DENIED',
        )
      }
      return
    }
    if (parent !== undefined && parent.occupants.includes(author.id)) return
    throw new CollaborationError(
      `actor "${author.id}" does not own branch "${session.id}"`,
      'COLLAB_ACCESS_DENIED',
    )
  }

  /**
   * Record this human as the room's creator when the room has no occupants yet.
   * @param session - live room Session.
   * @param actorId - posting human.
   */
  async claimRoom(session: Session, actorId: ActorId): Promise<void> {
    const author = this.postingHuman(actorId)
    await this.journal.transact(session.id, async () => {
      this.assertCanAccess(session, author)
      await this.admitHumans(session, [author])
    })
    this.nameAsRoom(session)
  }

  /**
   * Give a freshly created root Session its owner's default title
   * (`{owner} 的会话`). Naming never overrides a standing title and never
   * fails Session creation.
   * @param session - newly created root Session.
   * @param ownerName - display name of the human the Session belongs to.
   */
  private nameNewSession(session: Session, ownerName: string): void {
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) return
    try {
      titles.initialize(session, sessionDefaultTitle(ownerName))
    } catch (_titleFailed) {
      // The Session already exists; a failed default title must not fail its creation.
    }
  }

  /**
   * Upgrade a root Session's standing default title to its room title
   * (`{creator} 的协作房间`) once the Session is used as a room. The creator
   * is the first recorded occupant. A title that is no longer a system
   * default (fallback, provider, or user) is left untouched, and a failed
   * title write never fails the committed room action.
   * @param session - live room Session.
   */
  private nameAsRoom(session: Session): void {
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) return
    try {
      const creatorId = this.journal.state(session).occupants[0]
      if (creatorId === undefined) return
      const creatorName = this.actorName(creatorId)
      if (creatorName === undefined) return
      titles.initialize(session, sessionDefaultTitle(creatorName))
      titles.replaceDefault(session, roomDefaultTitle(creatorName))
    } catch (_titleFailed) {
      // The room action already committed; a failed title must not refuse it.
    }
  }

  /**
   * Resolve the display name of the human who owns one branch of a room.
   * @param room - live room Session.
   * @param childId - branch Session identity recorded on the room.
   * @returns the branch owner's display name, or `undefined` when unresolvable.
   */
  private branchOwnerName(room: Session, childId: SessionId): string | undefined {
    try {
      const ownerId = this.journal.state(room).childOwners[childId]
      return ownerId === undefined ? undefined : this.actorName(ownerId)
    } catch (_projectionFailed) {
      // Naming degrades to ownerless text; a room read failure is not actionable here.
      return undefined
    }
  }

  /**
   * Resolve an actor's display name without failing on unknown actors.
   * @param actorId - actor identity.
   * @returns the actor's display name, or `undefined` when unresolvable.
   */
  private actorName(actorId: ActorId): string | undefined {
    try {
      return this.requireActor(actorId).name
    } catch (_unknownActor) {
      // Naming degrades to ownerless text; resolution failure is not actionable here.
      return undefined
    }
  }

  /**
   * Stamp the signed-in account as creator while `session/create` is still on
   * the stack. Forks and resumes stay unchanged. A leftover empty room is
   * still `claimRoom`able later.
   * @param session - newly announced Agent Session.
   * @param source - why this Agent lifecycle started.
   * @param peerId - creating Remote Peer, when `session/create` still holds the invocation.
   */
  private async claimCreatedRoot(session: Session, source: string, peerId?: string): Promise<void> {
    if (source !== 'startup') return
    if (session.header.parentSession !== undefined) return
    const identity = this.ctx.get('identity')
    if (identity === undefined) return
    const signed = peerId === undefined
      ? identity.currentAccount()
      : identity.accountForBrowserSession(peerId)
    if (signed === undefined) return
    let occupants: readonly string[] = []
    try {
      occupants = this.journal.state(session).occupants
    } catch (projectionError) {
      void projectionError
    }
    if (occupants.length > 0) return
    const occupancy = occupancyOf(signed)
    await this.journal.transact(session.id, async () => {
      await this.admitHumans(session, [{
        id: ActorId(signed.id),
        kind: 'human',
        name: signed.name,
        group: occupancy.group,
        providers: occupancy.providers,
        models: occupancy.models,
      }])
    })
    this.nameNewSession(session, signed.name)
  }

  /**
   * Describe the room branch this Session belongs to, when it is one.
   * @param session - candidate branch Session.
   * @returns the owning room and AI occupant from the latest mention source, or `undefined`.
   */
  branchOf(session: Session): { roomId: SessionId; actorId: ActorId } | undefined {
    const mention = lastMentionSource(session)
    if (mention === undefined) return undefined
    return { roomId: mention.roomId, actorId: mention.actorId }
  }

  /**
   * List the assistant replies a branch produced itself, excluding replies inherited from its ancestors.
   * @param session - branch Session.
   * @returns publishable reply message ids in log order.
   */
  branchReplyIds(session: Session): string[] {
    return ownAssistantReplies(session).map(reply => reply.id)
  }

  /**
   * Copy one assistant reply from the branch onto the room as that AI's room line.
   * The room Agent is cold-resumed when it is not live. Publishing the same
   * branch reply twice is refused instead of duplicating the room line.
   * @param child - live branch Session started by a mention.
   * @param actorId - human occupant publishing from the branch.
   * @param assistantSeq - branch assistant-message seq to publish; omitted publishes the latest reply.
   * @param assistantMessageId - optional branch assistant message id, for clients that address a reply by identity instead of seq.
   */
  async publishFromChild(
    child: Session,
    actorId: ActorId,
    assistantSeq?: SessionSeq,
    assistantMessageId?: string,
  ): Promise<void> {
    const publisher = this.postingHuman(actorId)
    const mention = lastMentionSource(child)
    if (mention === undefined) {
      throw new CollaborationError('session is not a collaboration branch', 'COLLAB_NOT_BRANCH')
    }
    const roomAgent = await this.liveOrResumeRoom(mention.roomId)
    const recipient = this.publishedActor(mention.actorId)
    const reply = assistantReply(child, assistantSeq, assistantMessageId)
    if (reply === undefined) {
      throw new CollaborationError(
        assistantSeq === undefined && assistantMessageId === undefined
          ? 'branch has no assistant text to publish'
          : `branch has no assistant reply at ${assistantSeq === undefined ? `message ${assistantMessageId}` : `seq ${assistantSeq}`}`,
        'COLLAB_INVALID_ARGUMENT',
      )
    }
    await this.journal.transact(mention.roomId, async () => {
      // The publish target is the invoking parent: a root room checks room
      // occupancy, while a parent branch checks branch ownership.
      if (roomAgent.session.header.parentSession === undefined) {
        this.assertCanAccess(roomAgent.session, publisher)
      } else {
        this.assertBranchOwner(child, mention.roomId, publisher)
      }
      const owner = this.journal.state(roomAgent.session).childOwners[child.id]
      if (owner !== undefined && owner !== publisher.id) {
        throw new CollaborationError(
          `actor "${publisher.id}" does not own branch "${child.id}"`,
          'COLLAB_ACCESS_DENIED',
        )
      }
      const already = this.journal.state(roomAgent.session).messages.some(message =>
        message.branchSessionId === child.id
        && message.assistantSeq === reply.seq)
      if (already) {
        throw new CollaborationError(
          'this branch reply is already published',
          'COLLAB_ALREADY_PUBLISHED',
        )
      }
      await this.journal.appendAndFlush(roomAgent.session, {
        type: 'collaboration/message',
        data: {
          version: 1,
          id: CollaborationMessageId(randomUUID()),
          actorId: recipient.id,
          kind: 'ai',
          name: recipient.name,
          text: reply.text,
          mentions: [],
          branchSessionId: child.id,
          assistantSeq: reply.seq,
        },
      })
    })
  }

  /**
   * Return the live room Agent, cold-resuming its persisted Session when needed.
   * @param roomId - room Session identity recorded on a branch mention.
   * @returns the live room Agent.
   */
  private async liveOrResumeRoom(roomId: SessionId): Promise<Agent> {
    const live = this.ctx.agents.get(roomId)
    if (live !== undefined) return live
    try {
      const handle = await this.ctx.agents.resume({ resumeSessionId: roomId })
      return handle.agent
    } catch (error) {
      throw new CollaborationError(
        `room "${roomId}" is not live and could not be resumed`,
        'COLLAB_CHILD_MISSING',
        { cause: error },
      )
    }
  }

  /**
   * Remove the calling human from this room. The creator may not leave
   * while other occupants remain; they remove the others first.
   * @param session - live room Session.
   * @param actorId - human leaving the room.
   */
  async leaveRoom(session: Session, actorId: ActorId): Promise<void> {
    const author = this.postingHuman(actorId)
    await this.journal.transact(session.id, async () => {
      const state = this.journal.state(session)
      if (!state.occupants.includes(author.id)) {
        throw new CollaborationError(
          `actor "${author.id}" is not an occupant of this room`,
          'COLLAB_ACCESS_DENIED',
        )
      }
      if (state.occupants[0] === author.id && state.occupants.length > 1) {
        throw new CollaborationError(
          'the room creator cannot leave while other occupants remain',
          'COLLAB_INVALID_ARGUMENT',
        )
      }
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/occupant-removed',
        data: { version: 1, actorId: author.id },
      })
      this.rememberOccupancy(session)
      this.refreshAccess()
    })
  }

  /**
   * Remove one occupant from this room. Only the room creator may remove others.
   * @param session - live room Session.
   * @param actorId - human performing the removal (the room creator).
   * @param targetId - occupant to remove.
   */
  async removeOccupant(session: Session, actorId: ActorId, targetId: ActorId): Promise<void> {
    const author = this.postingHuman(actorId)
    await this.journal.transact(session.id, async () => {
      const state = this.journal.state(session)
      if (state.occupants[0] !== author.id) {
        throw new CollaborationError(
          'only the room creator may remove occupants',
          'COLLAB_ACCESS_DENIED',
        )
      }
      if (targetId === author.id) {
        throw new CollaborationError(
          'the room creator cannot remove themselves; leave the room instead',
          'COLLAB_INVALID_ARGUMENT',
        )
      }
      if (!state.occupants.includes(targetId)) {
        throw new CollaborationError(
          `actor "${targetId}" is not an occupant of this room`,
          'COLLAB_INVALID_ARGUMENT',
        )
      }
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/occupant-removed',
        data: { version: 1, actorId: targetId },
      })
      this.rememberOccupancy(session)
      this.refreshAccess()
    })
  }

  /**
   * Admit uncompiled room lines, then followup this Agent with the composer draft.
   * @param agent - live room Agent.
   * @param text - non-empty composer draft.
   * @param actorId - human occupant sending from the room.
   */
  async sendWithRoom(agent: Agent, text: string, actorId: ActorId): Promise<void> {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      throw new CollaborationError('message text must be non-empty', 'COLLAB_INVALID_ARGUMENT')
    }
    await this.admitRoomContext(agent.session, actorId)
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'user' },
    }))
  }

  /**
   * Log the uncompiled room delta as a model-visible user message. Does not followup.
   * @param session - live room Session (not an AI child).
   * @param actorId - human occupant admitting the delta.
   */
  async admitRoomContext(session: Session, actorId: ActorId): Promise<void> {
    if (session.header.isSeeded) return
    const author = this.postingHuman(actorId)
    await this.journal.transact(session.id, async () => {
      this.assertCanAccess(session, author)
      await this.admitHumans(session, [author])
      const context = this.roomContextMessage(session)
      if (context === undefined) return
      session.append('user/message', context, { surfaceOp: 'append' })
      await this.ctx.sessions.flush(session)
    })
  }

  /**
   * Build the uncompiled room-transcript message for a root room Session, if any.
   * @param session - live room Session.
   * @returns the `collaboration-room-context` user message, or `undefined` when nothing is uncompiled.
   */
  private roomContextMessage(session: Session): ReturnType<typeof createUserMessage> | undefined {
    if (session.header.isSeeded) return undefined
    let state: ReturnType<CollaborationJournal['state']>
    try {
      state = this.journal.state(session)
    } catch (projectionError) {
      void projectionError
      return undefined
    }
    const throughSeq = state.messages.at(-1)?.seq
    if (throughSeq === undefined) return undefined
    const text = compileRoomContext(
      state.messages,
      throughSeq,
      lastRoomContextSeq(session),
      this.maxCompileBytes,
    )
    if (text === undefined) return undefined
    return createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        kind: 'collaboration-room-context',
        roomId: session.id,
        throughSeq,
      },
    })
  }

  /**
   * Resolve one Config occupant.
   * @param actorId - occupant identity.
   * @returns the resolved occupant.
   */
  private postingHuman(actorId: ActorId): ResolvedHumanActor {
    const identity = this.ctx.get('identity')
    if (identity !== undefined) {
      const signed = identity.currentAccount()
      if (signed === undefined) {
        throw new CollaborationError('sign in before posting', 'COLLAB_NOT_SIGNED_IN')
      }
      if (actorId !== ActorId(signed.id)) {
        throw new CollaborationError(
          `actor "${actorId}" is not the signed-in account`,
          'COLLAB_ACCESS_DENIED',
        )
      }
      const occupancy = occupancyOf(signed)
      return {
        id: ActorId(signed.id),
        kind: 'human',
        name: signed.name,
        group: occupancy.group,
        providers: occupancy.providers,
        models: occupancy.models,
      }
    }
    return this.requireHuman(actorId)
  }

  private identityHumans(): readonly ResolvedHumanActor[] {
    const identity = this.ctx.get('identity')
    if (identity === undefined) return []
    return identity.listAccounts().map((account) => {
      const occupancy = occupancyOf(account)
      return {
        id: ActorId(account.id),
        kind: 'human',
        name: account.name,
        group: occupancy.group,
        providers: occupancy.providers,
        models: occupancy.models,
      }
    })
  }

  private requireActor(actorId: ActorId): ResolvedActor {
    const fromIdentity = this.identityHumans().find(human => human.id === actorId)
    if (fromIdentity !== undefined) return fromIdentity
    const actor = this.actorsById.get(actorId)
    if (actor === undefined) {
      throw new CollaborationError(`unknown actor "${actorId}"`, 'COLLAB_UNKNOWN_ACTOR')
    }
    return actor
  }

  /**
   * Resolve one human occupant.
   * @param actorId - occupant identity.
   * @returns the resolved human occupant.
   */
  private requireHuman(actorId: ActorId): ResolvedHumanActor {
    const actor = this.requireActor(actorId)
    if (actor.kind !== 'human') {
      throw new CollaborationError(`actor "${actorId}" is not a human occupant`, 'COLLAB_NOT_HUMAN')
    }
    return actor
  }

  /**
   * Refuse when this room already has occupants and this human is not among them.
   * An empty occupant list is claimable by the first human.
   * @param session - live room Session.
   * @param human - candidate occupant.
   */
  private assertCanAccess(session: Session, human: ResolvedHumanActor): void {
    const occupants = this.journal.state(session).occupants
    // A Session with a parent (a mention branch, a subagent child, …) belongs
    // to another conversation and must never be claimed or posted to as a
    // room, even though its projection folds the inherited room occupants.
    if (session.header.parentSession !== undefined) {
      throw new CollaborationError(
        `session "${session.id}" is not a claimable room`,
        'COLLAB_ACCESS_DENIED',
      )
    }
    if (occupants.length === 0) return
    if (occupants.includes(human.id)) return
    throw new CollaborationError(
      `actor "${human.id}" is not an occupant of this room`,
      'COLLAB_ACCESS_DENIED',
    )
  }

  /**
   * Append occupant events for humans this room does not yet list.
   * @param session - live room Session.
   * @param humans - humans to admit, in invite order.
   */
  private async admitHumans(session: Session, humans: readonly ResolvedHumanActor[]): Promise<void> {
    const seen = new Set<string>(this.journal.state(session).occupants)
    let admitted = false
    for (const human of humans) {
      if (seen.has(human.id)) continue
      seen.add(human.id)
      admitted = true
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/occupant',
        data: { version: 1, actorId: human.id },
      })
    }
    if (admitted) {
      this.rememberOccupancy(session)
      this.refreshAccess()
    }
  }

  private occupancyOf(sessionId: SessionId): RoomOccupancy | undefined {
    const live = this.ctx.get('sessions')?.get(sessionId)
    if (live !== undefined) {
      try {
        const room = this.journal.state(live)
        this.rememberOccupancyState(sessionId, room, live.header)
        return this.occupancyCache.get(sessionId)
      } catch (projectionError) {
        void projectionError
      }
    }
    return this.occupancyCache.get(sessionId)
  }

  private rememberOccupancy(session: Session): void {
    try {
      this.rememberOccupancyState(session.id, this.journal.state(session), session.header)
    } catch (projectionError) {
      void projectionError
    }
  }

  private rememberOccupancyState(sessionId: SessionId, room: {
    readonly occupants: readonly string[]
    readonly children: Readonly<Record<string, string>>
    readonly childOwners: Readonly<Record<string, string>>
  }, header: { readonly parentSession?: SessionId; readonly isSeeded?: boolean }): void {
    this.occupancyCache.set(sessionId, {
      occupants: [...room.occupants],
      children: { ...room.children },
      childOwners: { ...room.childOwners },
      root: header.parentSession === undefined && header.isSeeded !== true,
    })
  }

  /**
   * Drop cached occupancy for Sessions that no longer exist in persistence
   * and are not live, so a deleted Session stops feeding policy bindings.
   * Runs at most once every 30 seconds and never blocks a binding read.
   */
  private scheduleOccupancyPrune(): void {
    const now = Date.now()
    if (this.occupancyPrune !== undefined || now - this.lastOccupancyPrune < 30_000) return
    this.lastOccupancyPrune = now
    const prune = (async () => {
      const listed = await this.ctx.sessionPersistence.list()
      const persisted = new Set<string>(listed.map(snapshot => snapshot.header.id))
      const live = new Set<string>((this.ctx.get('sessions')?.list() ?? []).map(session => session.id))
      let changed = false
      for (const id of [...this.occupancyCache.keys()]) {
        if (persisted.has(id) || live.has(id)) continue
        this.occupancyCache.delete(id)
        changed = true
      }
      if (changed) this.refreshAccess()
    })()
    this.occupancyPrune = prune.then(() => {
      this.occupancyPrune = undefined
    }, () => {
      this.occupancyPrune = undefined
    })
  }

  private async hydrateOccupancy(): Promise<void> {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return
    let listed: Awaited<ReturnType<typeof persistence.list>>
    try {
      listed = await persistence.list()
    } catch (listError) {
      void listError
      return
    }
    for (const snapshot of listed) {
      try {
        const handle = await persistence.open(snapshot.header.id, 'read')
        try {
          const { events } = await handle.read()
          let state = collaborationProjectionDefinition.init(snapshot.header, handle.inheritedEventCount)
          for (const event of events) {
            state = collaborationProjectionDefinition.apply(state, event)
          }
          if (state.failure !== undefined) continue
          this.rememberOccupancyState(snapshot.header.id, state, snapshot.header)
        } finally {
          await handle.close()
        }
      } catch (hydrateError) {
        void hydrateError
      }
    }
    this.refreshAccess()
  }

  private refreshAccess(): void {
    this.ctx.get('remoteAccess')?.invalidate()
  }

  /**
   * Deduplicate mention ids and resolve Config humans, Config AI occupants, or Settings routes.
   * @param author - posting human; catalog mentions require this human's allowlist.
   * @param mentions - structured mention ids from the poster.
   * @returns unique humans to invite and AI recipients to wake.
   */
  private async resolveMentions(
    author: ResolvedHumanActor,
    mentions: readonly ActorId[],
  ): Promise<{ humans: ResolvedHumanActor[]; ais: ResolvedAiActor[] }> {
    const humans: ResolvedHumanActor[] = []
    const ais: ResolvedAiActor[] = []
    const seen = new Set<string>()
    let catalog: readonly ResolvedAiActor[] | undefined
    for (const id of mentions) {
      if (seen.has(id)) continue
      seen.add(id)
      const fromIdentity = this.identityHumans().find(human => human.id === id)
      if (fromIdentity !== undefined) {
        humans.push(fromIdentity)
        continue
      }
      const configured = this.actorsById.get(id)
      if (configured !== undefined) {
        if (configured.kind === 'human') humans.push(configured)
        else ais.push(configured)
        continue
      }
      const route = parseMentionRoute(id)
      if (route === undefined || !humanMayUseProvider(author, route.provider)) {
        throw new CollaborationError(`unknown actor "${id}"`, 'COLLAB_UNKNOWN_ACTOR')
      }
      catalog ??= await listCatalogMentions(this.ctx.llm, author)
      const match = catalog.find(row => row.id === id)
      if (match === undefined) {
        throw new CollaborationError(`unknown actor "${id}"`, 'COLLAB_UNKNOWN_ACTOR')
      }
      ais.push(match)
    }
    return { humans, ais }
  }

  /**
   * Ensure the AI child exists, compile the per-actor delta, followup, and record the watermark.
   * @param session - live room Session.
   * @param author - human who mentioned the model; owns the resulting branch.
   * @param recipient - AI occupant.
   * @param throughSeq - inclusive seq of the triggering mention.
   * @returns the branch Session id.
   */
  private async startActor(
    session: Session,
    author: ResolvedHumanActor,
    recipient: ResolvedAiActor,
    throughSeq: SessionSeq,
  ): Promise<SessionId> {
    const child = await this.ensureChild(session, author, recipient, throughSeq)
    const state = this.journal.state(session)
    const lastThroughSeq = watermarkOf(state, author.id, recipient.id)
    const task = compileMentionTask(
      state.messages,
      recipient,
      throughSeq,
      lastThroughSeq,
      // Only the invoking Session's own turns compile: a branch child cannot
      // see inherited events through `deriveMessages()`, and the room prefix
      // already reached the branch when the branch itself was invoked.
      collectRoomConversation(
        session.snapshotEvents().filter(event => event.seq >= session.inheritedEventCount),
        throughSeq,
        lastThroughSeq,
      ),
      this.maxCompileBytes,
    )
    child.followup(createUserMessage({
      content: [{ type: 'text', text: task }],
      source: {
        kind: 'collaboration-mention',
        roomId: session.id,
        actorId: recipient.id,
        throughSeq,
      },
    }))
    await this.journal.appendAndFlush(session, {
      type: 'collaboration/actor-invoked',
      data: {
        version: 1,
        actorId: recipient.id,
        ownerId: author.id,
        childSessionId: child.id,
        throughSeq,
      },
    })
    return child.id
  }

  /**
   * Resolve the AI occupant recorded on a branch mention.
   * @param id - Config AI id or Settings route id.
   */
  private publishedActor(id: ActorId): ResolvedAiActor {
    const configured = this.actorsById.get(id)
    if (configured?.kind === 'ai') return configured
    const route = parseMentionRoute(id)
    if (route === undefined) {
      throw new CollaborationError(`unknown actor "${id}"`, 'COLLAB_UNKNOWN_ACTOR')
    }
    return {
      id,
      kind: 'ai',
      name: route.model,
      provider: route.provider,
      model: route.model,
    }
  }

  /**
   * Create the AI child on first invoke, resume it after a process restart, or
   * return the live Agent already bound to it. One room keeps one child per AI
   * occupant for that human; a different room or a different human always
   * mints a new child.
   * @param session - live room Session.
   * @param author - human who mentioned the model; owns the resulting branch.
   * @param recipient - AI occupant.
   * @param throughSeq - inclusive seq used as the first child's baseSeq.
   * @returns the live child Agent.
   */
  private async ensureChild(
    session: Session,
    author: ResolvedHumanActor,
    recipient: ResolvedAiActor,
    throughSeq: SessionSeq,
  ): Promise<Agent> {
    const state = this.journal.state(session)
    const existingId = childOf(state, author.id, recipient.id)
    if (existingId !== undefined) {
      return await this.liveOrResumeChild(session, existingId, recipient)
    }
    await this.ctx.sessions.flush(session)
    const events = await this.readRoomEvents(session.id)
    const boundary = events.at(-1)?.seq
    if (boundary === undefined) {
      throw new CollaborationError('room has no events to copy', 'COLLAB_EMPTY_ROOM')
    }
    const childId = brandString<SessionId>(`collab-${randomUUID()}`)
    const handle = await this.ctx.agents.create({
      sessionId: childId,
      seed: buildForkSeed(events, boundary),
      inheritedEventCount: SessionLogOffset(boundary + 1),
      meta: {
        ...session.header.cwd === undefined ? {} : { cwd: session.header.cwd },
        isSeeded: true,
        parentSession: session.id,
      },
      agentOptions: { provider: recipient.provider, model: recipient.model },
    })
    this.childHandles.set(childId, handle)
    await this.presentBranch(session, handle.agent.session, recipient, author.name)
    await this.journal.appendAndFlush(session, {
      type: 'collaboration/branch-opened',
      data: {
        version: 1,
        actorId: recipient.id,
        ownerId: author.id,
        childSessionId: childId,
        baseSeq: throughSeq,
      },
    })
    this.rememberOccupancy(session)
    this.refreshAccess()
    return handle.agent
  }

  /**
   * Return a live child Agent, or cold-resume the persisted Session after restart.
   * @param room - live room Session that owns this child id.
   * @param childId - projection child Session id.
   * @param recipient - AI occupant bound to that child.
   * @returns the live child Agent.
   */
  private async liveOrResumeChild(
    room: Session,
    childId: SessionId,
    recipient: ResolvedAiActor,
  ): Promise<Agent> {
    const ownerName = this.branchOwnerName(room, childId)
    const live = this.ctx.agents.get(childId)
    if (live !== undefined) {
      this.nameBranch(room, live.session, recipient, ownerName)
      await this.ctx.sessions.flush(live.session)
      return live
    }
    let handle: AgentHandle
    try {
      handle = await this.ctx.agents.resume({
        resumeSessionId: childId,
        agentOptions: { provider: recipient.provider, model: recipient.model },
      })
    } catch (error) {
      throw new CollaborationError(
        `AI child "${childId}" is not live`,
        'COLLAB_CHILD_MISSING',
        { cause: error },
      )
    }
    this.childHandles.set(childId, handle)
    await this.presentBranch(room, handle.agent.session, recipient, ownerName)
    return handle.agent
  }

  /**
   * Name the branch after its model and owner and attach it after the room in the same Workspace.
   * @param room - live room Session.
   * @param child - newly created branch Session.
   * @param recipient - AI occupant this branch belongs to.
   * @param ownerName - display name of the human who owns the branch, when known.
   */
  private async presentBranch(room: Session, child: Session, recipient: ResolvedAiActor, ownerName?: string): Promise<void> {
    this.nameBranch(room, child, recipient, ownerName)
    await this.ctx.sessions.flush(child)
    await this.attachBranch(room, child)
  }

  /**
   * Pin a `{model} 分叉 · {owner}` title unless the branch already has a distinct user title.
   * @param room - live room Session.
   * @param child - live branch Session.
   * @param recipient - AI occupant this branch belongs to.
   * @param ownerName - display name of the human who owns the branch, when known.
   */
  private nameBranch(room: Session, child: Session, recipient: ResolvedAiActor, ownerName?: string): void {
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) return
    const roomTitle = titles.get(room)?.title
    const wanted = branchTitle(recipient.name, ownerName)
    const current = titles.get(child)
    if (current?.title === wanted) return
    const copied = current === undefined || current.title === roomTitle
    const generated = current?.source?.kind !== undefined && current.source.kind !== 'user'
    if (!copied && !generated) return
    try {
      titles.rename(child, wanted)
    } catch (_renameFailed) {
      // The mention already started; a missing or invalid title must not refuse the room post.
    }
  }

  /**
   * Put the branch on the room's Workspace, immediately after the room row.
   * @param room - live room Session.
   * @param child - live branch Session.
   */
  private async attachBranch(room: Session, child: Session): Promise<void> {
    const listed = this.ctx.get('workspaceRegistry')?.list()
      .find(item => item.sessionIds.includes(room.id) || item.sessionIds.includes(child.id))
    if (listed === undefined) return
    try {
      await listed.attachSession(child.id)
    } catch (_attachFailed) {
      // The branch Agent is live; a Workspace attach miss must not refuse the room post.
      return
    }
    const ids = listed.sessionIds.includes(child.id)
      ? listed.sessionIds
      : [child.id, ...listed.sessionIds]
    const without = ids.filter(id => id !== child.id)
    const roomAt = without.indexOf(room.id)
    if (roomAt < 0) return
    const anchor = without[roomAt + 1]
    try {
      await listed.insertSessionBefore(child.id, anchor)
    } catch (_orderFailed) {
      // Membership is enough for the sidebar; order is best-effort.
    }
  }

  /**
   * Read the stored room prefix used as the child seed.
   * @param roomId - room Session identity.
   * @returns contiguous stored events.
   */
  private async readRoomEvents(roomId: SessionId): Promise<readonly SessionEvent[]> {
    const handle = await this.ctx.sessionPersistence.open(roomId, 'read')
    try {
      return (await handle.read()).events
    } finally {
      await handle.close()
    }
  }

}

/**
 * Latest room-Agent compile watermark from this Session's own injected context.
 * @param session - room Session.
 * @returns the latest injected `throughSeq`, or `undefined` before the first admit.
 */
function lastRoomContextSeq(session: Session): SessionSeq | undefined {
  let last: SessionSeq | undefined
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'user/message') continue
    const source = event.data.source
    if (source.kind !== 'collaboration-room-context') continue
    last = source.throughSeq
  }
  return last
}

/**
 * Latest collaboration-mention source on a branch Session.
 * @param session - candidate branch Session.
 */
function lastMentionSource(session: Session): {
  readonly roomId: SessionId
  readonly actorId: ActorId
  readonly throughSeq: SessionSeq
} | undefined {
  let last: { roomId: SessionId; actorId: ActorId; throughSeq: SessionSeq } | undefined
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'user/message') continue
    const source = event.data.source
    if (source.kind !== 'collaboration-mention') continue
    last = { roomId: source.roomId, actorId: source.actorId, throughSeq: source.throughSeq }
  }
  return last
}

/**
 * Collect the assistant replies a Session produced on its own (non-inherited) log events.
 * @param session - branch Session.
 * @returns each reply's message id, seq, and joined text blocks, in log order.
 */
function ownAssistantReplies(session: Session): { id: string; seq: SessionSeq; text: string }[] {
  const replies: { id: string; seq: SessionSeq; text: string }[] = []
  for (const event of session.snapshotEvents()) {
    if (event.type !== 'assistant/message') continue
    if (event.seq < session.inheritedEventCount) continue
    const text = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (text.length === 0) continue
    replies.push({ id: event.data.message.id, seq: event.seq, text })
  }
  return replies
}

/**
 * Find one assistant reply on the branch's own (non-inherited) log events.
 * @param session - branch Session.
 * @param assistantSeq - exact assistant-message seq, or `undefined`.
 * @param assistantMessageId - exact assistant message id, or `undefined`.
 * @returns the reply seq and its joined text blocks, or `undefined` when there is no such reply.
 */
function assistantReply(
  session: Session,
  assistantSeq: SessionSeq | undefined,
  assistantMessageId: string | undefined,
): { seq: SessionSeq; text: string } | undefined {
  const replies = ownAssistantReplies(session)
  if (assistantSeq !== undefined) return replies.find(reply => reply.seq === assistantSeq)
  if (assistantMessageId !== undefined) return replies.find(reply => reply.id === assistantMessageId)
  return replies.at(-1)
}

export default CollaborationService
