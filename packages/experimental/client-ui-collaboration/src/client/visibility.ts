/** Sidebar admission from collaboration occupancy on Session list projections. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

interface CollaborationListView {
  readonly occupants?: readonly string[]
  readonly children?: Readonly<Record<string, string>>
}

/**
 * Whether this human may see one Session: occupant, or an in-flight claim, plus that room's branches.
 * Unclaimed Sessions stay hidden until this human claims them.
 * @param humanId - current test author.
 * @param list - Host session catalog, including collaboration projections.
 * @param sessionId - candidate Session.
 * @param pendingClaims - Session ids this Client is claiming for `humanId`.
 */
export function sessionVisibleTo(
  humanId: string | undefined,
  list: SessionListState,
  sessionId: SessionId | string,
  pendingClaims: ReadonlySet<string> = new Set(),
): boolean {
  if (humanId === undefined) return true
  return visibleIds(list, humanId, pendingClaims).has(sessionId)
}

/**
 * Session ids the current human may see.
 * @param list - Host session catalog.
 * @param humanId - current test author.
 * @param pendingClaims - Session ids this Client is claiming for `humanId`.
 */
export function visibleIds(
  list: SessionListState,
  humanId: string,
  pendingClaims: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  const ids = new Set<string>([...list.ids, ...Object.keys(list.byId)])
  const parentOf = new Map<string, string[]>()
  for (const id of ids) {
    const children = collaborationOf(list, id)?.children ?? {}
    for (const child of Object.values(children)) {
      const parents = parentOf.get(child) ?? []
      parents.push(id)
      parentOf.set(child, parents)
    }
  }
  const visible = new Set<string>()
  for (const id of ids) {
    const occupants = collaborationOf(list, id)?.occupants ?? []
    const claimed = occupants.includes(humanId)
    const pendingBlank = occupants.length === 0
      && (parentOf.get(id) ?? []).length === 0
      && pendingClaims.has(id)
    if (claimed || pendingBlank) visible.add(id)
  }
  let grew = true
  while (grew) {
    grew = false
    for (const id of [...visible]) {
      const children = collaborationOf(list, id)?.children ?? {}
      for (const child of Object.values(children)) {
        if (visible.has(child)) continue
        visible.add(child)
        grew = true
      }
    }
  }
  return visible
}

function collaborationOf(list: SessionListState, id: string): CollaborationListView | undefined {
  const values = list.projectionsBySession[id as SessionId]?.values as
    | { readonly collaboration?: CollaborationListView }
    | undefined
  return values?.collaboration
}
