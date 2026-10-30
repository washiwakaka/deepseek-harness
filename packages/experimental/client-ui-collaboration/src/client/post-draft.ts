/** Post the composer draft through the collaboration Remote as a chosen human occupant. */

import type {
  CollaborationActorRow,
  CollaborationPostRequest,
} from '@deepseek-ai/dsh-experimental-api-collaboration/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'

/** Client collaboration namespace used to list occupants and append a room line. */
export interface CollaborationRemote {
  listActors(): Promise<{ ok: true; value: readonly CollaborationActorRow[] } | { ok: false; error: Error }>
  listMentionModels(
    actorId: string,
  ): Promise<{ ok: true; value: readonly CollaborationActorRow[] } | { ok: false; error: Error }>
  postMessage(
    sessionId: SessionId,
    request: CollaborationPostRequest,
  ): Promise<{ ok: true; value?: { childSessionIds?: readonly string[] } } | { ok: false; error: Error }>
  publish(
    sessionId: SessionId,
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; error: Error }>
  admitRoomContext(
    sessionId: SessionId,
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; error: Error }>
  sendWithRoom(
    sessionId: SessionId,
    text: string,
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; error: Error }>
  claimRoom(
    sessionId: SessionId,
    actorId: string,
  ): Promise<{ ok: true } | { ok: false; error: Error }>
}

/**
 * Config id of the first human occupant.
 * @param actors - roster from `listActors`, in Config order.
 * @returns the first human id, or `undefined` when the roster has none.
 */
export function firstHumanId(actors: readonly CollaborationActorRow[]): string | undefined {
  return actors.find(actor => actor.kind === 'human')?.id
}

/**
 * Append one unmentioned room line as a human occupant.
 * @param remote - mounted `collaboration` namespace.
 * @param sessionId - room Session whose Agent the Remote resolves.
 * @param text - non-empty room body.
 * @param actorId - test author; omitted uses the first human from `listActors`.
 * @param mentions - optional AI occupant ids to wake; omitted posts without a child turn.
 * @returns started branch Session ids; empty when no AI was mentioned.
 * @throws the Remote failure, or `collaboration/invalid-argument` when no human occupant exists.
 */
export async function postRoomDraft(
  remote: CollaborationRemote,
  sessionId: SessionId,
  text: string,
  actorId?: string,
  mentions?: readonly string[],
): Promise<readonly string[]> {
  let authorId = actorId
  if (authorId === undefined) {
    const actors = await remote.listActors()
    if (!actors.ok) throw actors.error
    authorId = firstHumanId(actors.value)
  }
  if (authorId === undefined) {
    throw new RemoteError('collaboration/invalid-argument', 'no human occupant', { reason: 'no human occupant' })
  }
  const posted = await remote.postMessage(sessionId, {
    actorId: authorId,
    text,
    ...mentions !== undefined && mentions.length > 0 ? { mentions } : {},
  })
  if (!posted.ok) throw posted.error
  return posted.value?.childSessionIds ?? []
}

/**
 * Copy the current branch's latest assistant text onto its room.
 * @param remote - mounted `collaboration` namespace.
 * @param sessionId - branch Session.
 * @param actorId - human occupant publishing from the branch.
 * @throws the Remote failure.
 */
export async function publishFromChild(
  remote: CollaborationRemote,
  sessionId: SessionId,
  actorId: string,
): Promise<void> {
  const published = await remote.publish(sessionId, actorId)
  if (!published.ok) throw published.error
}

/**
 * Log the uncompiled room delta onto the current Session. Does not followup.
 * @param remote - mounted `collaboration` namespace.
 * @param sessionId - room Session whose Agent the Remote resolves.
 * @param actorId - human occupant admitting the delta.
 * @returns after the Host flushes the context message, or immediately when the delta is empty.
 * @throws the Remote failure.
 */
export async function admitRoomContext(
  remote: CollaborationRemote,
  sessionId: SessionId,
  actorId: string,
): Promise<void> {
  const admitted = await remote.admitRoomContext(sessionId, actorId)
  if (!admitted.ok) throw admitted.error
}

/**
 * Admit uncompiled room lines and followup the room Agent with the composer draft.
 * @param remote - mounted `collaboration` namespace.
 * @param sessionId - room Session whose Agent the Remote resolves.
 * @param text - non-empty composer draft.
 * @param actorId - human occupant sending from the room.
 * @returns after the Host accepts the followup.
 * @throws the Remote failure.
 */
export async function sendWithRoom(
  remote: CollaborationRemote,
  sessionId: SessionId,
  text: string,
  actorId: string,
): Promise<void> {
  const sent = await remote.sendWithRoom(sessionId, text, actorId)
  if (!sent.ok) throw sent.error
}

/**
 * Record this human as creator when the room has no occupants yet.
 * @param remote - mounted `collaboration` namespace.
 * @param sessionId - room Session.
 * @param actorId - claiming human.
 * @throws the Remote failure.
 */
export async function claimRoom(
  remote: CollaborationRemote,
  sessionId: SessionId,
  actorId: string,
): Promise<void> {
  const claimed = await remote.claimRoom(sessionId, actorId)
  if (!claimed.ok) throw claimed.error
}

/**
 * Whether `postRoomDraft` rejected because the Config roster has no human occupant.
 * @param error - rejection from `postRoomDraft`.
 */
export function isNoHumanPostError(error: unknown): boolean {
  const remote = remoteErrorOf(error)
  return remote !== undefined
    && remote.code === 'collaboration/invalid-argument'
    && remote.details.reason === 'no human occupant'
}
