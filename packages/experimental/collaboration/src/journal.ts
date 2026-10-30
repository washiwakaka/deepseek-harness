/** Serialized collaboration transactions over one live room Session log. */

import type { Context } from '@deepseek-ai/cordis'
import type { ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type { Session, SessionEventMap, SessionId } from '@deepseek-ai/dsh-session'
import type {} from './types.ts'
import { CollaborationError } from './error.ts'
import type { CollaborationProjectionState } from './projection.ts'

/** Owns per-room transaction order and committed collaboration event publication. */
export class CollaborationJournal {
  private readonly tails = new Map<SessionId, Promise<void>>()

  /**
   * @param ctx - collaboration service context with the injected Session service.
   * @param projectionHandle - room state registration owned by the collaboration service.
   */
  constructor(
    private readonly ctx: Context,
    private readonly projectionHandle: ProjectionHandle<CollaborationProjectionState>,
  ) {}

  /**
   * Read authoritative room state for one live Session.
   * @param session - exact live room Session.
   * @returns current projected state.
   * @throws when the durable collaboration projection has failed.
   */
  state(session: Session): CollaborationProjectionState {
    const projection = this.projectionHandle.stateOf(session)
    if (projection.failure !== undefined) {
      throw new CollaborationError(projection.failure, 'COLLAB_PROJECTION_FAILED')
    }
    return projection
  }

  /**
   * Serialize one room's asynchronous mutation operation.
   * @param roomId - Session identity selecting the transaction queue.
   * @param operation - complete read-check-append operation.
   * @returns the operation result.
   */
  async transact<T>(roomId: SessionId, operation: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(roomId) ?? Promise.resolve()
    const run = prior.then(operation, operation)
    const tail = run.then(() => undefined, () => undefined)
    this.tails.set(roomId, tail)
    try {
      return await run
    } finally {
      if (this.tails.get(roomId) === tail) this.tails.delete(roomId)
    }
  }

  /**
   * Append and checkpoint one room-owned collaboration event.
   * @param session - exact live room Session.
   * @param event - discriminant and payload for one collaboration event.
   */
  async appendAndFlush(
    session: Session,
    event:
      | { type: 'collaboration/message'; data: SessionEventMap['collaboration/message'] }
      | { type: 'collaboration/branch-opened'; data: SessionEventMap['collaboration/branch-opened'] }
      | { type: 'collaboration/actor-invoked'; data: SessionEventMap['collaboration/actor-invoked'] }
      | { type: 'collaboration/occupant'; data: SessionEventMap['collaboration/occupant'] },
  ): Promise<void> {
    session.append(event.type, event.data)
    await this.ctx.sessions.flush(session)
  }
}
