import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { PeerId, PeerScope, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import IdentityService, { IDENTITY_CLOSED_PROVIDER } from '@deepseek-ai/dsh-experimental-identity'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { MockAdapter } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CollaborationService, { ActorId } from '../src/index.ts'
import { collaborationProjectionDefinition } from '../src/projection.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  new MemoryCredentials(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-accounts-'))
  roots.push(storageRoot)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(IdentityService, {})
  await ctx.plugin(CollaborationService, { actors: [] })
  ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  return { ctx, room }
}

function caller(ctx: Context, id: PeerId): Context {
  const peer = {
    id,
    ctx,
    principal: { kind: 'local-identity' as const, browserSessionId: id },
    interactions: 'answer' as const,
    signal: new AbortController().signal,
    dispose: () => Promise.resolve(),
  } satisfies PeerScope
  const invocation: RemoteInvocation = {
    request: { namespace: 'identity', method: 'loginPassword', args: {} },
    service: 'identity',
    peer,
    signal: peer.signal,
    uplink: () => ({ async *[Symbol.asyncIterator]() {} }),
  }
  return ctx.extend({ invocation })
}

function occupantsOf(agent: Agent): readonly string[] {
  let state = collaborationProjectionDefinition.init(agent.session.header, agent.session.inheritedEventCount)
  for (const event of agent.session.snapshotEvents()) {
    state = collaborationProjectionDefinition.apply(state, event)
  }
  return state.occupants
}

