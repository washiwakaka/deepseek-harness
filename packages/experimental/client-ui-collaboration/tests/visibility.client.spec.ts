import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { sessionVisibleTo } from '../src/client/visibility.ts'

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
      room: {
        state: 'ready',
        error: null,
        values: { collaboration: { occupants: ['alice'], children: { a: 'branch' } } },
      },
      branch: { state: 'ready', error: null, values: {} },
      open: { state: 'ready', error: null, values: {} },
    })
    expect(sessionVisibleTo('alice', snapshot, 'room')).toBe(true)
    expect(sessionVisibleTo('alice', snapshot, 'branch')).toBe(true)
    expect(sessionVisibleTo('bob', snapshot, 'room')).toBe(false)
    expect(sessionVisibleTo('bob', snapshot, 'branch')).toBe(false)
    expect(sessionVisibleTo('bob', snapshot, 'open')).toBe(false)
    expect(sessionVisibleTo('alice', snapshot, 'open', new Set(['open']))).toBe(true)
    expect(sessionVisibleTo(undefined, snapshot, 'room')).toBe(true)
  })

  it('shows the room and its branches after the creator invites the human', () => {
    const snapshot = list({
      room: {
        state: 'ready',
        error: null,
        values: { collaboration: { occupants: ['alice', 'bob'], children: { a: 'branch' } } },
      },
      branch: { state: 'ready', error: null, values: {} },
    })
    expect(sessionVisibleTo('bob', snapshot, 'room')).toBe(true)
    expect(sessionVisibleTo('bob', snapshot, 'branch')).toBe(true)
  })
})
