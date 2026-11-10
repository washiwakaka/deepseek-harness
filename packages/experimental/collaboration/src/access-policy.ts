/** Host remoteAccess policy for overlay `local-identity` browsers. */

import { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { ActorId } from './types.ts'
import type {
  RemoteAccessAction,
  RemoteAccessBinding,
  RemoteAccessPolicy,
  RemoteAccessRequest,
  RemoteAccessRole,
} from '@deepseek-ai/dsh-api-remote-access/types'
import type { IdentityCapability, LocalIdentityPrincipal } from '@deepseek-ai/dsh-experimental-identity'

/** Occupancy fields the policy reads from a live room projection. */
export interface RoomOccupancy {
  readonly occupants: readonly string[]
  readonly children: Readonly<Record<string, string>>
  readonly childOwners: Readonly<Record<string, string>>
  /**
   * Whether the Session header marks a root conversation (no parent, not
   * seeded). Only root Sessions may be claimed as rooms; `undefined` keeps
   * the pre-header behavior for hand-built facts.
   */
  readonly root?: boolean
}

/** Account fields the policy reads from `ctx.identity`. */
export interface LocalIdentityPolicyAccount {
  readonly id: string
  readonly admin: boolean
  readonly seedAdmin?: boolean
  readonly capabilities?: readonly IdentityCapability[]
}

/** Synchronous Host state the overlay session policy reads. */
export interface LocalIdentityAccessFacts {
  /**
   * Account bound to one browser-session Peer.
   * @param browserSessionId - cookie Peer id on the principal.
   */
  accountForBrowserSession(browserSessionId: string): LocalIdentityPolicyAccount | undefined
  /** Live and persisted room ids the occupancy cache still knows. */
  listedSessions(): readonly SessionId[]
  /**
   * Collaboration occupancy for one listed Session.
   * @param sessionId - id from {@link listedSessions}.
   * @returns occupancy, or `undefined` when neither the live journal nor the cache has it.
   */
  occupancy(sessionId: SessionId): RoomOccupancy | undefined
  /** Registered Remote endpoints and forwarded events for full-capability `seedAdmin` accounts. */
  fullGlobalActions?: () => readonly RemoteAccessAction[]
  /**
   * Durable Workspaces listed for every signed-in account.
   * `session/create` is a workspace-resource call, so this list must include
   * every Workspace the account may open or the Gateway denies creation.
   */
  listedWorkspaces?: () => readonly WorkspaceId[]
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
  'workspace/follow',
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
  'collaboration/branchInfo',
  'goals/get',
  'messageFeedback/list',
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
  'session/selectModel',
  'commands/execute',
  'goals/create',
  'goals/edit',
  'goals/pause',
  'goals/resume',
  'goals/complete',
  'goals/clear',
  'messageFeedback/put',
  'messageFeedback/delete',
  'sessionFeedback/record',
  'subagent/prompt',
  'subagent/interruptByUser',
  'actionCards/act',
  'userQuestions/answer',
  'userQuestions/attachWait',
  'fileUploads/upload',
  'collaboration/postMessage',
  'collaboration/publish',
  'collaboration/claimRoom',
  'collaboration/sendWithRoom',
  'collaboration/admitRoomContext',
  'collaboration/leaveRoom',
  'collaboration/removeOccupant',
  'agentTeams/setEnabled',
  'workspace/archiveSession',
  'workspace/unarchiveSession',
  'workspace/pinSession',
  'workspace/unpinSession',
  'workspace/insertSessionBefore',
]

const SIGNED_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/listLines',
  'identity/listCatalogModels',
  'identity/joinLine',
  'identity/leaveLine',
  'identity/setLineModels',
  'identity/setActiveLine',
  'session/create',
  'session/initializeDefaultModel',
  'workspace/follow',
  'collaboration/listActors',
  'collaboration/listMentionModels',
  'event:commands/change',
  'event:goal/activation-changed',
  'event:llm/adapters-updated',
  'event:llm/models-updated',
  'event:permission-presets/catalog-changed',
]

const ADMIN_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/listAccounts',
  'identity/setAccountAdmin',
  'identity/createLine',
  'workspace/create',
  'workspace/initializeDefault',
  'workspace/rename',
  'workspace/delete',
  'workspace/insertBefore',
  'workspace/insertSessionBefore',
  'directoryPicker/list',
  'directoryPicker/pick',
  'directoryPicker/createDirectory',
]

