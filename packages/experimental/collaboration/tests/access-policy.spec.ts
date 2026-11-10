import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteAccessCondition } from '@deepseek-ai/dsh-api-remote-access/types'
import { createLocalIdentityAccessPolicy } from '../src/access-policy.ts'
import type { RoomOccupancy } from '../src/access-policy.ts'

const ALICE = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' as PeerId }
const BOB = { kind: 'local-identity' as const, browserSessionId: 'peer-bob' as PeerId }
const ADMIN = { kind: 'local-identity' as const, browserSessionId: 'peer-admin' as PeerId }
const SEED = { kind: 'local-identity' as const, browserSessionId: 'peer-seed' as PeerId }
const WORKSPACE = { kind: 'local-identity' as const, browserSessionId: 'peer-ws' as PeerId }
const UNSIGNED = { kind: 'local-identity' as const, browserSessionId: 'peer-anon' as PeerId }

const ROOM = SessionId('room-1')
const BOB_ROOM = SessionId('room-2')
const LEGACY_ROOM = SessionId('room-3')
const LEGACY_CHILD = SessionId('child-legacy')
const ALICE_CHILD = SessionId('child-alice')
const BOB_CHILD = SessionId('child-bob')
const BLANK = SessionId('blank-1')

function occupancy(rooms: Record<string, RoomOccupancy>) {
  return (id: SessionId): RoomOccupancy | undefined => rooms[id]
}

function actionsOf(
  policy: ReturnType<typeof createLocalIdentityAccessPolicy>,
  principal: typeof ALICE,
  kind: 'global' | 'session' | 'workspace',
  id?: string,
): readonly string[] {
  const binding = policy.bindings(principal).find(row => (
    kind === 'global'
      ? row.resource.kind === 'global'
      : row.resource.kind === kind && row.resource.id === id
  ))
  return binding === undefined ? [] : [...binding.role.actions]
}

function allows(
  policy: ReturnType<typeof createLocalIdentityAccessPolicy>,
  principal: typeof ALICE,
  action: 'session/list' | 'session/follow' | 'session/prompt' | 'session/create'
    | 'collaboration/claimRoom' | 'collaboration/postMessage',
  resource: { readonly kind: 'session'; readonly id: SessionId }
    | { readonly kind: 'global' }
    | { readonly kind: 'workspace'; readonly id: string },
): boolean {
  const bindings = policy.bindings(principal)
  for (const binding of bindings) {
    if (binding.resource.kind !== resource.kind) continue
    if (resource.kind === 'session' && binding.resource.kind === 'session' && binding.resource.id !== resource.id) continue
    if (resource.kind === 'workspace' && binding.resource.kind === 'workspace' && binding.resource.id !== resource.id) continue
    if (!binding.role.actions.includes(action)) continue
    if (binding.condition === undefined) return true
    if (resource.kind === 'global' && binding.resource.kind === 'global') {
      const condition = binding.condition as RemoteAccessCondition<'global'>
      return condition({ action, resource: binding.resource }).kind === 'allow'
    }
    if (resource.kind === 'session' && binding.resource.kind === 'session') {
      const condition = binding.condition as RemoteAccessCondition<'session'>
      return condition({ action, resource: binding.resource }).kind === 'allow'
    }
  }
  return false
}

