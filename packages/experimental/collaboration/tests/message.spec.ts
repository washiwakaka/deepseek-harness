import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { MockAdapter } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CollaborationService, { ActorId, CollaborationError } from '../src/index.ts'
import { collaborationProjectionDefinition } from '../src/projection.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const roster = [
  { id: 'alice', kind: 'human' as const, name: 'Alice' },
  { id: 'bob', kind: 'human' as const, name: 'Bob' },
  { id: 'model-a', kind: 'ai' as const, name: 'A', provider: 'mock', model: 'mock' },
]

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-'))
  roots.push(storageRoot)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CollaborationService, { actors: roster })
  ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  return { ctx, room }
}

describe('collaboration postMessage', () => {
  it('rejects invalid Config at construction', () => {
    expect(() => new CollaborationService(new Context(), { actors: [] })).toThrow(/at least one occupant/)
    expect(() => new CollaborationService(new Context(), {
      actors: [{ id: 'a', kind: 'ai', name: 'A' }],
    })).toThrow(/needs provider and model/)
    expect(() => new CollaborationService(new Context(), {
      actors: [{ id: '', kind: 'human', name: 'A' }],
    })).toThrow(/non-empty id and name/)
    expect(() => new CollaborationService(new Context(), {
      actors: [
        { id: 'a', kind: 'human', name: 'A' },
        { id: 'a', kind: 'human', name: 'B' },
      ],
    })).toThrow(/duplicate actor id/)
    expect(() => new CollaborationService(new Context(), {
      actors: [{ id: 'a', kind: 'robot' as 'human', name: 'A' }],
    })).toThrow(/unknown kind/)
    expect(() => new CollaborationService(new Context(), {
      actors: roster,
      maxMessageBytes: 0,
    })).toThrow(/positive safe integer/)
  })

  it('uses the Host default roster when Config omits actors', () => {
    const ctx = new Context()
    const service = new CollaborationService(ctx, {})
    expect(service.listActors().map(actor => actor.id)).toEqual([
      ActorId('alice'),
      ActorId('bob'),
    ])
  })

  it('appends unmentioned human lines without a room turn or child followup', async () => {
    const { ctx, room } = await setup()
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: 'hi',
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob join',
      mentions: [ActorId('bob')],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: 'hi',
    })
    const projected = collaborationProjectionDefinition.init(room.session.header, room.session.inheritedEventCount)
    let state = projected
    for (const event of room.session.snapshotEvents()) {
      state = collaborationProjectionDefinition.apply(state, event)
    }
    expect(state.failure).toBeUndefined()
    expect(state.messages.map(message => ({ name: message.name, text: message.text }))).toEqual([
      { name: 'Alice', text: 'hello' },
      { name: 'Alice', text: '@Bob join' },
      { name: 'Bob', text: 'hi' },
    ])
    expect(state.occupants).toEqual([ActorId('alice'), ActorId('bob')])
    expect(state.children).toEqual({})
    expect(room.session.snapshotEvents().some(event => event.type === 'turn/start')).toBe(false)
    expect(ctx.agents.list().filter(agent => agent.id !== room.id)).toEqual([])
    expect(ctx.collaboration.listActors().map(actor => actor.id)).toEqual([
      ActorId('alice'),
      ActorId('bob'),
      ActorId('model-a'),
    ])
  })

  it('rejects unknown authors and empty text', async () => {
    const { ctx, room } = await setup()
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('nobody'),
      text: 'hello',
    })).rejects.toBeInstanceOf(CollaborationError)
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '',
    })).rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@qwen',
      mentions: [ActorId('qwen-token-plan/qwen-plus')],
    })).rejects.toMatchObject({ code: 'COLLAB_UNKNOWN_ACTOR' })
    await expect(ctx.collaboration.listMentionModels(ActorId('model-a'))).rejects.toMatchObject({
      code: 'COLLAB_NOT_HUMAN',
    })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'x'.repeat(70_000),
    })).rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
  })

  it('claims an empty room for the first human and hides it from others until @', async () => {
    const { ctx, room } = await setup()
    await ctx.collaboration.claimRoom(room.session, ActorId('alice'))
    let state = collaborationProjectionDefinition.init(room.session.header, room.session.inheritedEventCount)
    for (const event of room.session.snapshotEvents()) {
      state = collaborationProjectionDefinition.apply(state, event)
    }
    expect(state.occupants).toEqual([ActorId('alice')])
    await expect(ctx.collaboration.claimRoom(room.session, ActorId('bob'))).rejects.toMatchObject({
      code: 'COLLAB_ACCESS_DENIED',
    })
  })
})