const SEED_ADMIN_GLOBAL_ACTIONS: readonly RemoteAccessAction[] = [
  'identity/setAccountCapabilities',
]

const CAPABILITY_GLOBAL_ACTIONS: Readonly<Record<IdentityCapability, readonly RemoteAccessAction[]>> = {
  workspace: [
    'workspace/follow',
    'workspace/create',
    'workspace/initializeDefault',
    'workspace/rename',
    'workspace/delete',
    'workspace/insertBefore',
    'workspace/insertSessionBefore',
    'workspace/archiveSession',
    'workspace/unarchiveSession',
    'workspace/pinSession',
    'workspace/unpinSession',
    'directoryPicker/list',
    'directoryPicker/pick',
    'directoryPicker/createDirectory',
    'workspaceFiles/list',
    'workspaceFiles/read',
    'workspaceFiles/readBytes',
    'workspaceFiles/stat',
    'workspaceFiles/changes',
    'session/openWorkspacePath',
    'session/workspacePathApplications',
    'fileReferences/list',
    'sessionReferenceResolver/candidates',
  ],
  terminal: [
    'terminal/attach',
    'terminal/close',
    'terminal/create',
    'terminal/environment',
    'terminal/list',
    'terminal/rename',
    'terminal/retain',
    'terminal/shells',
    'job/follow',
    'job/kill',
    'job/list',
  ],
  mcp: [
    'mcpManager/probe',
    'mcpManager/restart',
    'mcpManager/watch',
    'agentPresets/list',
    'agentPresets/read',
    'agentPresets/select',
    'schedule/catalog',
    'schedule/create',
    'schedule/deliveryLimits',
    'schedule/deleteInactive',
    'schedule/edit',
    'schedule/history',
    'schedule/list',
    'schedule/run',
    'schedule/view',
    'event:agent-preset/selected',
    'event:schedule/changed',
  ],
  cordis: [
    'dynamicCordisRunner/getClientCode',
    'dynamicCordisRunner/inventory',
    'dynamicCordisRunner/invoke',
    'dynamicCordisRunner/reportClientGuardFailure',
    'dynamicCordisRunner/reportRenderFailure',
    'dynamicCordisRunner/resolveInspectQuery',
    'dynamicCordisRunner/resolveRequestRun',
    'dynamicCordisRunner/runHostHalf',
    'dynamicCordisRunner/settleUserRun',
    'dynamicCordisRunner/stopFromPanel',
    'dynamicCordisRunner/syncInspectManifest',
    'dynamicCordisRunner/undefineFromPanel',
    'event:cordis/request-run',
    'event:cordis/request-run-resolved',
    'event:cordis/dynamic-package',
    'event:cordis/dynamic-retract',
    'event:cordis/inspect-query',
    'event:cordis/inspect-query-resolved',
  ],
}

const CAPABILITY_SESSION_ACTIONS: Readonly<Record<IdentityCapability, readonly RemoteAccessAction[]>> = {
  workspace: [
    'workspace/insertSessionBefore',
    'workspace/archiveSession',
    'workspace/unarchiveSession',
    'workspace/pinSession',
    'workspace/unpinSession',
    'workspaceFiles/list',
    'workspaceFiles/read',
    'workspaceFiles/readBytes',
    'workspaceFiles/stat',
    'workspaceFiles/changes',
    'fileReferences/list',
    'sessionReferenceResolver/candidates',
  ],
  terminal: [
    'terminal/attach',
    'terminal/close',
    'terminal/create',
    'terminal/environment',
    'terminal/list',
    'terminal/rename',
    'terminal/retain',
    'terminal/shells',
    'job/follow',
    'job/kill',
    'job/list',
  ],
  mcp: [
    'agentPresets/select',
  ],
  cordis: [
    'dynamicCordisRunner/reportClientGuardFailure',
    'dynamicCordisRunner/reportRenderFailure',
    'dynamicCordisRunner/resolveInspectQuery',
    'dynamicCordisRunner/runHostHalf',
    'dynamicCordisRunner/settleUserRun',
    'dynamicCordisRunner/stopFromPanel',
    'dynamicCordisRunner/undefineFromPanel',
  ],
}