describe('local-identity session access policy', () => {
  const rooms: Record<string, RoomOccupancy> = {
    [ROOM]: {
      occupants: ['alice'],
      children: { 'alice:model': ALICE_CHILD, 'bob:model': BOB_CHILD },
      childOwners: { [ALICE_CHILD]: 'alice', [BOB_CHILD]: 'bob' },
    },
    [BOB_ROOM]: {
      occupants: ['bob'],
      children: {},
      childOwners: {},
    },
    [BLANK]: {
      occupants: [],
      children: {},
      childOwners: {},
    },
    [LEGACY_ROOM]: {
      occupants: ['alice', 'bob'],
      children: { 'alice:model': LEGACY_CHILD },
      childOwners: {},
    },
    [ALICE_CHILD]: { occupants: [], children: {}, childOwners: {} },
    [BOB_CHILD]: { occupants: [], children: {}, childOwners: {} },
    [LEGACY_CHILD]: { occupants: [], children: {}, childOwners: {} },
  }
  const facts = {
    accountForBrowserSession(id: string) {
      if (id === 'peer-alice') return { id: 'alice', admin: false, capabilities: ['terminal'] as const }
      if (id === 'peer-bob') return { id: 'bob', admin: false }
      if (id === 'peer-admin') return { id: 'admin', admin: true, seedAdmin: false }
      if (id === 'peer-seed') return { id: 'root', admin: true, seedAdmin: true }
      if (id === 'peer-ws') return { id: 'ws-user', admin: false, capabilities: ['workspace'] as const }
      return undefined
    },
    listedSessions: () => [ROOM, BOB_ROOM, LEGACY_ROOM, BLANK, ALICE_CHILD, BOB_CHILD, LEGACY_CHILD],
    occupancy: occupancy(rooms),
    fullGlobalActions: () => ['settings/describe', 'credentials/describe', 'dynamicCordisRunner/inventory'] as const,
    listedWorkspaces: () => ['ws-1' as never],
  }
  const policy = createLocalIdentityAccessPolicy(facts)

  it('lets an unsigned browser load identity and an empty session list', () => {
    expect(actionsOf(policy, UNSIGNED, 'global')).toEqual(expect.arrayContaining([
      'identity/loginPassword',
      'identity/status',
      'session/list',
      'workspace/follow',
    ]))
    expect(actionsOf(policy, UNSIGNED, 'global')).not.toEqual(expect.arrayContaining([
      'identity/listAccounts',
      'identity/listLines',
      'identity/listCatalogModels',
      'identity/createLine',
    ]))
    expect(allows(policy, UNSIGNED, 'session/list', { kind: 'session', id: ROOM })).toBe(false)
    expect(allows(policy, UNSIGNED, 'session/follow', { kind: 'session', id: ROOM })).toBe(false)
    expect(policy.explain?.({
      principal: UNSIGNED,
      action: 'session/follow',
      resources: [{ kind: 'session', id: ROOM }],
    })).toBe('not-signed-in')
  })

  it('hides Bob\'s room from Alice and Bob\'s branch from Alice', () => {
    expect(allows(policy, BOB, 'session/list', { kind: 'session', id: BOB_ROOM })).toBe(true)
    expect(allows(policy, ALICE, 'session/list', { kind: 'session', id: ROOM })).toBe(true)
    expect(allows(policy, ALICE, 'session/follow', { kind: 'session', id: ALICE_CHILD })).toBe(true)
    expect(allows(policy, ALICE, 'session/list', { kind: 'session', id: BOB_ROOM })).toBe(false)
    expect(allows(policy, ALICE, 'session/follow', { kind: 'session', id: BOB_CHILD })).toBe(false)
    expect(policy.explain?.({
      principal: ALICE,
      action: 'session/follow',
      resources: [{ kind: 'session', id: BOB_ROOM }],
    })).toBe('not-an-occupant')
  })

  it('lets a signed-in occupant claim leftover empty rooms without listing them', () => {
    expect(allows(policy, ALICE, 'session/list', { kind: 'session', id: BLANK })).toBe(false)
    expect(allows(policy, ALICE, 'session/follow', { kind: 'session', id: BLANK })).toBe(false)
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: BLANK })).toBe(false)
    expect(allows(policy, ALICE, 'collaboration/claimRoom', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, ALICE, 'collaboration/postMessage', { kind: 'session', id: BLANK })).toBe(true)
  })

  it('does not offer a claim for a non-root Session such as a subagent child', () => {
    const childLike = SessionId('blank-seeded')
    const rootPolicy = createLocalIdentityAccessPolicy({
      ...facts,
      listedSessions: () => [childLike],
      occupancy: occupancy({
        [childLike]: { occupants: [], children: {}, childOwners: {}, root: false },
      }),
    })
    expect(allows(rootPolicy, ALICE, 'collaboration/claimRoom', { kind: 'session', id: childLike })).toBe(false)
    expect(allows(rootPolicy, ALICE, 'collaboration/postMessage', { kind: 'session', id: childLike })).toBe(false)
  })

  it('lets an admin post to an unclaimed room instead of swallowing claim under read', () => {
    expect(allows(policy, ADMIN, 'session/follow', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, ADMIN, 'session/prompt', { kind: 'session', id: BLANK })).toBe(false)
    expect(allows(policy, ADMIN, 'collaboration/claimRoom', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, ADMIN, 'collaboration/postMessage', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, SEED, 'collaboration/postMessage', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, ADMIN, 'collaboration/postMessage', { kind: 'session', id: BOB_ROOM })).toBe(false)
  })

  it('names a signed-in global or workspace refusal as not-allowed, not occupancy', () => {
    expect(policy.explain?.({
      principal: ALICE,
      action: 'dynamicCordisRunner/inventory',
      resources: [{ kind: 'global' }],
    })).toBe('not-allowed')
    expect(policy.explain?.({
      principal: ALICE,
      action: 'workspace/delete',
      resources: [{ kind: 'workspace', id: 'ws-1' as never }],
    })).toBe('not-allowed')
  })

  it('gives an invited non-creator occupant only their granted capabilities on the room', () => {
    const sharedRoom = SessionId('room-shared')
    const sharedPolicy = createLocalIdentityAccessPolicy({
      ...facts,
      listedSessions: () => [sharedRoom],
      occupancy: occupancy({
        [sharedRoom]: {
          occupants: ['alice', 'bob'],
          children: {},
          childOwners: {},
        },
      }),
    })
    expect(actionsOf(sharedPolicy, ALICE, 'session', sharedRoom)).toEqual(expect.arrayContaining([
      'workspaceFiles/list',
      'dynamicCordisRunner/stopFromPanel',
    ]))
    expect(actionsOf(sharedPolicy, BOB, 'session', sharedRoom)).toEqual(expect.arrayContaining([
      'session/prompt',
      'goals/create',
      'workspace/pinSession',
    ]))
    expect(actionsOf(sharedPolicy, BOB, 'session', sharedRoom)).not.toEqual(expect.arrayContaining([
      'workspaceFiles/list',
      'terminal/create',
      'dynamicCordisRunner/stopFromPanel',
    ]))
    const invitedBranch = SessionId('child-invited-bob')
    const missingOccupancy = SessionId('room-unhydrated')
    const edgePolicy = createLocalIdentityAccessPolicy({
      accountForBrowserSession: id => facts.accountForBrowserSession(id),
      listedSessions: () => [sharedRoom, invitedBranch, missingOccupancy],
      occupancy: occupancy({
        [sharedRoom]: {
          occupants: ['alice', 'bob'],
          children: { 'bob:model': invitedBranch },
          childOwners: { [invitedBranch]: 'bob' },
        },
      }),
    })
    expect(allows(edgePolicy, BOB, 'session/prompt', { kind: 'session', id: invitedBranch })).toBe(true)
    // A branch owner receives every session-scoped action on their own branch,
    // even when they are only an invited occupant of the room.
    expect(actionsOf(edgePolicy, BOB, 'session', invitedBranch)).toEqual(expect.arrayContaining([
      'workspaceFiles/list',
      'terminal/create',
      'dynamicCordisRunner/stopFromPanel',
    ]))
    // A legacy branch with no recorded owner is writable by every occupant
    // but stays creator-scoped for the full action set.
    expect(allows(policy, BOB, 'session/prompt', { kind: 'session', id: LEGACY_CHILD })).toBe(true)
    expect(actionsOf(policy, BOB, 'session', LEGACY_CHILD)).not.toEqual(expect.arrayContaining([
      'terminal/attach',
    ]))
    expect(actionsOf(policy, ALICE, 'session', LEGACY_CHILD)).toEqual(expect.arrayContaining([
      'terminal/attach',
    ]))
    // Occupancy-unknown Sessions are never claimable: they may be subagent
    // children or other non-room conversations the service has not seen.
    expect(allows(edgePolicy, ALICE, 'collaboration/postMessage', { kind: 'session', id: missingOccupancy })).toBe(false)
    expect(allows(edgePolicy, ADMIN, 'session/follow', { kind: 'session', id: missingOccupancy })).toBe(true)
    expect(allows(edgePolicy, ADMIN, 'collaboration/postMessage', { kind: 'session', id: missingOccupancy })).toBe(false)
    expect(actionsOf(edgePolicy, SEED, 'global')).toEqual(expect.arrayContaining([
      'identity/setAccountCapabilities',
    ]))
  })

  it('keeps signed-in global actions to identity and the session catalog', () => {
    expect(actionsOf(policy, ALICE, 'global')).toEqual(expect.arrayContaining([
      'identity/joinLine',
      'identity/status',
      'session/list',
      'session/create',
      'terminal/create',
    ]))
    expect(actionsOf(policy, ALICE, 'global')).not.toEqual(expect.arrayContaining([
      'identity/createLine',
      'identity/listAccounts',
      'identity/setAccountCapabilities',
      'dynamicCordisRunner/inventory',
      'session/follow',
      'session/prompt',
    ]))
    expect(actionsOf(policy, ADMIN, 'global')).toEqual(expect.arrayContaining([
      'identity/createLine',
      'identity/listAccounts',
      'identity/setAccountAdmin',
      'workspace/create',
      'directoryPicker/pick',
    ]))
    expect(actionsOf(policy, ADMIN, 'global')).not.toEqual(expect.arrayContaining([
      'identity/setAccountCapabilities',
      'settings/describe',
      'dynamicCordisRunner/inventory',
      'workspaceFiles/list',
    ]))
    expect(actionsOf(policy, ALICE, 'global')).not.toEqual(expect.arrayContaining([
      'workspace/create',
      'directoryPicker/pick',
    ]))
    expect(actionsOf(policy, SEED, 'global')).toEqual(expect.arrayContaining([
      'identity/setAccountCapabilities',
      'settings/describe',
      'credentials/describe',
      'dynamicCordisRunner/inventory',
      'workspace/create',
    ]))
    expect(allows(policy, ALICE, 'session/create', { kind: 'workspace', id: 'ws-1' })).toBe(true)
    expect(allows(policy, ADMIN, 'session/create', { kind: 'workspace', id: 'ws-1' })).toBe(true)
    expect(allows(policy, SEED, 'session/create', { kind: 'workspace', id: 'ws-1' })).toBe(true)
    expect(actionsOf(policy, ALICE, 'workspace', 'ws-1')).toEqual(expect.arrayContaining([
      'session/create',
      'workspace/follow',
    ]))
    expect(actionsOf(policy, ALICE, 'workspace', 'ws-1')).not.toEqual(expect.arrayContaining([
      'workspace/rename',
      'workspace/delete',
    ]))
    expect(actionsOf(policy, ADMIN, 'workspace', 'ws-1')).toEqual(expect.arrayContaining([
      'session/create',
      'workspace/rename',
      'workspace/delete',
    ]))
    expect(actionsOf(policy, WORKSPACE, 'global')).toEqual(expect.arrayContaining([
      'workspace/create',
      'directoryPicker/pick',
    ]))
    expect(actionsOf(policy, WORKSPACE, 'workspace', 'ws-1')).toEqual(expect.arrayContaining([
      'session/create',
      'workspace/rename',
      'workspace/delete',
      'workspaceFiles/list',
      'directoryPicker/pick',
    ]))
    expect(actionsOf(policy, SEED, 'workspace', 'ws-1')).toEqual(expect.arrayContaining([
      'session/create',
      'workspace/follow',
      'workspace/rename',
      'workspaceFiles/list',
    ]))
    expect(allows(policy, SEED, 'session/list', { kind: 'session', id: BOB_ROOM })).toBe(true)
    expect(allows(policy, SEED, 'session/prompt', { kind: 'session', id: BOB_ROOM })).toBe(false)
  })

  it('lets an occupant write their room and own branch, not Bob\'s', () => {
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: ROOM })).toBe(true)
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: ALICE_CHILD })).toBe(true)
    expect(actionsOf(policy, ALICE, 'session', ROOM)).toEqual(expect.arrayContaining([
      'session/prompt',
      'agentTeams/setEnabled',
      'workspace/pinSession',
      'workspace/archiveSession',
      'workspaceFiles/list',
      'workspaceFiles/read',
      'terminal/create',
      'goals/create',
      'messageFeedback/put',
      'subagent/prompt',
      'actionCards/act',
      'fileReferences/list',
      'dynamicCordisRunner/stopFromPanel',
    ]))
    expect(actionsOf(policy, BOB, 'session', BOB_ROOM)).toEqual(expect.arrayContaining([
      'session/prompt',
      'workspaceFiles/list',
      'terminal/create',
      'fileReferences/list',
      'dynamicCordisRunner/stopFromPanel',
    ]))
    expect(actionsOf(policy, BOB, 'global')).not.toEqual(expect.arrayContaining([
      'workspaceFiles/list',
      'terminal/create',
      'dynamicCordisRunner/inventory',
    ]))
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: BOB_ROOM })).toBe(false)
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: BOB_CHILD })).toBe(false)
  })

  it('lets an admin list every live Session without writing Bob\'s room', () => {
    expect(allows(policy, ADMIN, 'session/list', { kind: 'session', id: BOB_ROOM })).toBe(true)
    expect(allows(policy, ADMIN, 'session/list', { kind: 'session', id: BLANK })).toBe(true)
    expect(allows(policy, ADMIN, 'session/follow', { kind: 'session', id: BOB_CHILD })).toBe(true)
    expect(allows(policy, ADMIN, 'session/prompt', { kind: 'session', id: BOB_ROOM })).toBe(false)
    expect(allows(policy, ADMIN, 'session/prompt', { kind: 'session', id: BOB_CHILD })).toBe(false)
  })
})
