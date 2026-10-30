import { afterEach, describe, expect, it, vi } from 'vitest'
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
  COLLABORATION_MENTION_INSTRUCTION,
  ROOM_ASSISTANT_LABEL,
  ROOM_USER_LABEL,
  branchTitle,
} from '../src/index.ts'
import { collaborationProjectionDefinition } from '../src/projection.ts'
import type { CollaborationProjectionState } from '../src/projection.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function stubService(ctx: Context, name: 'sessionTitle' | 'workspaceRegistry', value: object): void {
  const existing = ctx.get(name)
  if (existing === undefined) {
    ctx.provide(name, value as never)
    return
  }
  for (const [key, next] of Object.entries(value)) {
    vi.spyOn(existing as never as Record<string, (...args: never[]) => unknown>, key)
      .mockImplementation(next as never)
  }
}

const roster = [
  { id: 'alice', kind: 'human' as const, name: 'Alice' },
  { id: 'bob', kind: 'human' as const, name: 'Bob' },
  { id: 'model-a', kind: 'ai' as const, name: 'A', provider: 'mock', model: 'mock' },
  { id: 'model-b', kind: 'ai' as const, name: 'B', provider: 'mock', model: 'mock' },
]

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-mention-'))
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

function project(session: {
  header: Parameters<typeof collaborationProjectionDefinition.init>[0]
  inheritedEventCount: Parameters<typeof collaborationProjectionDefinition.init>[1]
  snapshotEvents: () => readonly { type: string }[]
}): CollaborationProjectionState {
  let state = collaborationProjectionDefinition.init(session.header, session.inheritedEventCount)
  for (const event of session.snapshotEvents()) {
    state = collaborationProjectionDefinition.apply(state, event as never)
  }
  if (state.failure !== undefined) throw new Error(state.failure)
  return state
}

