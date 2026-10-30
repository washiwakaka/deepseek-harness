import type { ActorKind } from '@deepseek-ai/dsh-experimental-collaboration/client'

/** Chat-column side for one room line relative to the selected test human. */
export type RoomMessageSide = 'self' | 'other' | 'ai'

/**
 * Place a room line: the selected human on the right, everyone else on the left.
 * @param kind - occupant kind on the durable room event.
 * @param actorId - occupant id on that event.
 * @param selectedHumanId - test author currently posting, or none.
 */
export function roomMessageSide(
  kind: ActorKind,
  actorId: string,
  selectedHumanId: string | undefined,
): RoomMessageSide {
  if (kind === 'ai') return 'ai'
  return selectedHumanId !== undefined && actorId === selectedHumanId ? 'self' : 'other'
}
