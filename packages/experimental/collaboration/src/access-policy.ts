/** Host remoteAccess policy for overlay `local-identity` browsers. */

import { SessionId } from '@deepseek-ai/dsh-session'
import { ActorId } from './types.ts'
import type {
  RemoteAccessAction,
  RemoteAccessBinding,
  RemoteAccessPolicy,
  RemoteAccessRequest,
  RemoteAccessRole,
} from '@deepseek-ai/dsh-api-remote-access/types'
import type { LocalIdentityPrincipal } from '@deepseek-ai/dsh-experimental-identity'

/** Occupancy fields the policy reads from a live room projection. */
export interface RoomOccupancy {
  readonly occupants: readonly string[]
  readonly children: Readonly<Record<string, string>>
  readonly childOwners: Readonly<Record<string, string>>
}

/** Synchronous Host state the overlay session policy reads. */
export interface LocalIdentityAccessFacts {
  /**
   * Account bound to one browser-session Peer.
   * @param browserSessionId - cookie Peer id on the principal.
   */
  accountForBrowserSession(browserSessionId: string): { readonly id: string; readonly admin: boolean } | undefined
  /** Live and persisted room ids the occupancy cache still knows. */
  listedSessions(): readonly SessionId[]
  /**
   * Collaboration occupancy for one listed Session.
   * @param sessionId - id from {@link listedSessions}.
   * @returns occupancy, or `undefined` when neither the live journal nor the cache has it.
   */
  occupancy(sessionId: SessionId): RoomOccupancy | undefined
}

/** Calls an unsigned browser may make so the account chip and an empty Session list still load. */
const UNSIGNED_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/listMethods',
  'identity/registerPassword',
  'identity/loginPassword',
  'identity/logout',
  'identity/currentAccount',
  'identity/status',
  'session/list',
  'session/control',
  'session/canOpenWorkspacePath',
  'session/modelCatalog',
]

const SESSION_EVENTS: readonly RemoteAccessAction[] = [
  'event:api-session/activity',
  'event:api-session/added',
  'event:api-session/error',
  'event:api-session/removed',
  'event:api-session/status',
]

const SESSION_READ_ACTIONS: readonly RemoteAccessAction[] = [
  'session/list',
  'session/search',
  'session/control',
  'session/follow',
  'session/events',
  'session/observeEvent',
  'session/observeProjections',
  'session/observeState',
  'session/page',
  'session/projections',
  'session/state',
  'session/wait',
  'commands/list',
  'goals/get',
  'skills/list',
  'toolResults/watch',
  'workspace/follow',
  ...SESSION_EVENTS,
]

const SESSION_WRITE_ACTIONS: readonly RemoteAccessAction[] = [
  'session/prompt',
  'session/cancel',
  'session/rename',
  'session/fork',
  'session/attachment',
  'session/updateQueue',
  'fileUploads/upload',
  'collaboration/postMessage',
  'collaboration/publish',
  'collaboration/claimRoom',
  'collaboration/sendWithRoom',
  'collaboration/admitRoomContext',
]

const SIGNED_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/listLines',
  'identity/listCatalogModels',
  'identity/joinLine',
  'identity/leaveLine',
  'identity/setLineModels',
  'identity/setActiveLine',
]

const ADMIN_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/listAccounts',
  'identity/setAccountAdmin',
  'identity/createLine',
]

const SESSION_OCCUPANT_ACTIONS: readonly RemoteAccessAction[] = [
  ...SESSION_READ_ACTIONS,
  ...SESSION_WRITE_ACTIONS,
]

/** Leftover empty rooms may be claimed; they stay off list/follow/prompt. */
const UNCLAIMED_ACTIONS: readonly RemoteAccessAction[] = ['collaboration/claimRoom']

const UNSIGNED_GLOBAL: RemoteAccessRole<'global'> = {
  name: 'identity:unsigned-global',
  resource: 'global',
  actions: UNSIGNED_GLOBAL_ACTIONS,
}

/**
 * Build the overlay session ACL. Unsigned browsers get identity plus an empty
 * Session list. Occupants read and write their rooms and own branches. Admins
 * read every listed Session and write only rooms they occupy. Unclaimed rooms
 * expose only `collaboration/claimRoom`.
 * @param facts - identity map, listed Sessions, and occupancy.
 * @returns a `remoteAccess` policy for `local-identity`.
 */
