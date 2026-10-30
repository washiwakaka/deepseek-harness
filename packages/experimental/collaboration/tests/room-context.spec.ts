import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CollaborationService, {
  ActorId,
  COLLABORATION_ROOM_CONTEXT_INSTRUCTION,
} from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const roster = [
  { id: 'alice', kind: 'human' as const, name: 'Alice' },
  { id: 'model-a', kind: 'ai' as const, name: 'A', provider: 'mock', model: 'mock' },
]

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-room-context-'))
  roots.push(storageRoot)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CollaborationService, { actors: roster })
  ctx.llm.registerAdapter(['mock'], new MockAdapter(script))
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  return { ctx, room }
}

function send(agent: Awaited<ReturnType<typeof setup>>['room'], text: string): void {
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
}

describe('room Agent context admit', () => {
  it('does not inject on an ordinary Send', async () => {
    const { ctx, room } = await setup([textResponse('ok')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello room',
    })
    send(room, 'hello')
    await room.whenIdle()
    const users = room.session.deriveMessages().filter(message => message.role === 'user')
    expect(users).toHaveLength(1)
    expect(users[0]?.source.kind).toBe('user')
  })

  it('logs unmentioned room lines before the next Send', async () => {
    const { ctx, room } = await setup([textResponse('noted')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello room',
    })
    await ctx.collaboration.admitRoomContext(room.session, ActorId('alice'))
    send(room, 'what did Alice say?')
    await room.whenIdle()
    const users = room.session.deriveMessages().filter(message => message.role === 'user')
    expect(users).toHaveLength(2)
    expect(users[0]?.source.kind).toBe('collaboration-room-context')
    expect(users[0]?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n[Alice] hello room`,
    }])
    expect(users[1]?.content).toEqual([{ type: 'text', text: 'what did Alice say?' }])
  })

  it('does nothing when the room has no peer lines', async () => {
    const { ctx, room } = await setup([textResponse('ok')])
    await ctx.collaboration.admitRoomContext(room.session, ActorId('alice'))
    send(room, 'hello')
    await room.whenIdle()
    const users = room.session.deriveMessages().filter(message => message.role === 'user')
    expect(users).toHaveLength(1)
    expect(users[0]?.source.kind).toBe('user')
  })

  it('logs only the room delta on a later admit', async () => {
    const { ctx, room } = await setup([
      textResponse('first'),
      textResponse('second'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'one',
    })
    await ctx.collaboration.admitRoomContext(room.session, ActorId('alice'))
    send(room, 'read one')
    await room.whenIdle()
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'two',
    })
    await ctx.collaboration.admitRoomContext(room.session, ActorId('alice'))
    send(room, 'read two')
    await room.whenIdle()
    await ctx.collaboration.admitRoomContext(room.session, ActorId('alice'))
    const users = room.session.deriveMessages().filter(message => message.role === 'user')
    const injected = users.filter(message => message.source.kind === 'collaboration-room-context')
    expect(injected).toHaveLength(2)
    expect(injected[1]?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n[Alice] two`,
    }])
  })

  it('admits then followups in one sendWithRoom call', async () => {
    const { ctx, room } = await setup([textResponse('noted')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello room',
    })
    await ctx.collaboration.sendWithRoom(room, 'what did Alice say?', ActorId('alice'))
    await room.whenIdle()
    const users = room.session.deriveMessages().filter(message => message.role === 'user')
    expect(users).toHaveLength(2)
    expect(users[0]?.source.kind).toBe('collaboration-room-context')
    expect(users[1]?.content).toEqual([{ type: 'text', text: 'what did Alice say?' }])
  })

  it('rejects a blank sendWithRoom draft', async () => {
    const { ctx, room } = await setup([])
    await expect(ctx.collaboration.sendWithRoom(room, '   ', ActorId('alice'))).rejects.toMatchObject({
      code: 'COLLAB_INVALID_ARGUMENT',
    })
  })

  it('skips a seeded child Session', async () => {
    const { ctx, room } = await setup([textResponse('A first')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello room',
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const opened = room.session.snapshotEvents().find(event => event.type === 'collaboration/branch-opened')
    if (opened === undefined || opened.type !== 'collaboration/branch-opened') {
      throw new Error('expected an AI child')
    }
    const child = ctx.agents.get(opened.data.childSessionId)
    if (child === undefined) throw new Error('expected a live AI child')
    await ctx.collaboration.admitRoomContext(child.session, ActorId('alice'))
    expect(child.session.deriveMessages().some(message => message.source.kind === 'collaboration-room-context')).toBe(false)
  })
})
