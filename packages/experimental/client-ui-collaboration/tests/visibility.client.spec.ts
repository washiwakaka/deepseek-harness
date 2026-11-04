import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-experimental-collaboration/client'
import { isOwnedBranch } from '../src/client/visibility.ts'

const ROOM = SessionId('room')
const BRANCH = SessionId('branch')

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

describe('collaboration branch ownership', () => {
  it('shows only the mentioning human\'s branch as owned', () => {
    const bobs = SessionId('bob-branch')
    const snapshot = list({
      [ROOM]: {
        state: 'ready',
        error: null,
        values: {
          collaboration: {
            occupants: ['alice', 'bob'] as never,
            children: { aliceA: BRANCH, bobA: bobs },
            childOwners: { [BRANCH]: 'alice', [bobs]: 'bob' } as never,
            messages: [],
            watermarks: {},
          },
        },
      },
      [BRANCH]: { state: 'ready', error: null, values: {} },
      [bobs]: { state: 'ready', error: null, values: {} },
    })
    expect(isOwnedBranch('alice', snapshot, BRANCH)).toBe(true)
    expect(isOwnedBranch('bob', snapshot, BRANCH)).toBe(false)
    expect(isOwnedBranch('bob', snapshot, bobs)).toBe(true)
    expect(isOwnedBranch(undefined, snapshot, BRANCH)).toBe(false)
    expect(isOwnedBranch('alice', snapshot, ROOM)).toBe(false)
  })

  it('treats a child without owner as shared among occupants', () => {
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
    expect(isOwnedBranch('alice', snapshot, BRANCH)).toBe(true)
    expect(isOwnedBranch('bob', snapshot, BRANCH)).toBe(true)
    expect(isOwnedBranch('james', snapshot, BRANCH)).toBe(false)
  })
})
