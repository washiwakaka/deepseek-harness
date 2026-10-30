import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  collectRoomConversation,
  compileMentionTask,
  compileRoomContext,
  COLLABORATION_MENTION_INSTRUCTION,
  COLLABORATION_ROOM_CONTEXT_INSTRUCTION,
  ROOM_ASSISTANT_LABEL,
  ROOM_USER_LABEL,
} from '../src/compiler.ts'
import { ActorId, CollaborationMessageId } from '../src/types.ts'
import type { CollaborationMessage, ResolvedAiActor } from '../src/types.ts'

const A: ResolvedAiActor = {
  id: ActorId('model-a'),
  kind: 'ai',
  name: 'A',
  provider: 'mock',
  model: 'mock',
}

const B: ResolvedAiActor = {
  id: ActorId('model-b'),
  kind: 'ai',
  name: 'B',
  provider: 'mock',
  model: 'mock',
}

function line(
  seq: number,
  actorId: string,
  name: string,
  text: string,
  kind: 'human' | 'ai' = 'human',
): CollaborationMessage {
  return {
    id: CollaborationMessageId(`msg-${seq}`),
    seq: SessionSeq(seq),
    actorId: ActorId(actorId),
    kind,
    name,
    text,
    mentions: [],
  }
}

describe('compileMentionTask', () => {
  it('sends the full prior transcript on the first @ of A and skips A\'s own replies', () => {
    const messages = [
      line(0, 'alice', 'Alice', 'hello'),
      line(1, 'bob', 'Bob', '@A look'),
      line(2, 'model-a', 'A', 'I looked', 'ai'),
    ]
    expect(compileMentionTask(messages, A, SessionSeq(1), undefined)).toBe(
      `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[Alice] hello\n[Bob] @A look`,
    )
  })

  it('keeps the instruction when the window has only the recipient\'s own replies', () => {
    expect(compileMentionTask(
      [line(2, 'model-a', 'A', 'I looked', 'ai')],
      A,
      SessionSeq(2),
      SessionSeq(1),
    )).toBe(COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A'))
  })

  it('sends only the room delta after A\'s watermark on a later @', () => {
    const messages = [
      line(0, 'alice', 'Alice', 'hello'),
      line(1, 'bob', 'Bob', '@A look'),
      line(2, 'model-a', 'A', 'I looked', 'ai'),
      line(3, 'alice', 'Alice', 'more'),
      line(4, 'bob', 'Bob', '@A again'),
    ]
    expect(compileMentionTask(messages, A, SessionSeq(4), SessionSeq(1))).toBe(
      `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[Alice] more\n[Bob] @A again`,
    )
  })

  it('gives B the full room-visible transcript including A\'s posted reply', () => {
    const messages = [
      line(0, 'alice', 'Alice', 'hello'),
      line(1, 'model-a', 'A', 'I looked', 'ai'),
      line(2, 'bob', 'Bob', '@B your turn'),
    ]
    expect(compileMentionTask(messages, B, SessionSeq(2), undefined)).toBe(
      `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'B')}\n\n[Alice] hello\n[A] I looked\n[Bob] @B your turn`,
    )
  })

  it('interleaves room-Agent user and assistant turns with room posts by seq', () => {
    const messages = [line(2, 'alice', 'Alice', '@A please look')]
    expect(compileMentionTask(messages, A, SessionSeq(2), undefined, [
      { seq: SessionSeq(0), name: ROOM_USER_LABEL, text: 'please help' },
      { seq: SessionSeq(1), name: ROOM_ASSISTANT_LABEL, text: 'room answered' },
    ])).toBe(
      `${COLLABORATION_MENTION_INSTRUCTION.replace('{name}', 'A')}\n\n[${ROOM_USER_LABEL}] please help\n[${ROOM_ASSISTANT_LABEL}] room answered\n[Alice] @A please look`,
    )
  })
})

describe('collectRoomConversation', () => {
  it('keeps user and assistant turns and skips compiled injects', () => {
    const events: SessionEvent[] = [
      {
        type: 'user/message',
        seq: SessionSeq(0),
        time: 1,
        surfaceOp: 'append',
        data: createUserMessage({
          content: [{ type: 'text', text: 'Shared room transcript.\n\n[Alice] hello' }],
          source: {
            kind: 'collaboration-room-context',
            roomId: SessionId('room'),
            throughSeq: SessionSeq(0),
          },
        }),
      },
      {
        type: 'user/message',
        seq: SessionSeq(1),
        time: 1,
        surfaceOp: 'append',
        data: createUserMessage({
          content: [{ type: 'text', text: 'please help' }],
          source: { kind: 'user' },
        }),
      },
      {
        type: 'assistant/message',
        seq: SessionSeq(2),
        time: 1,
        surfaceOp: 'append',
        data: {
          turn: 1,
          step: 1,
          message: createAssistantMessage({
            content: [{ type: 'text', text: 'room answered' }],
            source: { provider: 'mock', model: 'mock' },
          }),
          stream: [],
        },
      },
    ]
    expect(collectRoomConversation(events, SessionSeq(2), undefined)).toEqual([
      { seq: SessionSeq(1), name: ROOM_USER_LABEL, text: 'please help' },
      { seq: SessionSeq(2), name: ROOM_ASSISTANT_LABEL, text: 'room answered' },
    ])
  })
})

describe('compileRoomContext', () => {
  it('labels every room line for the room Agent, including AI replies', () => {
    const messages = [
      line(0, 'alice', 'Alice', 'hello'),
      line(1, 'model-a', 'A', 'I looked', 'ai'),
    ]
    expect(compileRoomContext(messages, SessionSeq(1), undefined)).toBe(
      `${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n[Alice] hello\n[A] I looked`,
    )
  })

  it('returns undefined when the room delta is empty', () => {
    expect(compileRoomContext([line(0, 'alice', 'Alice', 'hello')], SessionSeq(0), SessionSeq(0))).toBeUndefined()
  })
})
