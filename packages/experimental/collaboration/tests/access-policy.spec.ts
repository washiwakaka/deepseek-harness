import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteAccessCondition } from '@deepseek-ai/dsh-api-remote-access/types'
import { createLocalIdentityAccessPolicy } from '../src/access-policy.ts'
import type { RoomOccupancy } from '../src/access-policy.ts'

const ALICE = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' as PeerId }
const BOB = { kind: 'local-identity' as const, browserSessionId: 'peer-bob' as PeerId }
const ADMIN = { kind: 'local-identity' as const, browserSessionId: 'peer-admin' as PeerId }
const UNSIGNED = { kind: 'local-identity' as const, browserSessionId: 'peer-anon' as PeerId }

const ROOM = SessionId('room-1')
const BOB_ROOM = SessionId('room-2')
const ALICE_CHILD = SessionId('child-alice')
const BOB_CHILD = SessionId('child-bob')
const BLANK = SessionId('blank-1')

function occupancy(rooms: Record<string, RoomOccupancy>) {
  return (id: SessionId): RoomOccupancy | undefined => rooms[id]
}

function actionsOf(
  policy: ReturnType<typeof createLocalIdentityAccessPolicy>,
  principal: typeof ALICE,
  kind: 'global' | 'session',
  id?: string,
): readonly string[] {
  const binding = policy.bindings(principal).find(row => (
    kind === 'global'
      ? row.resource.kind === 'global'
      : row.resource.kind === 'session' && row.resource.id === id
  ))
  return binding === undefined ? [] : [...binding.role.actions]
}

function allows(
  policy: ReturnType<typeof createLocalIdentityAccessPolicy>,
  principal: typeof ALICE,
  action: 'session/list' | 'session/follow' | 'session/prompt' | 'collaboration/claimRoom',
  resource: { readonly kind: 'session'; readonly id: SessionId } | { readonly kind: 'global' },
): boolean {
  const bindings = policy.bindings(principal)
  for (const binding of bindings) {
    if (binding.resource.kind !== resource.kind) continue
    if (resource.kind === 'session' && binding.resource.kind === 'session' && binding.resource.id !== resource.id) continue
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
    [ALICE_CHILD]: { occupants: [], children: {}, childOwners: {} },
    [BOB_CHILD]: { occupants: [], children: {}, childOwners: {} },
  }
  const facts = {
    accountForBrowserSession(id: string) {
      if (id === 'peer-alice') return { id: 'alice', admin: false }
      if (id === 'peer-bob') return { id: 'bob', admin: false }
      if (id === 'peer-admin') return { id: 'admin', admin: true }
      return undefined
    },
    listedSessions: () => [ROOM, BOB_ROOM, BLANK, ALICE_CHILD, BOB_CHILD],
    occupancy: occupancy(rooms),
  }
  const policy = createLocalIdentityAccessPolicy(facts)

  it('lets an unsigned browser load identity and an empty session list', () => {
    expect(actionsOf(policy, UNSIGNED, 'global')).toEqual(expect.arrayContaining([
      'identity/loginPassword',
      'identity/status',
      'session/list',
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
  })

  it('keeps signed-in global actions to identity and the session catalog', () => {
    expect(actionsOf(policy, ALICE, 'global')).toEqual(expect.arrayContaining([
      'identity/joinLine',
      'identity/status',
      'session/list',
    ]))
    expect(actionsOf(policy, ALICE, 'global')).not.toEqual(expect.arrayContaining([
      'identity/createLine',
      'identity/listAccounts',
      'session/follow',
      'session/prompt',
    ]))
    expect(actionsOf(policy, ADMIN, 'global')).toEqual(expect.arrayContaining([
      'identity/createLine',
      'identity/listAccounts',
      'identity/setAccountAdmin',
    ]))
  })

  it('lets an occupant write their room and own branch, not Bob\'s', () => {
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: ROOM })).toBe(true)
    expect(allows(policy, ALICE, 'session/prompt', { kind: 'session', id: ALICE_CHILD })).toBe(true)
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
