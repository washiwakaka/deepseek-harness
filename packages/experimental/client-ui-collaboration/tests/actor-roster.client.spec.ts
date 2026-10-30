import { describe, expect, it } from 'vitest'
import { ActorRosterStore, occupantName } from '../src/client/actor-roster.ts'

const alice = { id: 'alice', kind: 'human' as const, name: 'Alice' }
const bob = { id: 'bob', kind: 'human' as const, name: 'Bob' }
const modelA = { id: 'model-a', kind: 'ai' as const, name: 'A' }

describe('ActorRosterStore', () => {
  it('replaces the snapshot, selects the first human, and notifies subscribers', () => {
    const store = new ActorRosterStore()
    const seen: Array<string | undefined> = []
    const unsubscribe = store.subscribe(() => { seen.push(store.getSnapshot().selectedHumanId) })
    const ignored = store.subscribe(() => { throw new Error('unsubscribed listeners never run') })
    ignored()
    expect(store.getSnapshot()).toEqual({
      actors: [],
      mentionModels: [],
      selectedHumanId: undefined,
      selectedAiId: undefined,
      thinking: false,
      branchIds: [],
    })
    store.set([modelA, alice, bob])
    expect(store.getSnapshot()).toEqual({
      actors: [modelA, alice, bob],
      mentionModels: [],
      selectedHumanId: 'alice',
      selectedAiId: undefined,
      thinking: false,
      branchIds: [],
    })
    expect(seen).toEqual(['alice'])
    unsubscribe()
    store.set([])
    expect(seen).toEqual(['alice'])
  })

  it('keeps the selected human across roster refreshes', () => {
    const store = new ActorRosterStore()
    store.set([alice, bob])
    store.selectHuman('bob')
    store.selectHuman('bob')
    store.selectHuman('model-a')
    store.selectHuman('missing')
    expect(store.getSnapshot().selectedHumanId).toBe('bob')
    store.set([bob, alice])
    expect(store.getSnapshot().selectedHumanId).toBe('bob')
    store.set([alice])
    expect(store.getSnapshot().selectedHumanId).toBe('alice')
  })

  it('selects a Settings mention target and clears it when the human changes', () => {
    const store = new ActorRosterStore()
    const qwen = { id: 'qwen-token-plan/qwen-plus', kind: 'ai' as const, name: 'Qwen-Plus' }
    const chat = { id: 'deepseek-official/deepseek-chat', kind: 'ai' as const, name: 'DeepSeek Chat' }
    store.set([alice, bob])
    store.setMentionModels([qwen, chat])
    store.selectAi('qwen-token-plan/qwen-plus')
    store.selectAi('qwen-token-plan/qwen-plus')
    store.selectAi('alice')
    store.selectAi('missing')
    expect(store.getSnapshot().selectedAiId).toBe('qwen-token-plan/qwen-plus')
    store.setMentionModels([qwen])
    expect(store.getSnapshot().selectedAiId).toBe('qwen-token-plan/qwen-plus')
    store.setMentionModels([])
    expect(store.getSnapshot().selectedAiId).toBeUndefined()
    store.setMentionModels([qwen])
    store.selectAi('qwen-token-plan/qwen-plus')
    store.selectHuman('bob')
    expect(store.getSnapshot()).toMatchObject({
      selectedHumanId: 'bob',
      selectedAiId: undefined,
      mentionModels: [],
    })
    store.setMentionModels([chat])
    store.selectAi('deepseek-official/deepseek-chat')
    store.selectAi('')
    expect(store.getSnapshot().selectedAiId).toBeUndefined()
  })

  it('toggles the in-flight thinking flag and names occupants', () => {
    const store = new ActorRosterStore()
    store.set([alice])
    const qwen = { id: 'qwen-token-plan/qwen-plus', kind: 'ai' as const, name: 'Qwen-Plus' }
    store.setMentionModels([qwen])
    const seen: boolean[] = []
    store.subscribe(() => { seen.push(store.getSnapshot().thinking) })
    store.setThinking(true)
    store.setThinking(true)
    expect(store.getSnapshot().thinking).toBe(true)
    store.setThinking(false)
    expect(store.getSnapshot().thinking).toBe(false)
    expect(seen).toEqual([true, false])
    expect(occupantName(store.getSnapshot(), 'alice')).toBe('Alice')
    expect(occupantName(store.getSnapshot(), 'qwen-token-plan/qwen-plus')).toBe('Qwen-Plus')
    expect(occupantName(store.getSnapshot(), 'missing')).toBe('missing')
    store.addBranch('child-1')
    store.addBranch('child-1')
    expect(store.getSnapshot().branchIds).toEqual(['child-1'])
  })
})
