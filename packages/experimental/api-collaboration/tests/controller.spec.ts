import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import CollaborationService, { CollaborationError } from '@deepseek-ai/dsh-experimental-collaboration'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CollaborationController from '../src/index.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const storageRoot = mkdtempSync(join(tmpdir(), 'dsh-api-collab-'))
  roots.push(storageRoot)
  await ctx.plugin(JsonlSessionPersistence, { root: storageRoot })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CollaborationService, {
    actors: [
      { id: 'alice', kind: 'human', name: 'Alice' },
      { id: 'bob', kind: 'human', name: 'Bob' },
      { id: 'model-a', kind: 'ai', name: 'A', provider: 'mock', model: 'mock' },
    ],
  })
  ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('ok')]))
  const room = await ctx.agentLoop.create(SessionId('room'), { provider: 'mock', model: 'mock' })
  const api = new CollaborationController(ctx)
  return { api, ctx, room }
}

describe('collaboration Remote', () => {
  it('lists occupants and posts an unmentioned line', async () => {
    const { api, ctx, room } = await setup()
    expect(api.listActors()).toEqual([
      { id: 'alice', kind: 'human', name: 'Alice' },
      { id: 'bob', kind: 'human', name: 'Bob' },
      { id: 'model-a', kind: 'ai', name: 'A' },
    ])
    vi.spyOn(ctx.llm, 'listProviders').mockReturnValue([{ id: 'qwen-token-plan', name: 'Qwen' }])
    vi.spyOn(ctx.llm, 'listModels').mockResolvedValue([
      { provider: 'qwen-token-plan', id: 'qwen-plus', name: 'Qwen-Plus' },
    ])
    await expect(api.listMentionModels('alice', new AbortController().signal)).resolves.toEqual([
      { id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' },
    ])
    try {
      await api.listMentionModels('model-a', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/invalid-argument' })
    }
    const abort = new AbortController()
    abort.abort()
    await expect(api.listMentionModels('alice', abort.signal)).rejects.toThrow()
    await api.postMessage(room, { actorId: 'alice', text: 'hello' }, new AbortController().signal)
    expect(room.session.snapshotEvents().some(event => event.type === 'collaboration/message')).toBe(true)
    expect(room.session.snapshotEvents().some(event => event.type === 'turn/start')).toBe(false)
  })

  it('maps unknown authors to collaboration/unknown-actor', async () => {
    const { api, room } = await setup()
    try {
      await api.postMessage(room, { actorId: 'nobody', text: 'hello' }, new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({
        code: 'collaboration/unknown-actor',
        details: { actorId: 'nobody' },
      })
    }
  })

  it('invites a mentioned human and refuses a stranger', async () => {
    const { api, room } = await setup()
    await api.postMessage(room, { actorId: 'alice', text: 'ping' }, new AbortController().signal)
    try {
      await api.postMessage(room, { actorId: 'bob', text: 'hi' }, new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({
        code: 'collaboration/forbidden',
        details: { actorId: 'bob' },
      })
    }
    await api.postMessage(
      room,
      { actorId: 'alice', text: '@Bob', mentions: ['bob'] },
      new AbortController().signal,
    )
    await api.postMessage(room, { actorId: 'bob', text: 'hi' }, new AbortController().signal)
  })

  it('publishes a branch reply onto the room', async () => {
    const { api, ctx, room } = await setup()
    const posted = await api.postMessage(
      room,
      { actorId: 'alice', text: '@A look', mentions: ['model-a'] },
      new AbortController().signal,
    )
    const childId = posted.childSessionIds[0]
    expect(childId).toBeDefined()
    const child = ctx.agents.get(childId as never)
    expect(child).toBeDefined()
    await child!.whenIdle()
    await api.publish(child!, 'alice', new AbortController().signal)
    expect(room.session.snapshotEvents().some(event =>
      event.type === 'collaboration/message' && event.data.kind === 'ai' && event.data.text === 'ok',
    )).toBe(true)
    try {
      await api.publish(room, 'alice', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/invalid-argument' })
    }
  })

  it('claims an empty room and maps occupant denials', async () => {
    const { api, room } = await setup()
    await api.claimRoom(room, 'alice', new AbortController().signal)
    try {
      await api.claimRoom(room, 'bob', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({
        code: 'collaboration/forbidden',
        details: { actorId: 'bob' },
      })
    }
  })

  it('maps claimRoom collaboration failures', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.claimRoom = async () => {
      throw new CollaborationError('not an AI occupant', 'COLLAB_NOT_AI')
    }
    try {
      await api.claimRoom(room, 'alice', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/not-ai' })
    }
  })

  it('rethrows a non-collaboration claimRoom failure', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.claimRoom = async () => {
      throw new Error('boom')
    }
    await expect(api.claimRoom(room, 'alice', new AbortController().signal)).rejects.toThrow('boom')
  })

  it('prefers abort over a mapped claimRoom failure', async () => {
    const { api, ctx, room } = await setup()
    const abort = new AbortController()
    ctx.collaboration.claimRoom = async () => {
      abort.abort()
      throw new CollaborationError('unknown actor', 'COLLAB_UNKNOWN_ACTOR')
    }
    await expect(api.claimRoom(room, 'alice', abort.signal)).rejects.toThrow()
  })

  it('rejects an already aborted claimRoom', async () => {
    const { api, room } = await setup()
    const abort = new AbortController()
    abort.abort()
    await expect(api.claimRoom(room, 'alice', abort.signal)).rejects.toThrow()
  })

  it('rethrows a non-collaboration publish failure', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.publishFromChild = async () => {
      throw new Error('boom')
    }
    await expect(api.publish(room, 'alice', new AbortController().signal)).rejects.toThrow('boom')
  })

  it('prefers abort over a mapped publish failure', async () => {
    const { api, ctx, room } = await setup()
    const abort = new AbortController()
    ctx.collaboration.publishFromChild = async () => {
      abort.abort()
      throw new CollaborationError('session is not a collaboration branch', 'COLLAB_NOT_BRANCH')
    }
    await expect(api.publish(room, 'alice', abort.signal)).rejects.toThrow()
  })

  it('maps empty text to collaboration/invalid-argument', async () => {
    const { api, room } = await setup()
    try {
      await api.postMessage(room, { actorId: 'alice', text: '' }, new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/invalid-argument' })
    }
  })

  it('maps unclassified collaboration failures to collaboration/failed', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.postMessage = async () => {
      throw new CollaborationError('AI child is not live', 'COLLAB_CHILD_MISSING')
    }
    try {
      await api.postMessage(room, { actorId: 'alice', text: 'hello' }, new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/failed' })
    }
  })

  it('rethrows a non-collaboration failure', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.postMessage = async () => {
      throw new Error('boom')
    }
    await expect(api.postMessage(room, { actorId: 'alice', text: 'hello' }, new AbortController().signal))
      .rejects.toThrow('boom')
  })

  it('prefers abort over a mapped collaboration failure', async () => {
    const { api, ctx, room } = await setup()
    const abort = new AbortController()
    ctx.collaboration.postMessage = async () => {
      abort.abort()
      throw new CollaborationError('unknown actor', 'COLLAB_UNKNOWN_ACTOR')
    }
    await expect(api.postMessage(room, { actorId: 'alice', text: 'hello' }, abort.signal)).rejects.toThrow()
  })

  it('rejects an already aborted post', async () => {
    const { api, room } = await setup()
    const abort = new AbortController()
    abort.abort()
    await expect(api.postMessage(room, { actorId: 'alice', text: 'hello' }, abort.signal)).rejects.toThrow()
  })

  it('admits uncompiled room lines without starting a turn', async () => {
    const { api, room } = await setup()
    await api.postMessage(room, { actorId: 'alice', text: 'hello' }, new AbortController().signal)
    await api.admitRoomContext(room, 'alice', new AbortController().signal)
    expect(room.session.deriveMessages().some(message => message.source.kind === 'collaboration-room-context')).toBe(true)
    expect(room.session.snapshotEvents().some(event => event.type === 'turn/start')).toBe(false)
  })

  it('maps admit failures to collaboration/failed', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.admitRoomContext = async () => {
      throw new CollaborationError('AI child is not live', 'COLLAB_CHILD_MISSING')
    }
    try {
      await api.admitRoomContext(room, 'alice', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/failed' })
    }
  })

  it('rethrows a non-collaboration admit failure', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.admitRoomContext = async () => {
      throw new Error('boom')
    }
    await expect(api.admitRoomContext(room, 'alice', new AbortController().signal)).rejects.toThrow('boom')
  })

  it('prefers abort over a mapped admit failure', async () => {
    const { api, ctx, room } = await setup()
    const abort = new AbortController()
    ctx.collaboration.admitRoomContext = async () => {
      abort.abort()
      throw new CollaborationError('AI child is not live', 'COLLAB_CHILD_MISSING')
    }
    await expect(api.admitRoomContext(room, 'alice', abort.signal)).rejects.toThrow()
  })

  it('rethrows a non-collaboration model-list failure', async () => {
    const { api, ctx } = await setup()
    ctx.collaboration.listMentionModels = async () => {
      throw new Error('boom')
    }
    await expect(api.listMentionModels('alice', new AbortController().signal)).rejects.toThrow('boom')
  })

  it('prefers abort over a mapped model-list failure', async () => {
    const { api, ctx } = await setup()
    const abort = new AbortController()
    ctx.collaboration.listMentionModels = async () => {
      abort.abort()
      throw new CollaborationError('unknown actor', 'COLLAB_UNKNOWN_ACTOR')
    }
    await expect(api.listMentionModels('alice', abort.signal)).rejects.toThrow()
  })

  it('rejects an already aborted admit', async () => {
    const { api, room } = await setup()
    const abort = new AbortController()
    abort.abort()
    await expect(api.admitRoomContext(room, 'alice', abort.signal)).rejects.toThrow()
  })

  it('admits then followups through sendWithRoom', async () => {
    const { api, room } = await setup()
    await api.postMessage(room, { actorId: 'alice', text: 'hello' }, new AbortController().signal)
    await api.sendWithRoom(room, 'what did Alice say?', 'alice', new AbortController().signal)
    await room.whenIdle()
    expect(room.session.deriveMessages().some(message => message.source.kind === 'collaboration-room-context')).toBe(true)
    expect(room.session.snapshotEvents().some(event => event.type === 'turn/start')).toBe(true)
  })

  it('maps sendWithRoom collaboration failures', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.sendWithRoom = async () => {
      throw new CollaborationError('AI child is not live', 'COLLAB_CHILD_MISSING')
    }
    try {
      await api.sendWithRoom(room, 'hello', 'alice', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/failed' })
    }
  })

  it('maps a blank sendWithRoom draft to collaboration/invalid-argument', async () => {
    const { api, room } = await setup()
    try {
      await api.sendWithRoom(room, '   ', 'alice', new AbortController().signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'collaboration/invalid-argument' })
    }
  })

  it('rethrows a non-collaboration sendWithRoom failure', async () => {
    const { api, ctx, room } = await setup()
    ctx.collaboration.sendWithRoom = async () => {
      throw new Error('boom')
    }
    await expect(api.sendWithRoom(room, 'hello', 'alice', new AbortController().signal)).rejects.toThrow('boom')
  })

  it('prefers abort over a mapped sendWithRoom failure', async () => {
    const { api, ctx, room } = await setup()
    const abort = new AbortController()
    ctx.collaboration.sendWithRoom = async () => {
      abort.abort()
      throw new CollaborationError('message text must be non-empty', 'COLLAB_INVALID_ARGUMENT')
    }
    await expect(api.sendWithRoom(room, 'hello', 'alice', abort.signal)).rejects.toThrow()
  })

  it('rejects an already aborted sendWithRoom', async () => {
    const { api, room } = await setup()
    const abort = new AbortController()
    abort.abort()
    await expect(api.sendWithRoom(room, 'hello', 'alice', abort.signal)).rejects.toThrow()
  })
})