const SIGNED_WORKSPACE_ACTIONS: readonly RemoteAccessAction[] = [
  'session/create',
  'workspace/follow',
]

const WORKSPACE_ACTIONS: readonly RemoteAccessAction[] = [
  ...SIGNED_WORKSPACE_ACTIONS,
  'workspace/rename',
  'workspace/delete',
  'workspace/insertBefore',
  'workspace/insertSessionBefore',
]

function uniqueActions(list: readonly RemoteAccessAction[]): readonly RemoteAccessAction[] {
  const seen = new Set<RemoteAccessAction>()
  const actions: RemoteAccessAction[] = []
  for (const action of list) {
    if (seen.has(action)) continue
    seen.add(action)
    actions.push(action)
  }
  return actions
}

/** Workspace-resource actions for accounts granted the Workspace capability. */
const FULL_WORKSPACE_ACTIONS: readonly RemoteAccessAction[] = uniqueActions([
  ...WORKSPACE_ACTIONS,
  ...CAPABILITY_GLOBAL_ACTIONS.workspace,
])

const SESSION_OCCUPANT_ACTIONS: readonly RemoteAccessAction[] = [
  ...SESSION_READ_ACTIONS,
  ...SESSION_WRITE_ACTIONS,
]

/**
 * Leftover empty rooms stay off list/follow/prompt for ordinary members.
 * Claim and the first room post both admit the signed-in account, so Gateway
 * must allow `postMessage` here or an admin's read binding would swallow the
 * claim and block the creator.
 */
const UNCLAIMED_ACTIONS: readonly RemoteAccessAction[] = [
  'collaboration/claimRoom',
  'collaboration/postMessage',
  'collaboration/sendWithRoom',
  'collaboration/admitRoomContext',
]

const UNSIGNED_GLOBAL: RemoteAccessRole<'global'> = {
  name: 'identity:unsigned-global',
  resource: 'global',
  actions: UNSIGNED_GLOBAL_ACTIONS,
}

