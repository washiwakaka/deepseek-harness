import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import CollaborationService, {
  ActorId,
  COLLABORATION_MENTION_INSTRUCTION,
  ROOM_ASSISTANT_LABEL,
  ROOM_USER_LABEL,
  branchTitle,
} from '../src/index.ts'
import { childOf, collaborationProjectionDefinition } from '../src/projection.ts'
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

async function mountCollab(storageRoot: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CollaborationService, { actors: roster })
  ctx.llm.registerAdapter(['mock'], new MockAdapter(script))
  return ctx
}

async function setupAt(storageRoot: string, script: ConstructorParameters<typeof MockAdapter>[0]) {
  const ctx = await mountCollab(storageRoot, script)
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  return { ctx, room }
}

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-mention-'))
  roots.push(storageRoot)
  return setupAt(storageRoot, script)
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

function childFor(
  session: Parameters<typeof project>[0],
  owner: string,
  actor: string,
): SessionId | undefined {
  return childOf(project(session), ActorId(owner), ActorId(actor))
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
    const childId = childOf(afterFirst, ActorId('alice'), ActorId('model-a'))
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
    await ctx.collaboration.publishFromChild(child!.session, ActorId('alice'))
    expect(project(room.session).messages.map(message => message.text)).toEqual([
      'hello',
      '@A please look',
      'A first',
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
      'A first',
      'more context',
      '@A again',
    ])
    await ctx.collaboration.publishFromChild(child!.session, ActorId('alice'))
    const published = project(room.session)
    expect(published.messages.map(message => message.text)).toEqual([
      'hello',
      '@A please look',
      'A first',
      'more context',
      '@A again',
      'A second',
    ])
    expect(published.messages.at(-1)).toMatchObject({
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
    const childId = childFor(room.session, 'alice', 'model-a')
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

  it('gives B the full room-visible transcript including the published A reply', async () => {
    const { ctx, room } = await setup([
      textResponse('A first'),
      textResponse('B first'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const childA = ctx.agents.get(childFor(room.session, 'alice', 'model-a')!)
    await childA!.whenIdle()
    expect(project(room.session).messages.map(message => message.text)).toEqual(['@A'])
    await ctx.collaboration.publishFromChild(childA!.session, ActorId('alice'))
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@B',
      mentions: [ActorId('model-b')],
    })
    const state = project(room.session)
    expect(Object.keys(state.children)).toHaveLength(2)
    const childB = ctx.agents.get(childOf(state, ActorId('alice'), ActorId('model-b'))!)
    const task = childB!.session.deriveMessages().find(message => message.role === 'user')
    expect(task?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'B')}\n\n[Alice] @A\n[A] A first\n[Alice] @B`,
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
    const childId = childOf(state, ActorId('alice'), ActorId('mock/mock'))
    expect(posted.childSessionIds).toEqual([childId])
    expect(childId).toBeDefined()
    const child = ctx.agents.get(childId!)
    expect(child?.options).toMatchObject({ provider: 'mock', model: 'mock' })
    await child!.whenIdle()
    expect(project(room.session).messages.map(message => message.text)).not.toContain('from catalog')
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

  it('gives each human a private child for the same model and refuses another occupant publishing it', async () => {
    const { ctx, room } = await setup([
      textResponse('from bob'),
      textResponse('from alice'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob look',
      mentions: [ActorId('bob')],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const state = project(room.session)
    const bobChild = childOf(state, ActorId('bob'), ActorId('model-a'))
    const aliceChild = childOf(state, ActorId('alice'), ActorId('model-a'))
    expect(bobChild).toBeDefined()
    expect(aliceChild).toBeDefined()
    expect(aliceChild).not.toBe(bobChild)
    expect(state.childOwners[bobChild!]).toBe(ActorId('bob'))
    expect(state.childOwners[aliceChild!]).toBe(ActorId('alice'))
    const bobAgent = ctx.agents.get(bobChild!)
    expect(bobAgent).toBeDefined()
    await expect(ctx.collaboration.publishFromChild(bobAgent!.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
  })

  it('refuses publish on the room Session', async () => {
    const { ctx, room } = await setup([])
    await expect(ctx.collaboration.publishFromChild(room.session, ActorId('alice'))).rejects.toThrow(/not a collaboration branch/)
  })

  it('names a branch after its model and owner, and attaches it under the room', async () => {
    expect(branchTitle('Qwen-Plus')).toBe('Qwen-Plus 分叉')
    expect(branchTitle('Qwen-Plus', '  ')).toBe('Qwen-Plus 分叉')
    expect(branchTitle('Qwen-Plus', 'Alice')).toBe('Qwen-Plus 分叉 · Alice')
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
    const childId = childFor(room.session, 'alice', 'model-a')
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: childId }), 'A 分叉 · Alice')
    expect(attachSession).toHaveBeenCalledWith(childId)
    expect(insertSessionBefore).toHaveBeenCalledWith(childId, undefined)
    expect(ctx.agents.get(childId!)?.session.header.parentSession).toBe(room.session.id)
    expect(ctx.agents.get(childId!)?.session.header.origin).toBeUndefined()
    rename.mockClear()
    titleOf = (session: { id: string }) => session.id === room.session.id
      ? { title: 'Design review', source: { kind: 'user' as const } }
      : { title: 'A 分叉 · Alice', source: { kind: 'user' as const } }
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
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: childId }), 'A 分叉 · Alice')
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

  it('opens a new child when the same model is mentioned from a second room', async () => {
    const { ctx, room } = await setup([
      textResponse('A in first'),
      textResponse('A in second'),
    ])
    const other = await ctx.agentLoop.create(SessionId('room-two'), { provider: 'mock', model: 'mock' })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    await ctx.collaboration.postMessage(other.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const first = childFor(room.session, 'alice', 'model-a')
    const second = childFor(other.session, 'alice', 'model-a')
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    expect(ctx.agents.get(first!)?.session.header.parentSession).toBe(room.session.id)
    expect(ctx.agents.get(second!)?.session.header.parentSession).toBe(other.session.id)
  })

  it('cold-resumes the persisted AI child after the Host process restarts', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-resume-'))
    roots.push(storageRoot)
    const first = await setupAt(storageRoot, [
      textResponse('A first'),
      textResponse('A after restart'),
    ])
    await first.ctx.collaboration.postMessage(first.room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const childId = childFor(first.room.session, 'alice', 'model-a')
    expect(childId).toBeDefined()
    const roomId = first.room.session.id
    const firstIndex = contexts.indexOf(first.ctx)
    if (firstIndex >= 0) contexts.splice(firstIndex, 1)
    await first.ctx.fiber.dispose()
    const ctx2 = await mountCollab(storageRoot, [textResponse('A after restart')])
    expect(ctx2.agents.get(childId!)).toBeUndefined()
    const insertSessionBefore = vi.fn(async () => {})
    stubService(ctx2, 'workspaceRegistry', {
      list: () => [{
        sessionIds: [childId!],
        attachSession: async () => {},
        insertSessionBefore,
      }],
    })
    const room = (await ctx2.agents.resume({ resumeSessionId: roomId })).agent
    await ctx2.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    expect(childFor(room.session, 'alice', 'model-a')).toBe(childId)
    expect(insertSessionBefore).not.toHaveBeenCalled()
    const live = ctx2.agents.get(childId!)
    expect(live).toBeDefined()
    await live!.whenIdle()
    const userTurns = live!.session.deriveMessages().filter(message => message.role === 'user')
    expect(userTurns).toHaveLength(2)
  })

  it('re-derives the branch owner name from the room record when a cold child is named again', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-resume-name-'))
    roots.push(storageRoot)
    const first = await setupAt(storageRoot, [textResponse('A first')])
    await first.ctx.collaboration.postMessage(first.room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const childId = childFor(first.room.session, 'alice', 'model-a')
    expect(childId).toBeDefined()
    const roomId = first.room.session.id
    const firstIndex = contexts.indexOf(first.ctx)
    if (firstIndex >= 0) contexts.splice(firstIndex, 1)
    await first.ctx.fiber.dispose()
    const ctx2 = await mountCollab(storageRoot, [textResponse('A after restart')])
    const rename = vi.fn()
    stubService(ctx2, 'sessionTitle', {
      get: () => undefined,
      rename,
    })
    const room = (await ctx2.agents.resume({ resumeSessionId: roomId })).agent
    await ctx2.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    expect(rename).toHaveBeenCalledWith(expect.objectContaining({ id: childId }), 'A 分叉 · Alice')
  })

  it('reports a persisted child that cannot resume as a failed mention instead of failing the post', async () => {
    const { ctx, room } = await setup([textResponse('A first')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    vi.spyOn(ctx.agents, 'get').mockReturnValue(undefined)
    vi.spyOn(ctx.agents, 'resume').mockRejectedValue(new Error('missing log'))
    const posted = await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    expect(posted.childSessionIds).toEqual([])
    expect(posted.failedActorIds).toEqual([ActorId('model-a')])
  })

  it('places the branch after the room when the Workspace already lists the child', async () => {
    const { ctx, room } = await setup([textResponse('A first')])
    const sessionIds: SessionId[] = [room.session.id]
    const insertSessionBefore = vi.fn(async () => {})
    stubService(ctx, 'workspaceRegistry', {
      list: () => [{
        get sessionIds() {
          return sessionIds
        },
        attachSession: async (id: SessionId) => {
          if (!sessionIds.includes(id)) sessionIds.unshift(id)
        },
        insertSessionBefore,
      }],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A',
      mentions: [ActorId('model-a')],
    })
    const childId = childFor(room.session, 'alice', 'model-a')
    expect(insertSessionBefore).toHaveBeenCalledWith(childId, undefined)
    expect(insertSessionBefore).toHaveBeenCalledTimes(1)
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

describe('collaboration branch invokes', () => {
  async function setupBranch(script: ConstructorParameters<typeof MockAdapter>[0]) {
    const { ctx, room } = await setup(script)
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
    const posted = await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A please look',
      mentions: [ActorId('model-a')],
    })
    const branch = ctx.agents.get(posted.childSessionIds[0]!)
    expect(branch).toBeDefined()
    await branch!.whenIdle()
    return { ctx, room, branch: branch! }
  }

  it('forks a sub-branch from inside a branch, deltas the next invoke, and publishes back to the branch', async () => {
    const { ctx, room, branch } = await setupBranch([
      textResponse('A first'),
      textResponse('B verdict'),
      textResponse('B second'),
    ])
    const invoked = await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'cross-check this @B',
      mentions: [ActorId('model-b')],
    })
    expect(invoked.failedActorIds).toEqual([])
    const subId = invoked.childSessionIds[0]!
    const sub = ctx.agents.get(subId)
    expect(sub).toBeDefined()
    await sub!.whenIdle()
    expect(ctx.collaboration.branchOf(sub!.session)).toEqual({
      roomId: branch.session.id,
      actorId: ActorId('model-b'),
    })
    // Only the sub-branch's own reply is publishable from it; the parent
    // branch's reply is inherited and stays off the list.
    const ownReplyIds = (session: typeof branch.session) => session.snapshotEvents().flatMap(event =>
      event.type === 'assistant/message' && event.seq >= session.inheritedEventCount
        ? [event.data.message.id]
        : [])
    const verdictId = sub!.session.snapshotEvents().flatMap(event =>
      event.type === 'assistant/message'
      && event.data.message.content.some(block => block.type === 'text' && block.text === 'B verdict')
        ? [event.data.message.id]
        : [])[0]
    expect(ctx.collaboration.branchReplyIds(sub!.session)).toEqual([verdictId])
    expect(ctx.collaboration.branchReplyIds(sub!.session))
      .not.toContain(ownReplyIds(branch.session)[0])
    expect(ctx.collaboration.branchReplyIds(branch.session)).toEqual(ownReplyIds(branch.session))

    const firstTask = sub!.session.deriveMessages().find(message =>
      message.role === 'user'
      && message.content.some(block => block.type === 'text' && block.text.startsWith('You are B')))
    expect(firstTask?.content).toEqual([{
      type: 'text',
      text: `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'B')}\n\n[Alice] hello\n[Alice] @A please look\n[Assistant] A first\n[Alice] cross-check this @B`,
    }])

    // The reply stays on the sub-branch until its owner publishes it to the
    // branch; the room never sees it.
    await ctx.collaboration.publishFromChild(sub!.session, ActorId('alice'))
    const branchState = project(branch.session)
    expect(branchState.messages.map(message => message.text)).toContain('B verdict')
    expect(project(room.session).messages.map(message => message.text)).not.toContain('B verdict')
    await expect(ctx.collaboration.publishFromChild(sub!.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_ALREADY_PUBLISHED' })

    const again = await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'once more @B',
      mentions: [ActorId('model-b')],
    })
    expect(again.childSessionIds).toEqual([subId])
    await sub!.whenIdle()
    const tasks = sub!.session.deriveMessages()
      .filter(message => message.role === 'user')
      .map(message => message.content.map(block => block.type === 'text' ? block.text : '').join(''))
      .filter(text => text.startsWith('You are B'))
    expect(tasks).toHaveLength(2)
    expect(tasks[1]).toContain('[Alice] once more @B')
    expect(tasks[1]).not.toContain('hello')
    expect(tasks[1]).not.toContain('A first')
  })

  it('reports a sub-branch that cannot resume as failed instead of failing the branch post', async () => {
    const { ctx, branch } = await setupBranch([
      textResponse('A first'),
      textResponse('B verdict'),
    ])
    await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'check @B',
      mentions: [ActorId('model-b')],
    })
    vi.spyOn(ctx.agents, 'get').mockReturnValue(undefined)
    vi.spyOn(ctx.agents, 'resume').mockRejectedValue(new Error('missing log'))
    const again = await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'again @B',
      mentions: [ActorId('model-b')],
    })
    expect(again.childSessionIds).toEqual([])
    expect(again.failedActorIds).toEqual([ActorId('model-b')])
  })

  it('refuses branch invokes from non-owners, human mentions, and non-branch Sessions', async () => {
    const { ctx, room, branch } = await setupBranch([textResponse('A first')])
    await expect(ctx.collaboration.postBranchMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'not a branch',
      mentions: [ActorId('model-b')],
    })).rejects.toMatchObject({ code: 'COLLAB_NOT_BRANCH' })
    await expect(ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('bob'),
      text: 'not my branch',
      mentions: [ActorId('model-b')],
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    await expect(ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'hi @Bob',
      mentions: [ActorId('bob')],
    })).rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })

    const plain = await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'note for the branch',
    })
    expect(plain).toEqual({ childSessionIds: [], failedActorIds: [] })
    expect(project(branch.session).messages.map(message => message.text)).toContain('note for the branch')
  })

  it('admits any parent occupant from a legacy branch without a recorded owner', async () => {
    const { ctx, room } = await setup([
      textResponse('legacy reply'),
      textResponse('B reply'),
    ])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'hello',
    })
    // A legacy branch: a seeded fork carrying a mention source, but no
    // branch-opened event recording its owner on the room.
    const events = room.session.snapshotEvents()
    const boundary = events.at(-1)!.seq
    const legacy = await ctx.agents.create({
      sessionId: SessionId('legacy-branch'),
      seed: buildForkSeed(events, boundary),
      inheritedEventCount: SessionLogOffset(boundary + 1),
      meta: { isSeeded: true, parentSession: room.session.id },
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    legacy.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'legacy task' }],
      source: {
        kind: 'collaboration-mention',
        roomId: room.session.id,
        actorId: ActorId('model-a'),
        throughSeq: boundary,
      },
    }))
    await legacy.agent.whenIdle()
    const invoked = await ctx.collaboration.postBranchMessage(legacy.agent.session, {
      actorId: ActorId('alice'),
      text: 'cross-check @B',
      mentions: [ActorId('model-b')],
    })
    expect(invoked.childSessionIds).toHaveLength(1)
    // Bob never joined the room, so the legacy fallback refuses him.
    await expect(ctx.collaboration.postBranchMessage(legacy.agent.session, {
      actorId: ActorId('bob'),
      text: 'me too @B',
      mentions: [ActorId('model-b')],
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    await legacy.dispose()
  })

  it('nests one more level from a sub-branch', async () => {
    const { ctx, branch } = await setupBranch([
      textResponse('A first'),
      textResponse('B verdict'),
      textResponse('A cross-check'),
    ])
    const invoked = await ctx.collaboration.postBranchMessage(branch.session, {
      actorId: ActorId('alice'),
      text: 'check @B',
      mentions: [ActorId('model-b')],
    })
    const sub = ctx.agents.get(invoked.childSessionIds[0]!)
    await sub!.whenIdle()
    const nested = await ctx.collaboration.postBranchMessage(sub!.session, {
      actorId: ActorId('alice'),
      text: 'and you @A',
      mentions: [ActorId('model-a')],
    })
    expect(nested.failedActorIds).toEqual([])
    const grandchild = ctx.agents.get(nested.childSessionIds[0]!)
    expect(grandchild).toBeDefined()
    await grandchild!.whenIdle()
    expect(ctx.collaboration.branchOf(grandchild!.session)).toEqual({
      roomId: sub!.session.id,
      actorId: ActorId('model-a'),
    })
  })
})

describe('collaboration default titles', () => {
  async function setupWithTitles(script: ConstructorParameters<typeof MockAdapter>[0]) {
    const base = await setup(script)
    await base.ctx.plugin(SessionTitleService, { fallbackMaxWords: 8, fallbackMaxBytes: 64, maxTitleBytes: 256 })
    return base
  }

  it('upgrades the default session title to the room title on claim', async () => {
    const { ctx, room } = await setupWithTitles([])
    ctx.sessionTitle.initialize(room.session, 'Alice 的会话')
    await ctx.collaboration.claimRoom(room.session, ActorId('alice'))
    expect(ctx.sessionTitle.get(room.session)).toMatchObject({
      title: 'Alice 的协作房间',
      source: { kind: 'default' },
    })
  })

  it('names the room on its first post and the branch after model and owner', async () => {
    const { ctx, room } = await setupWithTitles([textResponse('A reply')])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'first post',
    })
    expect(ctx.sessionTitle.get(room.session)).toMatchObject({
      title: 'Alice 的协作房间',
      source: { kind: 'default' },
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A look',
      mentions: [ActorId('model-a')],
    })
    const childId = childFor(room.session, 'alice', 'model-a')
    const child = ctx.agents.get(childId!)
    expect(child).toBeDefined()
    expect(ctx.sessionTitle.get(child!.session)?.title).toBe('A 分叉 · Alice')
  })

  it('keeps the creator in the room title when another occupant posts', async () => {
    const { ctx, room } = await setupWithTitles([])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob welcome',
      mentions: [ActorId('bob')],
    })
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: 'thanks',
    })
    expect(ctx.sessionTitle.get(room.session)?.title).toBe('Alice 的协作房间')
  })

  it('does not rename a room the user already named', async () => {
    const { ctx, room } = await setupWithTitles([])
    await ctx.collaboration.claimRoom(room.session, ActorId('alice'))
    ctx.sessionTitle.rename(room.session, 'Release war room')
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: 'status',
    })
    expect(ctx.sessionTitle.get(room.session)?.title).toBe('Release war room')
  })
})
