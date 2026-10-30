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
 * @param roomTitle - latest room title, when the room has one.
 * @param modelName - display name of the mentioned model.
 * @returns `{model} · {room}` when the room is titled, otherwise the model name.
 */
export function branchTitle(roomTitle: string | undefined, modelName: string): string {
  const room = roomTitle?.trim() ?? ''
  return room.length === 0 ? modelName : `${modelName} · ${room}`
}
export { CollaborationError } from './error.ts'
export {
  collectRoomConversation,
  compileMentionTask,
  compileRoomContext,
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
}

const DEFAULT_MAX_MESSAGE_BYTES = 65_536

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
 * @param actors - raw Config occupants.
 * @returns unique resolved occupants.
 */
function resolveRoster(actors: readonly ActorConfig[]): readonly ResolvedActor[] {
  if (actors.length === 0) {
    throw new CollaborationError('actors must list at least one occupant', 'COLLAB_INVALID_CONFIG')
  }
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
      provider: z.string().default(''),
      model: z.string().default(''),
    })).default([...defaultActors]),
    maxMessageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_BYTES),
  })

  private readonly roster: readonly ResolvedActor[]
  private readonly actorsById: ReadonlyMap<string, ResolvedActor>
  private readonly maxMessageBytes: number
  private journal!: CollaborationJournal
  private readonly childHandles = new Map<string, AgentHandle>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'collaboration')
    this.roster = resolveRoster(config.actors ?? defaultActors)
    this.actorsById = new Map(this.roster.map(actor => [actor.id, actor]))
    this.maxMessageBytes = positiveLimit(
      'maxMessageBytes',
      config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    )
  }

  protected async [Service.init](): Promise<void> {
    const handle = await this.ctx.sessionProjections.register(collaborationProjectionDefinition)
    this.journal = new CollaborationJournal(this.ctx, handle)
    this.ctx.effect(() => () => {
      for (const child of this.childHandles.values()) void child.dispose()
      this.childHandles.clear()
    }, 'collaboration.childHandles()')
  }

  /**
   * List Host occupants for this process. Clients use the Remote of the same name.
   * @returns humans and optional Config AI occupants in Config order.
   */
  listActors(): readonly ResolvedActor[] {
    return this.roster
  }

  /**
   * Settings-connected models this human may `@`.
   * @param actorId - posting human.
   * @returns advertised models on allowed providers, skipping providers whose catalog fails.
   */
  async listMentionModels(actorId: ActorId): Promise<readonly ResolvedAiActor[]> {
    return await listCatalogMentions(this.ctx.llm, this.requireHuman(actorId))
  }

  /**
   * Append one room line. Human mentions admit those occupants; AI mentions start a branch.
   * @param session - exact live room Session.
   * @param request - author, text, and optional human or AI mentions.
   * @returns started branch Session ids; empty when no AI was mentioned.
   */
  async postMessage(session: Session, request: PostMessageRequest): Promise<PostMessageResult> {
    const textBytes = Buffer.byteLength(request.text, 'utf8')
    if (textBytes > this.maxMessageBytes) {
      throw new CollaborationError('message exceeds maxMessageBytes', 'COLLAB_INVALID_ARGUMENT')
    }
    if (request.text.length === 0) {
      throw new CollaborationError('message text must be non-empty', 'COLLAB_INVALID_ARGUMENT')
    }
    const author = this.requireHuman(request.actorId)
    const resolved = await this.resolveMentions(author, request.mentions ?? [])
    const childSessionIds: SessionId[] = []
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
      if (resolved.ais.length === 0) return
      const state = this.journal.state(session)
      const throughSeq = state.messages.at(-1)?.seq
      if (throughSeq === undefined) {
        throw new CollaborationError('room has no events to compile', 'COLLAB_EMPTY_ROOM')
      }
      for (const recipient of resolved.ais) {
        childSessionIds.push(await this.startActor(session, recipient, throughSeq))
      }
    })
    return { childSessionIds }
  }

  /**
   * Record this human as the room's creator when the room has no occupants yet.
   * @param session - live room Session.
   * @param actorId - posting human.
   */
  async claimRoom(session: Session, actorId: ActorId): Promise<void> {
    const author = this.requireHuman(actorId)
    await this.journal.transact(session.id, async () => {
      this.assertCanAccess(session, author)
      await this.admitHumans(session, [author])
    })
  }

  /**
   * Copy the branch's latest assistant text onto the room as that AI's room line.
   * @param child - live branch Session started by a mention.
   * @param actorId - human occupant publishing from the branch.
   */
  async publishFromChild(child: Session, actorId: ActorId): Promise<void> {
    const publisher = this.requireHuman(actorId)
    const mention = lastMentionSource(child)
    if (mention === undefined) {
      throw new CollaborationError('session is not a collaboration branch', 'COLLAB_NOT_BRANCH')
    }
    const roomAgent = this.ctx.agents.get(mention.roomId)
    if (roomAgent === undefined) {
      throw new CollaborationError(`room "${mention.roomId}" is not live`, 'COLLAB_CHILD_MISSING')
    }
    this.assertCanAccess(roomAgent.session, publisher)
    const recipient = this.publishedActor(mention.actorId)
    const reply = assistantText(child)
    if (reply.length === 0) {
      throw new CollaborationError('branch has no assistant text to publish', 'COLLAB_INVALID_ARGUMENT')
    }
    await this.journal.transact(mention.roomId, async () => {
      await this.journal.appendAndFlush(roomAgent.session, {
        type: 'collaboration/message',
        data: {
          version: 1,
          id: CollaborationMessageId(randomUUID()),
          actorId: recipient.id,
          kind: 'ai',
          name: recipient.name,
          text: reply,
          mentions: [],
        },
      })
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
    const author = this.requireHuman(actorId)
    await this.journal.transact(session.id, async () => {
      this.assertCanAccess(session, author)
      await this.admitHumans(session, [author])
      const state = this.journal.state(session)
      const throughSeq = state.messages.at(-1)?.seq
      if (throughSeq === undefined) return
      const text = compileRoomContext(
        state.messages,
        throughSeq,
        lastRoomContextSeq(session),
      )
      if (text === undefined) return
      session.append('user/message', createUserMessage({
        content: [{ type: 'text', text }],
        source: {
          kind: 'collaboration-room-context',
          roomId: session.id,
          throughSeq,
        },
      }), { surfaceOp: 'append' })
      await this.ctx.sessions.flush(session)
    })
  }

  /**
   * Resolve one Config occupant.
   * @param actorId - occupant identity.
   * @returns the resolved occupant.
   */
  private requireActor(actorId: ActorId): ResolvedActor {
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
    if (occupants.length === 0 || occupants.includes(human.id)) return
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
    for (const human of humans) {
      if (seen.has(human.id)) continue
      seen.add(human.id)
      await this.journal.appendAndFlush(session, {
        type: 'collaboration/occupant',
        data: { version: 1, actorId: human.id },
      })
    }
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
    for (const id of mentions) {
      if (seen.has(id)) continue
      seen.add(id)
      const resolved = await this.resolveMention(author, id)
      if (resolved.kind === 'human') humans.push(resolved)
      else ais.push(resolved)
    }
    return { humans, ais }
  }

  /**
   * Resolve one mention as a Config human, Config AI occupant, or a Settings route this human may use.
   * @param author - posting human.
   * @param id - Config occupant id, or `{provider}/{model}`.
   * @returns the resolved human or AI recipient.
   */
  private async resolveMention(
    author: ResolvedHumanActor,
    id: ActorId,
  ): Promise<ResolvedHumanActor | ResolvedAiActor> {
    const configured = this.actorsById.get(id)
    if (configured !== undefined) return configured
    const route = parseMentionRoute(id)
    if (route === undefined || !humanMayUseProvider(author, route.provider)) {
      throw new CollaborationError(`unknown actor "${id}"`, 'COLLAB_UNKNOWN_ACTOR')
    }
    const match = (await listCatalogMentions(this.ctx.llm, author)).find(row => row.id === id)
    if (match === undefined) {
      throw new CollaborationError(`unknown actor "${id}"`, 'COLLAB_UNKNOWN_ACTOR')
    }
    return match
  }

  /**
   * Ensure the AI child exists, compile the per-actor delta, followup, and record the watermark.
   * @param session - live room Session.
   * @param recipient - AI occupant.
   * @param throughSeq - inclusive seq of the triggering mention.
   * @returns the branch Session id.
   */
  private async startActor(
    session: Session,
    recipient: ResolvedAiActor,
    throughSeq: SessionSeq,
  ): Promise<SessionId> {
    const child = await this.ensureChild(session, recipient, throughSeq)
    const state = this.journal.state(session)
    const lastThroughSeq = watermarkOf(state, recipient.id)
    const task = compileMentionTask(
      state.messages,
      recipient,
      throughSeq,
      lastThroughSeq,
      collectRoomConversation(session.snapshotEvents(), throughSeq, lastThroughSeq),
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
   * Create the AI child on first invoke, or return the live Agent already bound to it.
   * @param session - live room Session.
   * @param recipient - AI occupant.
   * @param throughSeq - inclusive seq used as the first child's baseSeq.
   * @returns the live child Agent.
   */
  private async ensureChild(
    session: Session,
    recipient: ResolvedAiActor,
    throughSeq: SessionSeq,
  ): Promise<Agent> {
    const state = this.journal.state(session)
    const existingId = childOf(state, recipient.id)
    if (existingId !== undefined) {
      const live = this.ctx.agents.get(existingId)
      if (live === undefined) {
        throw new CollaborationError(
          `AI child "${existingId}" is not live`,
          'COLLAB_CHILD_MISSING',
        )
      }
      this.nameBranch(session, live.session, recipient)
      await this.ctx.sessions.flush(live.session)
      return live
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
      },
      agentOptions: { provider: recipient.provider, model: recipient.model },
    })
    this.childHandles.set(childId, handle)
    await this.presentBranch(session, handle.agent.session, recipient)
    await this.journal.appendAndFlush(session, {
      type: 'collaboration/branch-opened',
      data: {
        version: 1,
        actorId: recipient.id,
        childSessionId: childId,
        baseSeq: throughSeq,
      },
    })
    return handle.agent
  }

  /**
   * Name the branch after the model and attach it beside the room in the same Workspace.
   * @param room - live room Session.
   * @param child - newly created branch Session.
   * @param recipient - AI occupant this branch belongs to.
   */
  private async presentBranch(room: Session, child: Session, recipient: ResolvedAiActor): Promise<void> {
    this.nameBranch(room, child, recipient)
    await this.ctx.sessions.flush(child)
    await this.attachBranch(room, child)
  }

  /**
   * Pin a model-named title unless the branch already has a distinct user title.
   * @param room - live room Session.
   * @param child - live branch Session.
   * @param recipient - AI occupant this branch belongs to.
   */
  private nameBranch(room: Session, child: Session, recipient: ResolvedAiActor): void {
    const titles = this.ctx.get('sessionTitle')
    if (titles === undefined) return
    const roomTitle = titles.get(room)?.title
    const wanted = branchTitle(roomTitle, recipient.name)
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
   * Put the branch on the room's Workspace, immediately before the room row.
   * @param room - live room Session.
   * @param child - live branch Session.
   */
  private async attachBranch(room: Session, child: Session): Promise<void> {
    const workspace = this.ctx.get('workspaceRegistry')?.list()
      .find(item => item.sessionIds.includes(room.id))
    if (workspace === undefined) return
    try {
      await workspace.attachSession(child.id)
    } catch (_attachFailed) {
      // The branch Agent is live; a Workspace attach miss must not refuse the room post.
      return
    }
    try {
      await workspace.insertSessionBefore(child.id, room.id)
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
 * Join assistant text blocks from the branch's derived history.
 * @param session - branch Session.
 * @returns concatenated assistant text, or `''` when none exists.
 */
function assistantText(session: Session): string {
  const messages = session.deriveMessages()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    return message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
  }
  return ''
}

export default CollaborationService
