import { describe, expect, it } from 'vitest'
import { roomMessageSide } from '../src/client/message-side.ts'

describe('roomMessageSide', () => {
  it('puts the selected human on the right and other occupants on the left', () => {
    expect(roomMessageSide('human', 'alice', 'alice')).toBe('self')
    expect(roomMessageSide('human', 'bob', 'alice')).toBe('other')
    expect(roomMessageSide('human', 'alice', undefined)).toBe('other')
    expect(roomMessageSide('ai', 'model-a', 'alice')).toBe('ai')
    expect(roomMessageSide('ai', 'alice', 'alice')).toBe('ai')
  })
})
