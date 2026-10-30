import { describe, expect, it, vi } from 'vitest'
import {
  humanMayUseProvider,
  listCatalogMentions,
  mentionRouteId,
  parseMentionRoute,
} from '../src/catalog.ts'
import { ActorId } from '../src/types.ts'
import type { ResolvedHumanActor } from '../src/types.ts'

const alice: ResolvedHumanActor = {
  id: ActorId('alice'),
  kind: 'human',
  name: 'Alice',
  group: 'core',
  providers: [],
}

const bob: ResolvedHumanActor = {
  id: ActorId('bob'),
  kind: 'human',
  name: 'Bob',
  group: 'guest',
  providers: ['deepseek-official'],
}

describe('collaboration mention catalog', () => {
  it('parses Settings mention ids and filters providers per human', () => {
    expect(mentionRouteId('qwen-token-plan', 'qwen-plus')).toBe('qwen-token-plan/qwen-plus')
    expect(parseMentionRoute('qwen-token-plan/qwen-plus')).toEqual({
      provider: 'qwen-token-plan',
      model: 'qwen-plus',
    })
    expect(parseMentionRoute('openrouter/qwen/qwen3-max')).toEqual({
      provider: 'openrouter',
      model: 'qwen/qwen3-max',
    })
    expect(parseMentionRoute('model-a')).toBeUndefined()
    expect(humanMayUseProvider(alice, 'qwen-token-plan')).toBe(true)
    expect(humanMayUseProvider(bob, 'qwen-token-plan')).toBe(false)
    expect(humanMayUseProvider(bob, 'deepseek-official')).toBe(true)
  })

  it('lists advertised models and skips a failing provider catalog', async () => {
    const listModels = vi.fn(async (provider: string) => {
      if (provider === 'down') throw new Error('offline')
      if (provider === 'qwen-token-plan') {
        return [{ id: 'qwen-plus', name: 'Qwen-Plus' }]
      }
      return [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }]
    })
    const llm = {
      listProviders: () => [
        { id: 'qwen-token-plan' },
        { id: 'down' },
        { id: 'deepseek-official' },
      ],
      listModels,
    }
    await expect(listCatalogMentions(llm, alice)).resolves.toEqual([
      {
        id: ActorId('qwen-token-plan/qwen-plus'),
        kind: 'ai',
        name: 'Qwen-Plus',
        provider: 'qwen-token-plan',
        model: 'qwen-plus',
      },
      {
        id: ActorId('deepseek-official/deepseek-chat'),
        kind: 'ai',
        name: 'DeepSeek Chat',
        provider: 'deepseek-official',
        model: 'deepseek-chat',
      },
    ])
    await expect(listCatalogMentions(llm, bob)).resolves.toEqual([
      {
        id: ActorId('deepseek-official/deepseek-chat'),
        kind: 'ai',
        name: 'DeepSeek Chat',
        provider: 'deepseek-official',
        model: 'deepseek-chat',
      },
    ])
  })
})
