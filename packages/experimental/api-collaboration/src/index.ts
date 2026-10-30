/** Authenticated Client access to collaboration-room posts. */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ActorId, CollaborationError } from '@deepseek-ai/dsh-experimental-collaboration'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { CollaborationActorRow, CollaborationPostRequest, CollaborationPostResult } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Authenticated room posts and occupant roster. */
    collaborationController: CollaborationController
  }
}

/**
 * Map a domain failure onto the collaboration Remote code table.
 * @param error - thrown collaboration-room failure.
 * @param actorId - posted author or mention id when the failure names one.
 * @returns a wire `RemoteError`.
 */
function toRemoteError(error: CollaborationError, actorId: string): RemoteError {
  switch (error.code) {
    case 'COLLAB_UNKNOWN_ACTOR':
      return new RemoteError('collaboration/unknown-actor', error.message, { actorId }, { cause: error })
    case 'COLLAB_NOT_AI':
      return new RemoteError('collaboration/not-ai', error.message, { actorId }, { cause: error })
    case 'COLLAB_NOT_HUMAN':
      return new RemoteError('collaboration/invalid-argument', error.message, { reason: error.message }, { cause: error })
    case 'COLLAB_ACCESS_DENIED':
      return new RemoteError('collaboration/forbidden', error.message, { actorId }, { cause: error })
    case 'COLLAB_INVALID_ARGUMENT':
      return new RemoteError('collaboration/invalid-argument', error.message, { reason: error.message }, { cause: error })
    case 'COLLAB_NOT_BRANCH':
      return new RemoteError('collaboration/invalid-argument', error.message, { reason: error.message }, { cause: error })
    default:
      return new RemoteError('collaboration/failed', error.message, { reason: error.message }, { cause: error })
  }
}

/** Room posts never followup the room Agent; mentioned AI children belong to `ctx.collaboration`. */
export default class CollaborationController extends TypertRemoteService {
  static inject = ['collaboration', 'typert']

  constructor(ctx: Context) {
    super(ctx, 'collaborationController', { namespace: 'collaboration' })
  }

  /**
   * List Host Config occupants for the room-post select.
   * @returns humans and optional Config AI occupants in Config order.
   */
  @Remote
  listActors(): CollaborationActorRow[] {
    return this.ctx.collaboration.listActors().map(actor => ({
      id: actor.id,
      kind: actor.kind,
      name: actor.name,
    }))
  }

  /**
   * List Settings-connected models this human may `@`.
   * @param actorId - posting human.
   * @param signal - Client cancellation.
   * @returns advertised models on that human's allowed providers.
   */
  @Remote
  async listMentionModels(actorId: string, signal: AbortSignal): Promise<CollaborationActorRow[]> {
    signal.throwIfAborted()
    try {
      const rows = await this.ctx.collaboration.listMentionModels(ActorId(actorId))
      signal.throwIfAborted()
      return rows.map(actor => ({
        id: actor.id,
        kind: actor.kind,
        name: actor.name,
      }))
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, actorId)
      throw error
    }
  }

  /**
   * Append one room line on the Agent's Session. Structured AI mentions start branch turns.
   * @param agent - live room Agent whose Session is the shared log.
   * @param request - author id, text, and optional AI mention ids.
   * @param signal - Client cancellation.
   * @returns started branch Session ids after the room line is flushed.
   */
  @Remote
  async postMessage(
    agent: Agent,
    request: CollaborationPostRequest,
    signal: AbortSignal,
  ): Promise<CollaborationPostResult> {
    signal.throwIfAborted()
    try {
      const posted = await this.ctx.collaboration.postMessage(agent.session, {
        actorId: ActorId(request.actorId),
        text: request.text,
        ...request.mentions === undefined ? {} : { mentions: request.mentions.map(id => ActorId(id)) },
      })
      return { childSessionIds: posted.childSessionIds.map(id => String(id)) }
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, request.actorId)
      throw error
    }
  }

  /**
   * Copy this branch's latest assistant text onto its room as that AI's room line.
   * @param agent - live branch Agent started by a mention.
   * @param actorId - human occupant publishing from the branch.
   * @param signal - Client cancellation.
   */
  @Remote
  async publish(agent: Agent, actorId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    try {
      await this.ctx.collaboration.publishFromChild(agent.session, ActorId(actorId))
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, actorId)
      throw error
    }
  }

  /**
   * Record this human as creator when the room has no occupants yet.
   * @param agent - live room Agent.
   * @param actorId - claiming human.
   * @param signal - Client cancellation.
   */
  @Remote
  async claimRoom(agent: Agent, actorId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    try {
      await this.ctx.collaboration.claimRoom(agent.session, ActorId(actorId))
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, actorId)
      throw error
    }
  }

  /**
   * Admit uncompiled room lines, then followup this Agent with the composer draft.
   * @param agent - live room Agent whose Session is the shared log.
   * @param text - non-empty composer draft.
   * @param actorId - human occupant sending from the room.
   * @param signal - Client cancellation.
   * @returns after the room Agent has accepted the followup.
   */
  @Remote
  async sendWithRoom(agent: Agent, text: string, actorId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    try {
      await this.ctx.collaboration.sendWithRoom(agent, text, ActorId(actorId))
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, actorId)
      throw error
    }
  }

  /**
   * Log uncompiled room lines onto this Agent's Session. Does not followup.
   * @param agent - live room Agent whose Session is the shared log.
   * @param actorId - human occupant admitting the delta.
   * @param signal - Client cancellation.
   * @returns after the context message is flushed, or immediately when the delta is empty.
   */
  @Remote
  async admitRoomContext(agent: Agent, actorId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    try {
      await this.ctx.collaboration.admitRoomContext(agent.session, ActorId(actorId))
    } catch (error: unknown) {
      signal.throwIfAborted()
      if (error instanceof CollaborationError) throw toRemoteError(error, actorId)
      throw error
    }
  }
}
