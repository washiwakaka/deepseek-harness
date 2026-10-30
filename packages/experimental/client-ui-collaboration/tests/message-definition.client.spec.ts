import { describe, expect, it } from 'vitest'
import { collaborationMessageDefinition } from '../src/client/message-definition.ts'

describe('collaboration-message Conversation Definition', () => {
  it('starts one Chat row from a room message and ignores other events', () => {
    const message = {
      type: 'collaboration/message' as const,
      seq: 4,
      data: {
        version: 1,
        id: 'msg-1',
        actorId: 'alice',
        kind: 'human' as const,
        name: 'Alice',
        text: 'hello',
        mentions: [],
      },
    }
    expect(collaborationMessageDefinition.match(message as never)).toEqual({
      id: 'msg-1',
      role: 'start',
    })
    expect(collaborationMessageDefinition.match({ type: 'user/message', data: {} } as never)).toBeNull()
    const state = collaborationMessageDefinition.start(
      { state: undefined } as never,
      { event: message, location: { kind: 'unresolved' } } as never,
      {} as never,
    )
    expect(state).toEqual({
      seq: 4,
      actorId: 'alice',
      name: 'Alice',
      kind: 'human',
      text: 'hello',
    })
    expect(collaborationMessageDefinition.buildViewNode!({
      key: 'collaboration-message:msg-1',
      id: 'msg-1',
      state,
      start: { event: message, location: { kind: 'unresolved' } },
      matches: [],
    } as never)).toMatchObject({
      kind: 'collaboration-message',
      target: 'chat',
      anchorSeq: 4,
      data: { actorId: 'alice', name: 'Alice', kind: 'human', text: 'hello' },
    })
    expect(collaborationMessageDefinition.update({ state } as never, { event: message } as never)).toBe(state)
    expect(collaborationMessageDefinition.buildViewNode!({ state: undefined } as never)).toBeNull()
    expect(collaborationMessageDefinition.buildViewNode!({
      key: 'collaboration-message:msg-1',
      id: 'msg-1',
      state,
      matches: [],
    } as never)).toMatchObject({ location: { kind: 'unresolved' } })
    expect(() => collaborationMessageDefinition.start(
      { state: undefined } as never,
      { event: { type: 'user/message' } } as never,
      {} as never,
    )).toThrow(/collaboration-message start requires collaboration\/message/)
  })
})
