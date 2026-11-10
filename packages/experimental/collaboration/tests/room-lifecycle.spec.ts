import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CollaborationService, { ActorId } from '../src/index.ts'
import { childOf, collaborationProjectionDefinition } from '../src/projection.ts'
import type { CollaborationProjectionState } from '../src/projection.ts'

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

async function setup(script: ConstructorParameters<typeof MockAdapter>[0]) {
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-collab-lifecycle-'))
  roots.push(storageRoot)
  const ctx = await mountCollab(storageRoot, script)
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  return { ctx, room, storageRoot }
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

async function mentionedChild(
  ctx: Context,
  room: Awaited<ReturnType<typeof setup>>['room'],
) {
  await ctx.collaboration.postMessage(room.session, {
    actorId: ActorId('alice'),
    text: '@A please',
    mentions: [ActorId('model-a')],
  })
  const childId = childOf(project(room.session), ActorId('alice'), ActorId('model-a'))
  if (childId === undefined) throw new Error('expected a branch child')
  const child = ctx.agents.get(childId)
  if (child === undefined) throw new Error('expected a live branch child')
  await child.whenIdle()
  return child
}

describe('collaboration room lifecycle', () => {
  it('publishes from a branch after a restart without opening the room first', async () => {
    const first = await setup([textResponse('A reply')])
    const child = await mentionedChild(first.ctx, first.room)
    const childId = child.id
    const roomId = first.room.session.id
    const firstIndex = contexts.indexOf(first.ctx)
    if (firstIndex >= 0) contexts.splice(firstIndex, 1)
    await first.ctx.fiber.dispose()

    const ctx2 = await mountCollab(first.storageRoot, [])
    expect(ctx2.agents.get(roomId)).toBeUndefined()
    const resumedChild = (await ctx2.agents.resume({ resumeSessionId: childId })).agent
    await ctx2.collaboration.publishFromChild(resumedChild.session, ActorId('alice'))
    const room = ctx2.agents.get(roomId)
    if (room === undefined) throw new Error('publish should cold-resume the room')
    const aiLines = project(room.session).messages.filter(message => message.kind === 'ai')
    expect(aiLines.map(message => message.text)).toEqual(['A reply'])
  })

  it('reports a branch whose room can no longer be resumed', async () => {
    const first = await setup([textResponse('A reply')])
    const child = await mentionedChild(first.ctx, first.room)
    const childId = child.id
    const firstIndex = contexts.indexOf(first.ctx)
    if (firstIndex >= 0) contexts.splice(firstIndex, 1)
    await first.ctx.fiber.dispose()
    const roomEntries = readdirSync(first.storageRoot, { recursive: true })
      .map((name): string => String(name))
      .filter(name => name.split(/[\\/]/).at(-1) === 'room')
    expect(roomEntries.length).toBeGreaterThan(0)
    for (const entry of roomEntries) {
      rmSync(join(first.storageRoot, entry), { recursive: true, force: true })
    }
    const ctx2 = await mountCollab(first.storageRoot, [])
    const resumedChild = (await ctx2.agents.resume({ resumeSessionId: childId })).agent
    await expect(ctx2.collaboration.publishFromChild(resumedChild.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_CHILD_MISSING' })
  })

  it('refuses to publish the same branch reply twice', async () => {
    const { ctx, room } = await setup([textResponse('A reply')])
    const child = await mentionedChild(ctx, room)
    await ctx.collaboration.publishFromChild(child.session, ActorId('alice'))
    await expect(ctx.collaboration.publishFromChild(child.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_ALREADY_PUBLISHED' })
    const aiLines = project(room.session).messages.filter(message => message.kind === 'ai')
    expect(aiLines).toHaveLength(1)
  })

  it('publishes an explicitly selected earlier reply', async () => {
    const { ctx, room } = await setup([textResponse('first reply'), textResponse('second reply')])
    const child = await mentionedChild(ctx, room)
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    await child.whenIdle()
    const replySeqs = child.session.snapshotEvents()
      .filter(event => event.type === 'assistant/message' && event.seq >= child.session.inheritedEventCount)
      .map(event => event.seq)
    expect(replySeqs).toHaveLength(2)
    await ctx.collaboration.publishFromChild(child.session, ActorId('alice'), SessionSeq(replySeqs[0]!))
    const aiLines = project(room.session).messages.filter(message => message.kind === 'ai')
    expect(aiLines.map(message => message.text)).toEqual(['first reply'])
  })

  it('publishes a reply selected by its message id', async () => {
    const { ctx, room } = await setup([textResponse('first reply'), textResponse('second reply')])
    const child = await mentionedChild(ctx, room)
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    await child.whenIdle()
    const messageIds = child.session.snapshotEvents()
      .flatMap(event => event.type === 'assistant/message' && event.seq >= child.session.inheritedEventCount
        ? [event.data.message.id]
        : [])
    expect(messageIds).toHaveLength(2)
    await ctx.collaboration.publishFromChild(child.session, ActorId('alice'), undefined, messageIds[0])
    const aiLines = project(room.session).messages.filter(message => message.kind === 'ai')
    expect(aiLines.map(message => message.text)).toEqual(['first reply'])
    await expect(ctx.collaboration.publishFromChild(child.session, ActorId('alice'), undefined, 'no-such-message'))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
  })

  it('refuses publish selectors that name no reply and a branch with no reply', async () => {
    const { ctx, room } = await setup([textResponse('A reply')])
    const child = await mentionedChild(ctx, room)
    await expect(ctx.collaboration.publishFromChild(child.session, ActorId('alice'), SessionSeq(9999)))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    const quiet = await setup([])
    const quietChild = await mentionedChild(quiet.ctx, quiet.room)
    await expect(quiet.ctx.collaboration.publishFromChild(quietChild.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
  })

  it('refuses invalid leave and remove requests', async () => {
    const { ctx, room } = await setup([])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob join us',
      mentions: [ActorId('bob')],
    })
    await expect(ctx.collaboration.leaveRoom(room.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    await expect(ctx.collaboration.removeOccupant(room.session, ActorId('bob'), ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    await expect(ctx.collaboration.removeOccupant(room.session, ActorId('alice'), ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    await expect(ctx.collaboration.removeOccupant(room.session, ActorId('alice'), ActorId('model-a')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    await ctx.collaboration.removeOccupant(room.session, ActorId('alice'), ActorId('bob'))
    await expect(ctx.collaboration.leaveRoom(room.session, ActorId('bob')))
      .rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
  })

  it('publishes the second reply by message id after skipping the first', async () => {
    const { ctx, room } = await setup([textResponse('first reply'), textResponse('second reply')])
    const child = await mentionedChild(ctx, room)
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@A again',
      mentions: [ActorId('model-a')],
    })
    await child.whenIdle()
    const messageIds = child.session.snapshotEvents()
      .flatMap(event => event.type === 'assistant/message' && event.seq >= child.session.inheritedEventCount
        ? [event.data.message.id]
        : [])
    expect(messageIds).toHaveLength(2)
    await ctx.collaboration.publishFromChild(child.session, ActorId('alice'), undefined, messageIds[1])
    const aiLines = project(room.session).messages.filter(message => message.kind === 'ai')
    expect(aiLines.map(message => message.text)).toEqual(['second reply'])
  })

  it('does not republish inherited replies from a fork of a branch', async () => {
    const { ctx, room } = await setup([textResponse('A reply')])
    const child = await mentionedChild(ctx, room)
    const forked = ctx.sessions.fork(child.session, undefined, SessionId('forked-branch'))
    await expect(ctx.collaboration.publishFromChild(forked, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
  })

  it('refuses to claim a branch Session as a room', async () => {
    const { ctx, room } = await setup([textResponse('A reply')])
    const child = await mentionedChild(ctx, room)
    await expect(ctx.collaboration.postMessage(child.session, {
      actorId: ActorId('alice'),
      text: 'posting on the branch itself',
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    expect(project(child.session).messages.map(message => message.text))
      .not.toContain('posting on the branch itself')
  })

  it('lets an occupant leave and the creator remove an occupant', async () => {
    const { ctx, room } = await setup([])
    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob join us',
      mentions: [ActorId('bob')],
    })
    expect(project(room.session).occupants).toEqual([ActorId('alice'), ActorId('bob')])
    await expect(ctx.collaboration.leaveRoom(room.session, ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_INVALID_ARGUMENT' })
    await expect(ctx.collaboration.removeOccupant(room.session, ActorId('bob'), ActorId('alice')))
      .rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })
    await ctx.collaboration.leaveRoom(room.session, ActorId('bob'))
    expect(project(room.session).occupants).toEqual([ActorId('alice')])
    await expect(ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('bob'),
      text: 'am I still in?',
    })).rejects.toMatchObject({ code: 'COLLAB_ACCESS_DENIED' })

    await ctx.collaboration.postMessage(room.session, {
      actorId: ActorId('alice'),
      text: '@Bob back again',
      mentions: [ActorId('bob')],
    })
    await ctx.collaboration.removeOccupant(room.session, ActorId('alice'), ActorId('bob'))
    expect(project(room.session).occupants).toEqual([ActorId('alice')])
  })
})