/**
 * Build the overlay session ACL. Unsigned browsers get identity plus an empty
 * Session list. Occupants read and write their rooms and own branches. The
 * first occupant is the creator and receives every session-scoped Host action
 * on that room and their own branches, regardless of role or granted
 * capabilities. Admins read every listed Session and write only rooms they occupy. A Config
 * `seedAdmin` gets full Host global and workspace capabilities while session
 * writes stay on occupied rooms. Signed-in accounts may `session/create` on
 * listed Workspaces. `workspace`-capable accounts and seed admins receive
 * every workspace-scoped Host action on those Workspaces; other admins may
 * add, rename, and delete. Occupants pin or archive Sessions they occupy.
 * Occupants may set Agent Teams mode on rooms they write. Unclaimed rooms
 * expose `collaboration/claimRoom` and the first room post, including when
 * an admin also has a read binding.
 * @param facts - identity map, listed Sessions, occupancy, and Host catalogs.
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
          : {
            name: account.seedAdmin ? 'identity:seed-admin-global' : 'identity:signed-global',
            resource: 'global',
            actions: signedGlobalActions(account, facts.fullGlobalActions),
          },
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
      const creatorIds = new Set<string>()
      const readIds = new Set<string>()
      const claimIds = new Set<string>()
      for (const sessionId of listed) {
        if (childOf.has(sessionId)) continue
        const room = facts.occupancy(sessionId)
        if (room === undefined) {
          // Occupancy is unknown: the Session may be a subagent child, a
          // branch, or any other non-room conversation. Never offer a claim
          // for a Session the collaboration service has not seen as a room.
          if (account.admin) readIds.add(sessionId)
          continue
        }
        if (isOccupant(actor, room)) {
          readIds.add(sessionId)
          writeIds.add(sessionId)
          const created = isCreator(actor, room)
          if (created) creatorIds.add(sessionId)
          for (const child of ownedChildren(actor, room)) {
            readIds.add(child)
            writeIds.add(child)
            // The human who opened a branch owns that Session: they receive
            // every session-scoped action on it, exactly like a room creator
            // on their room. Legacy children without a recorded owner stay
            // creator-scoped so other occupants do not gain full control.
            if (created || room.childOwners[child] === actor) creatorIds.add(child)
          }
          continue
        }
        if (isUnclaimed(room) && room.root !== false) {
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
        bindings.push(sessionBinding(
          SessionId(id),
          writeIds.has(id) ? 'occupant' : 'read',
          occupantSessionActions(account, creatorIds.has(id)),
        ))
      }
      for (const id of claimIds) {
        bindings.push(sessionBinding(SessionId(id), 'claim', occupantSessionActions(account, false)))
      }
      const workspaceActions = account.seedAdmin || account.capabilities?.includes('workspace') === true
        ? FULL_WORKSPACE_ACTIONS
        : account.admin
          ? WORKSPACE_ACTIONS
          : SIGNED_WORKSPACE_ACTIONS
      for (const workspaceId of facts.listedWorkspaces?.() ?? []) {
        bindings.push(workspaceBinding(workspaceId, workspaceActions))
      }
      return bindings
    },
    explain(request: RemoteAccessRequest<LocalIdentityPrincipal>) {
      const account = facts.accountForBrowserSession(request.principal.browserSessionId)
      if (account === undefined) return 'not-signed-in'
      if (request.resources.some(resource => resource.kind === 'global' || resource.kind === 'workspace')) {
        return 'not-allowed'
      }
      return 'not-an-occupant'
    },
  }
}

function signedGlobalActions(
  account: LocalIdentityPolicyAccount,
  fullGlobalActions?: () => readonly RemoteAccessAction[],
): readonly RemoteAccessAction[] {
  const seen = new Set<RemoteAccessAction>()
  const actions: RemoteAccessAction[] = []
  const add = (list: readonly RemoteAccessAction[]) => {
    for (const action of list) {
      if (seen.has(action)) continue
      seen.add(action)
      actions.push(action)
    }
  }
  add(UNSIGNED_GLOBAL_ACTIONS)
  add(SIGNED_GLOBAL_ACTIONS)
  if (account.admin) add(ADMIN_GLOBAL_ACTIONS)
  if (account.seedAdmin) {
    add(SEED_ADMIN_GLOBAL_ACTIONS)
    for (const group of Object.values(CAPABILITY_GLOBAL_ACTIONS)) add(group)
    if (fullGlobalActions !== undefined) add(fullGlobalActions())
  } else {
    for (const cap of account.capabilities ?? []) {
      add(CAPABILITY_GLOBAL_ACTIONS[cap])
    }
  }
  add(SESSION_EVENTS)
  return actions
}

function occupantSessionActions(
  account: LocalIdentityPolicyAccount,
  asCreator: boolean,
): readonly RemoteAccessAction[] {
  if (asCreator || account.seedAdmin) {
    return uniqueActions([
      ...SESSION_OCCUPANT_ACTIONS,
      ...Object.values(CAPABILITY_SESSION_ACTIONS).flat(),
    ])
  }
  return uniqueActions([
    ...SESSION_OCCUPANT_ACTIONS,
    ...(account.capabilities ?? []).flatMap(cap => CAPABILITY_SESSION_ACTIONS[cap]),
  ])
}

function sessionBinding(
  id: SessionId,
  mode: 'occupant' | 'read' | 'claim',
  occupantActions: readonly RemoteAccessAction[],
): RemoteAccessBinding {
  const actions = mode === 'occupant'
    ? occupantActions
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

function workspaceBinding(
  id: WorkspaceId,
  actions: readonly RemoteAccessAction[],
): RemoteAccessBinding {
  return {
    role: {
      name: 'identity:workspace',
      resource: 'workspace',
      actions,
    },
    resource: { kind: 'workspace', id },
  }
}

function isOccupant(actor: ActorId, room: RoomOccupancy): boolean {
  return room.occupants.includes(actor)
}

function isCreator(actor: ActorId, room: RoomOccupancy): boolean {
  return room.occupants[0] === actor
}

function isUnclaimed(room: RoomOccupancy): boolean {
  return room.occupants.length === 0 && Object.keys(room.children).length === 0
}

function ownedChildren(actor: ActorId, room: RoomOccupancy): readonly string[] {
  const ids: string[] = []
  for (const child of Object.values(room.children)) {
    const owner = room.childOwners[child]
    if (owner !== undefined && owner !== actor) continue
    ids.push(child)
  }
  return ids
}
