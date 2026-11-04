import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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

function caller(ctx: Context, id: string): Context {
  const peer = {
    id: id as PeerId,
    ctx,
    principal: { kind: 'local-identity' as const, browserSessionId: id as PeerId },
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
    const alice = caller(ctx, 'peer-alice')
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
    const alice = caller(ctx, 'peer-alice')
    await alice.identity.loginPassword('alice', 'password1')
    const handle = await ctx.agents.create({
      sessionId: SessionId('cold-owned'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    await alice.serial('api-session/conversation-created', { agent: handle.agent, peerId: 'peer-alice' })
    const sessionId = handle.agent.session.id
    await handle.dispose()
    expect(ctx.sessions.get(sessionId)).toBeUndefined()
    expect(ctx.remoteAccess.decide({
      principal: { kind: 'local-identity', browserSessionId: 'peer-alice' as PeerId },
      action: 'session/list',
      resources: [{ kind: 'session', id: sessionId }],
    }).kind).toBe('allow')
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
