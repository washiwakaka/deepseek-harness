import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ActorRosterStore } from '../src/client/actor-roster.ts'
import type { CollaborationRoomKey } from '../src/client/locales.ts'
import { collaborationMentionSource, MENTION_SOURCE_NAME, modelMentionIds } from '../src/client/mention-source.ts'

const session = { sessionId: 'sess-1' as SessionId }
const t = (key: CollaborationRoomKey) => {
  if (key === 'section.models') return 'Models'
  if (key === 'section.people') return 'People'
  return key
}
const span = { start: 0, end: 1, draftRev: 1 }

function request(query: string, options: { quoted?: boolean; drilled?: boolean; aborted?: boolean } = {}) {
  const signal = new AbortController()
  if (options.aborted === true) signal.abort()
  return {
    query,
    quoted: options.quoted ?? false,
    position: 'inline' as const,
    drilled: options.drilled ?? false,
    signal: signal.signal,
  }
}

describe('collaboration @ model source', () => {
  it('lists people and Settings models, searches both, and inserts a mention chip', async () => {
    const actors = new ActorRosterStore()
    actors.set([
      { id: 'alice', kind: 'human', name: 'Alice' },
      { id: 'bob', kind: 'human', name: 'Bob' },
    ])
    actors.setMentionModels([
      { id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' },
      { id: 'deepseek-official/deepseek-chat', kind: 'ai', name: 'DeepSeek Chat' },
    ])
    const source = collaborationMentionSource(actors, t)
    expect(source).toMatchObject({
      trigger: '@',
      name: MENTION_SOURCE_NAME,
      order: -10,
      showGroupTitle: false,
    })
    const items = await source.candidates(session, request(''))
    expect(items.map(item => item.name)).toEqual(['Bob', 'Qwen-Plus', 'DeepSeek Chat'])
    expect(items.filter(item => item.section === 'People').map(item => item.name)).toEqual(['Bob'])
    expect(items.filter(item => item.section === 'Models').map(item => item.name)).toEqual(['Qwen-Plus', 'DeepSeek Chat'])
    expect(await source.candidates(session, request('qwen'))).toMatchObject([{ name: 'Qwen-Plus' }])
    expect(await source.candidates(session, request('bo'))).toMatchObject([{ name: 'Bob' }])
    expect(source.onPick({
      candidate: { name: 'missing' },
      session,
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span,
    })).toBeUndefined()
    expect(source.onPick({
      candidate: { name: 'bad', value: JSON.stringify({ id: 'x', name: 'X', kind: 'nope' }) },
      session,
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span,
    })).toBeUndefined()
    const bob = items.find(item => item.name === 'Bob')!
    expect(source.onPick({
      candidate: bob,
      session,
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span,
    })).toEqual({
      insert: {
        source: MENTION_SOURCE_NAME,
        ref: 'bob',
        label: 'Bob',
        clipboardText: '@Bob',
      },
    })
    expect(actors.getSnapshot().selectedAiId).toBeUndefined()
    const qwen = items.find(item => item.name === 'Qwen-Plus')!
    expect(source.onPick({
      candidate: qwen,
      session,
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span,
    })).toEqual({
      insert: {
        source: MENTION_SOURCE_NAME,
        ref: 'qwen-token-plan/qwen-plus',
        label: 'Qwen-Plus',
        clipboardText: '@Qwen-Plus',
      },
    })
    expect(actors.getSnapshot().selectedAiId).toBe('qwen-token-plan/qwen-plus')
    await expect(source.codec!.serialize('qwen-token-plan/qwen-plus', new AbortController().signal))
      .resolves.toBe('qwen-token-plan/qwen-plus')
    expect(source.codec!.clipboardText('qwen-token-plan/qwen-plus')).toBe('@Qwen-Plus')
    expect(source.codec!.clipboardText('alice')).toBe('@Alice')
    expect(source.codec!.clipboardText('missing')).toBe('@missing')
  })

  it('collects unique model chip refs in order', () => {
    expect(modelMentionIds([
      { source: 'models', ref: 'qwen-token-plan/qwen-plus' },
      { source: 'sessions', ref: 'sess-2' },
      { source: 'models', ref: 'alice' },
      { source: 'models', ref: 'deepseek-official/deepseek-chat' },
      { source: 'models', ref: 'qwen-token-plan/qwen-plus' },
    ], ['qwen-token-plan/qwen-plus', 'deepseek-official/deepseek-chat'])).toEqual([
      'qwen-token-plan/qwen-plus',
      'deepseek-official/deepseek-chat',
    ])
  })

  it('hides models for quoted paths, drills, and aborted requests', async () => {
    const actors = new ActorRosterStore()
    actors.setMentionModels([{ id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' }])
    const source = collaborationMentionSource(actors, t)
    expect(await source.candidates(session, request('', { quoted: true }))).toEqual([])
    expect(await source.candidates(session, request('src/', { drilled: true }))).toEqual([])
    expect(await source.candidates(session, request('', { aborted: true }))).toEqual([])
  })
})
