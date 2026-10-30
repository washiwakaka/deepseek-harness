import { describe, expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session'
import { collaborationProjectionDefinition, collaborationProjectionView } from '../src/projection.ts'
import { ActorId, CollaborationMessageId } from '../src/types.ts'

function event<T extends Extract<SessionEventType, `collaboration/${string}`>>(
  type: T,
  data: SessionEventMap[T],
  seq: SessionSeq,
): SessionEvent<T> {
  return { type, data, seq, time: seq }
}

function project(events: readonly SessionEvent[]) {
  let state = collaborationProjectionDefinition.init({
    version: SESSION_FORMAT_VERSION,
    id: SessionId('room'),
    createdAt: 0,
    isSeeded: false,
  }, SessionLogOffset(0))
  for (const next of events) state = collaborationProjectionDefinition.apply(state, next)
  return state
}

describe('collaboration projection events', () => {
  it('returns the same state reference for unrelated events', () => {
    const empty = project([])
    const next = collaborationProjectionDefinition.apply(empty, {
      type: 'turn/start',
      data: { turn: 1 },
      seq: SessionSeq(0),
      time: 0,
    })
    expect(next).toBe(empty)
  })

  it('records messages, children, and watermarks in order', () => {
    const actor = ActorId('model-a')
    const child = SessionId('child-a')
    const state = project([
      event('collaboration/message', {
        version: 1,
        id: CollaborationMessageId('m1'),
        actorId: ActorId('alice'),
        kind: 'human',
        name: 'Alice',
        text: '@A',
        mentions: [actor],
      }, SessionSeq(0)),
      event('collaboration/branch-opened', {
        version: 1,
        actorId: actor,
        childSessionId: child,
        baseSeq: SessionSeq(0),
      }, SessionSeq(1)),
      event('collaboration/actor-invoked', {
        version: 1,
        actorId: actor,
        childSessionId: child,
        throughSeq: SessionSeq(0),
      }, SessionSeq(2)),
    ])
    expect(state.failure).toBeUndefined()
    expect(state.messages).toHaveLength(1)
    expect(state.occupants).toEqual([ActorId('alice')])
    expect(state.children[actor]).toBe(child)
    expect(state.watermarks[actor]).toBe(0)
  })

  it('records occupant invites without duplicating the creator', () => {
    const state = project([
      event('collaboration/occupant', { version: 1, actorId: ActorId('alice') }, SessionSeq(0)),
      event('collaboration/message', {
        version: 1,
        id: CollaborationMessageId('m1'),
        actorId: ActorId('alice'),
        kind: 'human',
        name: 'Alice',
        text: '@Bob',
        mentions: [ActorId('bob')],
      }, SessionSeq(1)),
      event('collaboration/occupant', { version: 1, actorId: ActorId('bob') }, SessionSeq(2)),
    ])
    expect(state.occupants).toEqual([ActorId('alice'), ActorId('bob')])
  })

  it('fails duplicate messages, duplicate children, and invoke-before-open', () => {
    const actor = ActorId('model-a')
    const message = event('collaboration/message', {
      version: 1,
      id: CollaborationMessageId('m1'),
      actorId: ActorId('alice'),
      kind: 'human',
      name: 'Alice',
      text: 'hi',
      mentions: [],
    }, SessionSeq(0))
    expect(project([message, message]).failure).toMatch(/posted twice/)
    expect(project([
      event('collaboration/actor-invoked', {
        version: 1,
        actorId: actor,
        childSessionId: SessionId('child'),
        throughSeq: SessionSeq(0),
      }, SessionSeq(0)),
    ]).failure).toMatch(/before a child opened/)
    expect(project([
      event('collaboration/branch-opened', {
        version: 1,
        actorId: actor,
        childSessionId: SessionId('child-a'),
        baseSeq: SessionSeq(0),
      }, SessionSeq(0)),
      event('collaboration/branch-opened', {
        version: 1,
        actorId: actor,
        childSessionId: SessionId('child-b'),
        baseSeq: SessionSeq(0),
      }, SessionSeq(1)),
    ]).failure).toMatch(/opened twice/)
    expect(project([
      event('collaboration/branch-opened', {
        version: 1,
        actorId: actor,
        childSessionId: SessionId('child-a'),
        baseSeq: SessionSeq(0),
      }, SessionSeq(0)),
      event('collaboration/actor-invoked', {
        version: 1,
        actorId: actor,
        childSessionId: SessionId('child-b'),
        throughSeq: SessionSeq(0),
      }, SessionSeq(1)),
    ]).failure).toMatch(/different child/)
  })

  it('fails an invalid persisted payload', () => {
    const state = project([{
      type: 'collaboration/message',
      seq: SessionSeq(0),
      time: 0,
      data: { version: 2 },
    } as SessionEvent])
    expect(state.failure).toMatch(/payload is invalid/)
  })

  it('keeps a failed state reference for later events', () => {
    const failed = project([
      event('collaboration/message', {
        version: 1,
        id: CollaborationMessageId('m1'),
        actorId: ActorId('alice'),
        kind: 'human',
        name: 'Alice',
        text: 'hi',
        mentions: [],
      }, SessionSeq(0)),
      event('collaboration/message', {
        version: 1,
        id: CollaborationMessageId('m1'),
        actorId: ActorId('alice'),
        kind: 'human',
        name: 'Alice',
        text: 'hi',
        mentions: [],
      }, SessionSeq(1)),
    ])
    expect(failed.failure).toBeDefined()
    const later = collaborationProjectionDefinition.apply(failed, event('collaboration/message', {
      version: 1,
      id: CollaborationMessageId('m2'),
      actorId: ActorId('bob'),
      kind: 'human',
      name: 'Bob',
      text: 'later',
      mentions: [],
    }, SessionSeq(2)))
    expect(later).toBe(failed)
  })

  it('projects the client view including occupants and optional failure', () => {
    const ok = project([])
    expect(collaborationProjectionView(ok)).toEqual({
      messages: [],
      children: {},
      watermarks: {},
      occupants: [],
    })
    expect(collaborationProjectionView({ ...ok, failure: 'bad' }).failure).toBe('bad')
  })
})
