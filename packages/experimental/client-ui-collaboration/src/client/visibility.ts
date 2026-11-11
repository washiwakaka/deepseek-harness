/** Whether the current human owns a collaboration branch Session. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

interface CollaborationListView {
  readonly occupants?: readonly string[]
  readonly children?: Readonly<Record<string, string>>
  readonly childOwners?: Readonly<Record<string, string>>
}

/**
 * Whether this Session is an AI branch this human may publish from.
 * @param humanId - current test author.
 * @param list - Host session catalog, including collaboration projections.
 * @param sessionId - candidate branch Session.
 * @returns true when the catalog names `humanId` as this branch's owner.
 */
export function isOwnedBranch(
  humanId: string | undefined,
  list: SessionListState,
  sessionId: SessionId | string,
): boolean {
  if (humanId === undefined) return false
  const ids = new Set<string>([...list.ids, ...Object.keys(list.projectionsBySession)])
  for (const id of ids) {
    const room = collaborationOf(list, id)
    const children = Object.values(room?.children ?? {})
    if (!children.includes(sessionId)) continue
    const owner = room?.childOwners?.[sessionId]
    if (owner === undefined) return room?.occupants?.includes(humanId) === true
    return owner === humanId
  }
  return false
}

/**
 * Whether this branch's parent is itself a mention branch, so its replies
 * publish to that branch rather than to the room.
 * @param list - Host session catalog, including collaboration projections.
 * @param sessionId - candidate sub-branch Session.
 * @returns true when the Session listing this one as a child is itself listed as a child.
 */
export function isNestedBranch(
  list: SessionListState,
  sessionId: SessionId | string,
): boolean {
  const ids = new Set<string>([...list.ids, ...Object.keys(list.projectionsBySession)])
  const childIds = new Set<string>()
  const parents: string[] = []
  for (const id of ids) {
    const room = collaborationOf(list, id)
    for (const child of Object.values(room?.children ?? {})) {
      childIds.add(child)
      if (child === sessionId) parents.push(id)
    }
  }
  return parents.some(parent => childIds.has(parent))
}

function collaborationOf(list: SessionListState, id: string): CollaborationListView | undefined {
  const values = list.projectionsBySession[id as SessionId]?.values as
    | { readonly collaboration?: CollaborationListView }
    | undefined
  return values?.collaboration
}
