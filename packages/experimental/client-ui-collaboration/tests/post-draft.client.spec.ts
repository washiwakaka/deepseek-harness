import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  admitRoomContext,
  firstHumanId,
  isNoHumanPostError,
  postRoomDraft,
  publishFromChild,
  sendWithRoom,
  type CollaborationRemote,
} from '../src/client/post-draft.ts'

const sessionId = 'sess-1' as SessionId

function remote(overrides: Partial<CollaborationRemote> = {}): CollaborationRemote {
  return {
    listActors: vi.fn(async () => ({
      ok: true as const,
      value: [
        { id: 'alice', kind: 'human' as const, name: 'Alice' },
        { id: 'model-a', kind: 'ai' as const, name: 'A' },
      ],
    })),
    listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
    postMessage: vi.fn(async () => ({ ok: true as const, value: { childSessionIds: [] } })),
    publish: vi.fn(async () => ({ ok: true as const })),
    admitRoomContext: vi.fn(async () => ({ ok: true as const })),
    sendWithRoom: vi.fn(async () => ({ ok: true as const })),
    claimRoom: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

describe('postRoomDraft', () => {
  it('selects the first human occupant id', () => {
    expect(firstHumanId([
      { id: 'model-a', kind: 'ai', name: 'A' },
      { id: 'bob', kind: 'human', name: 'Bob' },
    ])).toBe('bob')
    expect(firstHumanId([{ id: 'model-a', kind: 'ai', name: 'A' }])).toBeUndefined()
  })

  it('posts as the first human', async () => {
    const api = remote()
    await postRoomDraft(api, sessionId, 'hello')
    expect(api.postMessage).toHaveBeenCalledWith(sessionId, { actorId: 'alice', text: 'hello' })
  })

  it('posts as the supplied human without listing occupants', async () => {
    const api = remote()
    await postRoomDraft(api, sessionId, 'hello', 'bob')
    expect(api.listActors).not.toHaveBeenCalled()
    expect(api.postMessage).toHaveBeenCalledWith(sessionId, { actorId: 'bob', text: 'hello' })
  })

  it('wakes the named AI occupant', async () => {
    const api = remote()
    await postRoomDraft(api, sessionId, 'hello', 'alice', ['model-a'])
    expect(api.postMessage).toHaveBeenCalledWith(sessionId, {
      actorId: 'alice',
      text: 'hello',
      mentions: ['model-a'],
    })
  })

  it('omits an empty mentions list', async () => {
    const api = remote()
    await postRoomDraft(api, sessionId, 'hello', 'alice', [])
    expect(api.postMessage).toHaveBeenCalledWith(sessionId, { actorId: 'alice', text: 'hello' })
  })

  it('throws when listing occupants fails', async () => {
    const error = new Error('list failed')
    const api = remote({ listActors: vi.fn(async () => ({ ok: false as const, error })) })
    await expect(postRoomDraft(api, sessionId, 'hello')).rejects.toBe(error)
  })

  it('throws invalid-argument when no human occupant exists', async () => {
    const api = remote({
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [{ id: 'model-a', kind: 'ai' as const, name: 'A' }],
      })),
    })
    await expect(postRoomDraft(api, sessionId, 'hello')).rejects.toSatisfy(isNoHumanPostError)
    expect(api.postMessage).not.toHaveBeenCalled()
  })

  it('admits room context on the current Session', async () => {
    const api = remote()
    await admitRoomContext(api, sessionId, 'alice')
    expect(api.admitRoomContext).toHaveBeenCalledWith(sessionId, 'alice')
  })

  it('throws when admit is refused', async () => {
    const error = new RemoteError('collaboration/failed', 'flush failed', { reason: 'flush failed' })
    const api = remote({ admitRoomContext: vi.fn(async () => ({ ok: false as const, error })) })
    await expect(admitRoomContext(api, sessionId, 'alice')).rejects.toBe(error)
  })

  it('sends the draft after admitting room context', async () => {
    const api = remote()
    await sendWithRoom(api, sessionId, 'what did Alice say?', 'alice')
    expect(api.sendWithRoom).toHaveBeenCalledWith(sessionId, 'what did Alice say?', 'alice')
  })

  it('throws when send with room is refused', async () => {
    const error = new RemoteError('collaboration/failed', 'flush failed', { reason: 'flush failed' })
    const api = remote({ sendWithRoom: vi.fn(async () => ({ ok: false as const, error })) })
    await expect(sendWithRoom(api, sessionId, 'hello', 'alice')).rejects.toBe(error)
  })

  it('publishes the current branch onto the room', async () => {
    const api = remote()
    await publishFromChild(api, sessionId, 'alice')
    expect(api.publish).toHaveBeenCalledWith(sessionId, 'alice')
  })

  it('throws when publish is refused', async () => {
    const error = new RemoteError('collaboration/invalid-argument', 'not a branch', { reason: 'not a branch' })
    const api = remote({ publish: vi.fn(async () => ({ ok: false as const, error })) })
    await expect(publishFromChild(api, sessionId, 'alice')).rejects.toBe(error)
  })

  it('treats a void post result as no opened branches', async () => {
    const api = remote({
      postMessage: vi.fn(async () => ({ ok: true as const, value: undefined as never })),
    })
    await expect(postRoomDraft(api, sessionId, 'hello', 'alice')).resolves.toEqual([])
  })

  it('throws when the post is refused', async () => {
    const error = new RemoteError('collaboration/failed', 'flush failed', { reason: 'flush failed' })
    const api = remote({ postMessage: vi.fn(async () => ({ ok: false as const, error })) })
    await expect(postRoomDraft(api, sessionId, 'hello')).rejects.toBe(error)
    expect(isNoHumanPostError(error)).toBe(false)
    expect(isNoHumanPostError(new Error('no human occupant'))).toBe(false)
  })
})
