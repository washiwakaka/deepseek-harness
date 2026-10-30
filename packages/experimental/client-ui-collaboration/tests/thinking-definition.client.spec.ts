import { describe, expect, it } from 'vitest'
import { collaborationThinkingDefinition } from '../src/client/thinking-definition.ts'

describe('collaboration-thinking Conversation Definition', () => {
  it('starts from actor-invoked, hides on that AI room line, and ignores other events', () => {
    const invoked = {
      type: 'collaboration/actor-invoked' as const,
      seq: 5,
      data: {
        version: 1,
        actorId: 'qwen-token-plan/qwen-plus',
        childSessionId: 'child-1',
        throughSeq: 4,
      },
    }
    const reply = {
      type: 'collaboration/message' as const,
      seq: 8,
      data: {
        version: 1,
        id: 'msg-ai',
        actorId: 'qwen-token-plan/qwen-plus',
        kind: 'ai' as const,
        name: 'Qwen-Plus',
        text: 'done',
        mentions: [],
      },
    }
    expect(collaborationThinkingDefinition.match(invoked as never)).toEqual({
      id: 'think:qwen-token-plan/qwen-plus',
      role: 'start',
    })
    expect(collaborationThinkingDefinition.match(reply as never)).toEqual({
      id: 'think:qwen-token-plan/qwen-plus',
      role: 'update',
    })
    expect(collaborationThinkingDefinition.match({
      type: 'collaboration/message',
      data: { kind: 'human', actorId: 'alice' },
    } as never)).toBeNull()
    expect(collaborationThinkingDefinition.match({ type: 'user/message', data: {} } as never)).toBeNull()
    const started = collaborationThinkingDefinition.start(
      { state: undefined } as never,
      { event: invoked, location: { kind: 'unresolved' } } as never,
    )
    expect(started).toEqual({
      seq: 5,
      actorId: 'qwen-token-plan/qwen-plus',
      running: true,
    })
    expect(collaborationThinkingDefinition.buildViewNode({
      key: 'collaboration-thinking:think:qwen-token-plan/qwen-plus',
      id: 'think:qwen-token-plan/qwen-plus',
      state: started,
      start: { event: invoked, location: { kind: 'unresolved' } },
      matches: [],
    } as never)).toMatchObject({
      kind: 'collaboration-thinking',
      target: 'chat',
      anchorSeq: 5,
      data: { actorId: 'qwen-token-plan/qwen-plus', running: true },
    })
    const hidden = collaborationThinkingDefinition.update(
      { state: started } as never,
      { event: reply } as never,
    )
    expect(hidden.running).toBe(false)
    expect(collaborationThinkingDefinition.buildViewNode({
      state: hidden,
      start: { event: invoked, location: { kind: 'unresolved' } },
    } as never)).toBeNull()
    const restarted = collaborationThinkingDefinition.update(
      { state: hidden } as never,
      { event: invoked } as never,
    )
    expect(restarted.running).toBe(true)
    expect(collaborationThinkingDefinition.update(
      { state: started } as never,
      { event: { type: 'user/message' } } as never,
    )).toBe(started)
    expect(collaborationThinkingDefinition.buildViewNode({ state: undefined } as never)).toBeNull()
    expect(collaborationThinkingDefinition.buildViewNode({
      key: 'collaboration-thinking:think:qwen-token-plan/qwen-plus',
      id: 'think:qwen-token-plan/qwen-plus',
      state: started,
      matches: [],
    } as never)).toMatchObject({ location: { kind: 'unresolved' } })
    expect(collaborationThinkingDefinition.update(
      { state: started } as never,
      { event: { type: 'collaboration/message', data: { kind: 'human' } } } as never,
    )).toBe(started)
    expect(() => collaborationThinkingDefinition.start(
      { state: undefined } as never,
      { event: { type: 'collaboration/message' } } as never,
    )).toThrow(/collaboration-thinking start requires collaboration\/actor-invoked/)
  })
})
