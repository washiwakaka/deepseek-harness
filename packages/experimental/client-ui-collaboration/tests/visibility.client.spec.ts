import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-experimental-collaboration/client'
import { sessionVisibleTo } from '../src/client/visibility.ts'

const ROOM = SessionId('room')
const BRANCH = SessionId('branch')
const OPEN = SessionId('open')

function list(values: SessionListState['projectionsBySession']): SessionListState {
  const ids = Object.keys(values) as SessionId[]
  return {
    ids,
    byId: Object.fromEntries(ids.map(id => [id, {
      id,
      displayTitle: id,
      running: false,
      retainedBy: {},
      blank: false,
      updatedAt: 0,
    }])),
    phase: 'ready',
    projectionsBySession: values,
  }
}

describe('collaboration session visibility', () => {
  it('hides unclaimed sessions and a claimed room until invite', () => {
    const snapshot = list({
      [ROOM]: {
        state: 'ready',
        error: null,
        values: {
          collaboration: {
            occupants: ['alice'] as never,
            children: { a: BRANCH },
            messages: [],
            watermarks: {},
          },
        },
      },
      [BRANCH]: { state: 'ready', error: null, values: {} },
      [OPEN]: { state: 'ready', error: null, values: {} },
    })
    expect(sessionVisibleTo('alice', snapshot, ROOM)).toBe(true)
    expect(sessionVisibleTo('alice', snapshot, BRANCH)).toBe(true)
    expect(sessionVisibleTo('bob', snapshot, ROOM)).toBe(false)
    expect(sessionVisibleTo('bob', snapshot, BRANCH)).toBe(false)
    expect(sessionVisibleTo('bob', snapshot, OPEN)).toBe(false)
    expect(sessionVisibleTo('alice', snapshot, OPEN, new Set(['open']))).toBe(true)
    expect(sessionVisibleTo(undefined, snapshot, ROOM)).toBe(true)
  })

  it('shows the room and its branches after the creator invites the human', () => {
    const snapshot = list({
      [ROOM]: {
        state: 'ready',
        error: null,
        values: {
          collaboration: {
            occupants: ['alice', 'bob'] as never,
            children: { a: BRANCH },
            messages: [],
            watermarks: {},
          },
        },
      },
      [BRANCH]: { state: 'ready', error: null, values: {} },
    })
    expect(sessionVisibleTo('bob', snapshot, ROOM)).toBe(true)
    expect(sessionVisibleTo('bob', snapshot, BRANCH)).toBe(true)
  })
})