describe('collaboration mentions', () => {
  it('forks A once, compiles prior lines, keeps the reply on the branch, and deltas the next @', async () => {
    const { ctx, room } = await setup([
      textResponse('A first'),
      textResponse('A second'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
    const first = await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A please look',
      mentions: [ActorId('model-a')],
    })
    const afterFirst = project(room.session)
    expect(Object.keys(afterFirst.children)).toHaveLength(1)
    const childId = afterFirst.children[ActorId('model-a')]
    expect(first.childSessionIds).toEqual([childId])
    expect(childId).toBeDefined()
    const child = ctx.agents.get(childId!)
    expect(child).toBeDefined()
    await child!.whenIdle()
    const firstTask = child!.session.deriveMessages().find(message => message.role === 'user')
    expect(firstTask?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[Alice] hello\n[Alice] @A please look`,
    }])
    expect(afterFirst.messages.map(message => message.text)).toEqual([
      'hello',
      '@A please look',
    ])
    expect(room.session.snapshotEvents().some(event => event.type === 'tool/call')).toBe(false)

    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'more context',
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    await child!.whenIdle()
    const afterSecond = project(room.session)
    expect(Object.keys(afterSecond.children)).toEqual(Object.keys(afterFirst.children))
    const userTurns = child!.session.deriveMessages().filter(message => message.role === 'user')
    expect(userTurns).toHaveLength(2)
    expect(userTurns[1]?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[Alice] more context\n[Alice] @A again`,
    }])
    expect(afterSecond.messages.map(message => message.text)).toEqual([
      'hello',
      '@A please look',
      'more context',
      '@A again',
    ])
    await ctx.collaboration.publishFromChild(child!.session, ActorId('alice'))
    expect(project(room.session).messages.at(-1)).toMatchObject({
      kind: 'ai',
      name: 'A',
      text: 'A second',
    })
  })

  it('puts room-Agent user and assistant turns into the first mention task', async () => {
    const { ctx, room } = await setup([
      textResponse('room answered'),
      textResponse('A first'),
    ])
    send(room, 'please help')
    await room.whenIdle()
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A please look',
      mentions: [ActorId('model-a')],
    })
    const childId = project(room.session).children[ActorId('model-a')]
    const child = ctx.agents.get(childId!)
    await child!.whenIdle()
    const mentionTask = child!.session.deriveMessages().find(
      message => message.role === 'user' && message.source.kind === 'collaboration-mention',
    )
    expect(mentionTask?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[${ROOM_USER_LABEL}] please help\n[${ROOM_ASSISTANT_LABEL}] room answered\n[Alice] @A please look`,
    }])
  })

  it('gives B the full room-visible transcript without unpublished branch replies', async () => {
    const { ctx, room } = await setup([
      textResponse('A first'),
      textResponse('B first'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@B',
      mentions: [ActorId('model-b')],
    })
    const state = project(room.session)
    expect(Object.keys(state.children)).toHaveLength(2)
    const childB = ctx.agents.get(state.children[ActorId('model-b')]!)
    const task = childB!.session.deriveMessages().find(message => message.role === 'user')
    expect(task?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'B')}\n\n[Alice] @A\n[Alice] @B`,
    }])
    expect(childB!.session.snapshotEvents().some(event => event.type === 'tool/call')).toBe(false)
  })

  it('invokes a Settings catalog route on a child Agent', async () => {
    const { ctx, room } = await setup([textResponse('from catalog')])
    vi.spyOn(ctx.llm, 'listProviders').mockReturnValue([{ id: 'mock', name: 'Mock' }])
    vi.spyOn(ctx.llm, 'listModels').mockResolvedValue([{
      provider: 'mock',
      id: 'mock',
      name: 'Mock',
    }])
    const posted = await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Mock look',
      mentions: [ActorId('mock/mock')],
    })
    const state = project(room.session)
    const childId = state.children[ActorId('mock/mock')]
    expect(posted.childSessionIds).toEqual([childId])
    expect(childId).toBeDefined()
    const child = ctx.agents.get(childId!)
    expect(child?.options).toMatchObject({ provider: 'mock', model: 'mock' })
    expect(state.messages.map(message => message.text)).not.toContain('from catalog')
    await child!.whenIdle()
    await ctx.collaboration.publishFromChild(child!.session, ActorId('alice'))
    expect(project(room.session).messages.map(message => message.text)).toContain('from catalog')
  })

  it('invites a mentioned human without starting an AI branch', async () => {
    const { ctx, room } = await setup([])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob look',
      mentions: [ActorId('bob')],
    })
    const state = project(room.session)
    expect(state.occupants).toEqual([ActorId('alice'), ActorId('bob')])
    expect(state.children).toEqual({})
    expect(state.messages[0]?.mentions).toEqual([ActorId('bob')])
  })

  it('refuses publish on the room Session', async () => {
    const { ctx, room } = await setup([])
    await expect(ctx.collaboration.publishFromChild(room.session, ActorId('alice'))).rejects.toThrow(/not a collaboration branch/)
  })

  it('names a branch from the room title and model, and attaches it beside the room', async () => {
    expect(branchTitle(undefined, 'Qwen-Plus')).toBe('Qwen-Plus')
    expect(branchTitle('  ', 'Qwen-Plus')).toBe('Qwen-Plus')
    expect(branchTitle('Design review', 'Qwen-Plus')).toBe('Qwen-Plus · Design review')
    const { ctx, room } = await setup([
      textResponse('A first'),
      textResponse('A second'),
      textResponse('A third'),
      textResponse('A fourth'),
    ])
    const rename = vi.fn()
    const attachSession = vi.fn(async () => {})
    const insertSessionBefore = vi.fn(async () => {})
    let titleOf = (session: { id: string }) => session.id === room.session.id
      ? { title: 'Design review', source: { kind: 'user' as const } }
      : undefined
    stubService(ctx, 'sessionTitle', {
      get: (session: { id: string }) => titleOf(session),
      rename,
    })
    stubService(ctx, 'workspaceRegistry', {
      list: () => [{ sessionIds: [room.session.id], attachSession, insertSessionBefore }],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const childId = project(room.session).children[ActorId('model-a')]
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: childId }), 'A · Design review')
    expect(attachSession).toHaveBeenCalledWith(childId)
    expect(insertSessionBefore).toHaveBeenCalledWith(childId, room.session.id)
    rename.mockClear()
    titleOf = (session: { id: string }) => session.id === room.session.id
      ? { title: 'Design review', source: { kind: 'user' as const } }
      : { title: 'A · Design review', source: { kind: 'user' as const } }
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    expect(rename).not.toHaveBeenCalled()
    rename.mockClear()
    titleOf = (session: { id: string }) => session.id === room.session.id
      ? { title: 'Design review', source: { kind: 'user' as const } }
      : { title: 'Compiled dump', source: { kind: 'provider' as const, provider: 'llm' as never } } as never
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A dump',
      mentions: [ActorId('model-a')],
    })
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: childId }), 'A · Design review')
    rename.mockClear()
    titleOf = (session: { id: string }) => session.id === room.session.id
      ? { title: 'Design review', source: { kind: 'user' as const } }
      : { title: 'My notes', source: { kind: 'user' as const } }
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    expect(rename).not.toHaveBeenCalled()
  })

  it('keeps the room post when branch title or workspace attach fails', async () => {
    const { ctx, room } = await setup([textResponse('A first')])
    stubService(ctx, 'sessionTitle', {
      get: () => ({ title: 'Room' }),
      rename: () => { throw new Error('title invalid') },
    })
    stubService(ctx, 'workspaceRegistry', {
      list: () => [{
        sessionIds: [room.session.id],
        attachSession: async () => { throw new Error('cwd mismatch') },
        insertSessionBefore: async () => { throw new Error('not accounted') },
      }],
    })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })).resolves.toMatchObject({ childSessionIds: [expect.any(String)] })
  })

  it('keeps the room post when workspace order fails after attach', async () => {
    const { ctx, room } = await setup([textResponse('A first')])
    const attachSession = vi.fn(async () => {})
    stubService(ctx, 'workspaceRegistry', {
      list: () => [{
        sessionIds: [room.session.id],
        attachSession,
        insertSessionBefore: async () => { throw new Error('not accounted') },
      }],
    })
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })).resolves.toMatchObject({ childSessionIds: [expect.any(String)] })
    expect(attachSession).toHaveBeenCalled()
  })
})