export function createLocalIdentityAccessPolicy(
  facts: LocalIdentityAccessFacts,
): RemoteAccessPolicy<LocalIdentityPrincipal> {
  return {
    bindings(principal) {
      const account = facts.accountForBrowserSession(principal.browserSessionId)
      const bindings: RemoteAccessBinding[] = [{
        role: account === undefined
          ? UNSIGNED_GLOBAL
          : { name: 'identity:signed-global', resource: 'global', actions: signedGlobalActions(account.admin) },
        resource: { kind: 'global' },
      }]
      if (account === undefined) return bindings
      const actor = ActorId(account.id)
      const listed = facts.listedSessions()
      const childOf = new Set<string>()
      for (const sessionId of listed) {
        const room = facts.occupancy(sessionId)
        if (room === undefined) continue
        for (const child of Object.values(room.children)) childOf.add(child)
      }
      const writeIds = new Set<string>()
      const readIds = new Set<string>()
      const claimIds = new Set<string>()
      for (const sessionId of listed) {
        if (childOf.has(sessionId)) continue
        const room = facts.occupancy(sessionId)
        if (room === undefined) {
          if (account.admin) readIds.add(sessionId)
          continue
        }
        if (isOccupant(actor, room)) {
          readIds.add(sessionId)
          writeIds.add(sessionId)
          for (const child of ownedChildren(actor, room)) {
            readIds.add(child)
            writeIds.add(child)
          }
          continue
        }
        if (isUnclaimed(room)) {
          claimIds.add(sessionId)
          if (account.admin) readIds.add(sessionId)
          continue
        }
        if (account.admin) {
          readIds.add(sessionId)
          for (const child of Object.values(room.children)) readIds.add(child)
        }
      }
      if (account.admin) {
        for (const sessionId of listed) readIds.add(sessionId)
      }
      for (const id of readIds) {
        bindings.push(sessionBinding(SessionId(id), writeIds.has(id) ? 'occupant' : 'read'))
      }
      for (const id of claimIds) {
        if (readIds.has(id) || writeIds.has(id)) continue
        bindings.push(sessionBinding(SessionId(id), 'claim'))
      }
      return bindings
    },
    explain(request: RemoteAccessRequest<LocalIdentityPrincipal>) {
      const account = facts.accountForBrowserSession(request.principal.browserSessionId)
      return account === undefined ? 'not-signed-in' : 'not-an-occupant'
    },
  }
}

function signedGlobalActions(admin: boolean): readonly RemoteAccessAction[] {
  const seen = new Set<RemoteAccessAction>()
  const actions: RemoteAccessAction[] = []
  const extra = admin ? ADMIN_GLOBAL_ACTIONS : []
  for (const action of [...UNSIGNED_GLOBAL_ACTIONS, ...SIGNED_GLOBAL_ACTIONS, ...extra, ...SESSION_EVENTS]) {
    if (seen.has(action)) continue
    seen.add(action)
    actions.push(action)
  }
  return actions
}

function sessionBinding(id: SessionId, mode: 'occupant' | 'read' | 'claim'): RemoteAccessBinding {
  const actions = mode === 'occupant'
    ? SESSION_OCCUPANT_ACTIONS
    : mode === 'read'
      ? SESSION_READ_ACTIONS
      : UNCLAIMED_ACTIONS
  return {
    role: {
      name: mode === 'occupant' ? 'identity:session-write' : mode === 'read' ? 'identity:session-read' : 'identity:session-claim',
      resource: 'session',
      actions,
    },
    resource: { kind: 'session', id },
  }
}

function isOccupant(actor: ActorId, room: RoomOccupancy): boolean {
  return room.occupants.includes(actor)
}

function isUnclaimed(room: RoomOccupancy): boolean {
  return room.occupants.length === 0 && Object.keys(room.children).length === 0
}

function ownedChildren(actor: ActorId, room: RoomOccupancy): readonly string[] {
  const ids: string[] = []
  for (const child of Object.values(room.children)) {
    const owner = room.childOwners[child]
    if (owner !== undefined && owner !== actor) continue
    if (owner === undefined && !room.occupants.includes(actor)) continue
    ids.push(child)
  }
  return ids
}