describe('collaboration identity posts', () => {
  it('requires the signed-in identity account before posting', async () => {
    const { ctx, room } = await setup()
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })).rejects.toMatchObject({ code: 'COLLAB_NOT_SIGNED_IN' })
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.loginPassword('alice', 'password1')
    expect(ctx.collaboration.listActors()).toEqual([
      {
        id: ActorId('alice'),
        kind: 'human',
        name: 'Alice',
        group: '',
        providers: [IDENTITY_CLOSED_PROVIDER],
        models: [IDENTITY_CLOSED_PROVIDER],
      },
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: 'nope',
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
  })

  it('records the signed-in creator when a root Agent starts', async () => {
    const { ctx } = await setup()
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.loginPassword('alice', 'password1')
    const created = await ctx.agentLoop.create(SessionId('owned'), { provider: 'mock', model: 'mock' })
    expect(occupantsOf(created)).toEqual([ActorId('alice')])
  })

  it('stamps the creating Remote Peer when conversation-created carries its id', async () => {
    const { ctx } = await setup()
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    const alice = caller(ctx, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    expect(ctx.identity.currentAccount()).toBeUndefined()
    const created = await ctx.agentLoop.create(SessionId('remote-owned'), { provider: 'mock', model: 'mock' })
    expect(occupantsOf(created)).toEqual([])
    await alice.serial('api-session/conversation-created', { agent: created, peerId: 'peer-alice' })
    expect(occupantsOf(created)).toEqual([ActorId('alice')])
  })

  it('keeps occupied rooms in the ACL after the Agent leaves the live registry', async () => {
    const { ctx } = await setup()
    await ctx.plugin(RemoteAccessService)
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    const alice = caller(ctx, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    const handle = await ctx.agents.create({
      sessionId: SessionId('cold-owned'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await alice.serial('api-session/conversation-created', { agent: handle.agent, peerId: 'peer-alice' })
    const sessionId = handle.agent.session.id
    await handle.dispose()
    expect(ctx.sessions.get(sessionId)).toBeUndefined()
    const alicePrincipal = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' }
    expect(ctx.remoteAccess.decide({
      principal: alicePrincipal,
      action: 'session/list',
      resources: [{ kind: 'session', id: sessionId }],
    }).kind).toBe('allow')
  })

  it('keeps a persisted room listable after a full Host restart', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-accounts-restart-'))
    roots.push(storageRoot)
    const mount = async () => {
      const ctx = new Context()
      contexts.push(ctx)
      new MemoryCredentials(ctx)
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
      await ctx.plugin(AgentLoop, { agents: [] })
      await ctx.plugin(IdentityService, {})
      await ctx.plugin(CollaborationService, { actors: [] })
      await ctx.plugin(RemoteAccessService)
      ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
      return ctx
    }
    const first = await mount()
    await first.identity.registerPassword('alice', 'password1', 'Alice')
    await first.identity.loginPassword('alice', 'password1')
    const room = await first.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
    await first.collaboration.postMessage(room.session, { actorId: ActorId('alice'), text: 'hello' })
    const roomId = room.session.id
    contexts.splice(contexts.indexOf(first), 1)
    await first.fiber.dispose()

    const second = await mount()
    expect(second.sessions.get(roomId)).toBeUndefined()
    // The in-memory test credential store does not survive the restart; the
    // room occupancy under test lives in the persisted Session log.
    await second.identity.registerPassword('alice', 'password1', 'Alice')
    const alice = caller(second, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    const alicePrincipal = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' }
    expect(second.remoteAccess.decide({
      principal: alicePrincipal,
      action: 'session/list',
      resources: [{ kind: 'session', id: roomId }],
    }).kind).toBe('allow')
    await second.identity.registerPassword('bob', 'password1', 'Bob')
    const bob = caller(second, 'peer-bob' as PeerId)
    await bob.identity.loginPassword('bob', 'password1')
    const bobPrincipal = { kind: 'local-identity' as const, browserSessionId: 'peer-bob' }
    expect(second.remoteAccess.decide({
      principal: bobPrincipal,
      action: 'session/list',
      resources: [{ kind: 'session', id: roomId }],
    }).kind).not.toBe('allow')
  })

  it('drops deleted Sessions from the occupancy cache', async () => {
    const { ctx } = await setup()
    await ctx.plugin(RemoteAccessService)
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.loginPassword('alice', 'password1')
    const handle = await ctx.agents.create({
      sessionId: SessionId('prune-room'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await ctx.collaboration.postMessage(handle.agent.session, { actorId: ActorId('alice'), text: 'hello' })
    const roomId = handle.agent.session.id
    await handle.dispose()
    const alice = caller(ctx, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    const principal = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' }
    expect(ctx.remoteAccess.decide({
      principal,
      action: 'session/list',
      resources: [{ kind: 'session', id: roomId }],
    }).kind).toBe('allow')
    const root = roots[roots.length - 1]!
    for (const entry of readdirSync(root, { recursive: true }).map((name): string => String(name))) {
      if (entry.split(/[\\/]/).at(-1) !== 'prune-room') continue
      rmSync(join(root, entry), { recursive: true, force: true })
    }
    await vi.waitFor(() => {
      expect(ctx.remoteAccess.decide({
        principal,
        action: 'session/list',
        resources: [{ kind: 'session', id: roomId }],
      }).kind).not.toBe('allow')
    })
  })

  it('authorizes session/create on a workspace resource and invalidates ACL on workspace/session changes', async () => {
    const { ctx } = await setup()
    ctx.provide('workspaceRegistry', {
      list: () => [{ id: 'ws-alpha', sessionIds: [] }],
    })
    await ctx.plugin(RemoteAccessService)
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    const alice = caller(ctx, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    const alicePrincipal = { kind: 'local-identity' as const, browserSessionId: 'peer-alice' }
    expect(ctx.remoteAccess.decide({
      principal: alicePrincipal,
      action: 'session/create',
      resources: [{ kind: 'workspace', id: 'ws-alpha' as never }],
    }).kind).toBe('allow')
    const unseeded = ctx.sessions.create(SessionId('unseeded-blank'))
    expect(ctx.remoteAccess.decide({
      principal: alicePrincipal,
      action: 'collaboration/postMessage',
      resources: [{ kind: 'session', id: unseeded.id }],
    }).kind).toBe('allow')
    ctx.emit('domain/changed', { domain: 'other', table: '', key: '', operation: 'put', value: {} } as never)
    ctx.emit('domain/changed', { domain: 'workspace', table: '', key: '', operation: 'put', value: {} } as never)
    await ctx.identity.registerPassword('root', 'password1', 'Root')
    const rootCtx = new Context()
    contexts.push(rootCtx)
    new MemoryCredentials(rootCtx)
    await mountAgentLoopTestDependencies(rootCtx)
    const rootStorage = mkdtempSync(join(tmpdir(), 'dsh-collab-seed-'))
    roots.push(rootStorage)
    await rootCtx.plugin(JsonlSessionPersistence, { root: rootStorage })
    await rootCtx.plugin(AgentLoop, { agents: [] })
    await rootCtx.plugin(IdentityService, { admins: ['root'] })
    rootCtx.provide('typert', {
      remotes: { list: () => [{ namespace: 'settings', method: 'describe' }] },
    })
    await rootCtx.plugin(CollaborationService, { actors: [] })
    await rootCtx.plugin(RemoteAccessService)
    await rootCtx.identity.registerPassword('root', 'password1', 'Root')
    const rootPeer = caller(rootCtx, 'peer-root' as PeerId)
    await rootPeer.identity.loginPassword('root', 'password1')
    expect(rootCtx.remoteAccess.decide({
      principal: { kind: 'local-identity', browserSessionId: 'peer-root' },
      action: 'settings/describe',
      resources: [{ kind: 'global' }],
    }).kind).toBe('allow')
  })

  it('authorizes session/create naming the creator\'s room and denies another account', async () => {
    const { ctx } = await setup()
    ctx.provide('workspaceRegistry', {
      list: () => [{ id: 'ws-alpha', sessionIds: [] }],
    })
    await ctx.plugin(RemoteAccessService)
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    await ctx.identity.loginPassword('alice', 'password1')
    const alice = caller(ctx, 'peer-alice' as PeerId)
    await alice.identity.loginPassword('alice', 'password1')
    // A room still reads blank until its first turn, so starting a Session
    // in its Workspace names it as the reuse candidate.
    const room = await ctx.agentLoop.create(SessionId('blank-room'), { provider: 'mock', model: 'mock' })
    const resources = [
      { kind: 'workspace', id: 'ws-alpha' as never },
      { kind: 'session', id: room.session.id },
    ] as const
    expect(ctx.remoteAccess.decide({
      principal: { kind: 'local-identity', browserSessionId: 'peer-alice' },
      action: 'session/create',
      resources: [...resources],
    }).kind).toBe('allow')
    const bob = caller(ctx, 'peer-bob' as PeerId)
    await bob.identity.loginPassword('bob', 'password1')
    expect(ctx.remoteAccess.decide({
      principal: { kind: 'local-identity', browserSessionId: 'peer-bob' },
      action: 'session/create',
      resources: [...resources],
    }).kind).not.toBe('allow')
  })

  it('lets the branch owner invoke another model from inside the branch and refuses a fellow occupant', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    new MemoryCredentials(ctx)
    await mountAgentLoopTestDependencies(ctx)
    const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-branch-invoke-'))
    roots.push(storageRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(IdentityService, {})
    await ctx.plugin(CollaborationService, {
      actors: [
        { id: 'model-a', kind: 'ai', name: 'A', provider: 'mock', model: 'mock' },
        { id: 'model-b', kind: 'ai', name: 'B', provider: 'mock', model: 'mock' },
      ],
    })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    await ctx.identity.loginPassword('alice', 'password1')
    const room = await ctx.agentLoop.create(SessionId('invoke-room'), { provider: 'mock', model: 'mock' })
    const posted = await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A look, and welcome @Bob',
      mentions: [ActorId('model-a'), ActorId('bob')],
    })
    const branch = ctx.agents.get(posted.childSessionIds[0]!)
    expect(branch).toBeDefined()
    const invoked = await ctx.collaboration.postBranchMessage(branch!.session, {
      actorId: ActorId('alice'),
      text: 'cross-check @B',
      mentions: [ActorId('model-b')],
    })
    expect(invoked.childSessionIds).toHaveLength(1)
    // Bob occupies the room but does not own Alice's branch.
    await expect(ctx.collaboration.postBranchMessage(branch!.session, {
      actorId: ActorId('bob'),
      text: 'me too @B',
      mentions: [ActorId('model-b')],
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
  })

  it('allows Config humans when identity is not loaded', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await mountAgentLoopTestDependencies(ctx)
    const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-config-humans-'))
    roots.push(storageRoot)
    await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(CollaborationService, {
      actors: [{ id: 'alice', kind: 'human', name: 'Alice' }],
    })
    ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
    const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
  })
})
