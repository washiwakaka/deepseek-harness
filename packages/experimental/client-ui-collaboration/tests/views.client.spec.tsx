// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { ActorRosterSnapshot } from '../src/client/actor-roster.ts'
import type { CollaborationMessageChatData } from '../src/client/message-definition.ts'
import type { CollaborationThinkingChatData } from '../src/client/thinking-definition.ts'
import { RoomBadge } from '../src/client/RoomBadge.tsx'
import { RoomMessageView } from '../src/client/RoomMessageView.tsx'
import { RoomPostButton } from '../src/client/RoomPostButton.tsx'
import { RoomThinkingStatus } from '../src/client/RoomThinkingStatus.tsx'
import { RoomThinkingView } from '../src/client/RoomThinkingView.tsx'

type TestView = (props: Record<string, unknown>) => ReactNode
const Badge = RoomBadge as never as TestView
const MessageView = RoomMessageView as never as TestView
const PostButton = RoomPostButton as never as TestView
const ThinkingStatus = RoomThinkingStatus as never as TestView
const ThinkingView = RoomThinkingView as never as TestView

afterEach(cleanup)

const humans = [
  { id: 'alice', kind: 'human' as const, name: 'Alice' },
  { id: 'bob', kind: 'human' as const, name: 'Bob' },
]

const t = ((key: string, vars?: Record<string, string>) => {
  if (key === 'badge') return 'Collaboration room'
  if (key === 'roster.aria') return `Occupants ${vars?.names ?? ''}`
  if (key === 'message.aria') return `Room message from ${vars?.name ?? ''}`
  if (key === 'send') return 'Post to room'
  if (key === 'send.aria') return 'Post the draft to the collaboration room'
  if (key === 'actor.aria') return 'Choose which human posts to the room'
  if (key === 'prompt') return 'Send with room'
  if (key === 'prompt.aria') return "Send the draft and room transcript to this conversation's model"
  if (key === 'send.failed') return 'Could not post'
  if (key === 'send.noHuman') return 'No human occupant is configured'
  if (key === 'message.from') return `This answer is from ${vars?.name ?? ''}`
  if (key === 'thinking') return 'Deep diving'
  if (key === 'thinking.aria') return `${vars?.name ?? ''} is thinking`
  if (key === 'publish') return 'Push to room'
  if (key === 'publish.aria') return "Post this branch's latest answer to the collaboration room"
  return key
}) as never

function roster(
  overrides: Partial<ActorRosterSnapshot> & Pick<ActorRosterSnapshot, 'actors'>,
): ActorRosterSnapshot {
  return {
    mentionModels: [],
    selectedAiId: undefined,
    thinking: false,
    branchIds: [],
    selectedHumanId: undefined,
    ...overrides,
  }
}

function selectRoster(
  overrides: Partial<ActorRosterSnapshot> & Pick<ActorRosterSnapshot, 'actors'>,
): (select: (snapshot: ActorRosterSnapshot) => ActorRosterSnapshot) => ActorRosterSnapshot {
  return select => select(roster(overrides))
}

function messageNode(data: CollaborationMessageChatData) {
  return {
    key: 'message',
    id: 'message',
    kind: 'collaboration-message' as const,
    target: 'chat' as const,
    anchorSeq: 0,
    location: { kind: 'unresolved' as const },
    visibility: 'visible' as const,
    data,
  }
}

function thinkingNode(data: CollaborationThinkingChatData) {
  return {
    key: 'thinking',
    id: 'thinking',
    kind: 'collaboration-thinking' as const,
    target: 'chat' as const,
    anchorSeq: 0,
    location: { kind: 'unresolved' as const },
    visibility: 'visible' as const,
    data,
  }
}

function inputState(overrides: {
  draft?: string
  phase?: InputState['phase'] | 'running'
  occurrences?: readonly { source: string; ref: string }[]
}): InputState {
  return {
    draft: overrides.draft ?? '',
    attachmentIds: [],
    draftRev: 0,
    phase: overrides.phase === 'running' ? 'sending' : (overrides.phase ?? 'plain'),
    occurrences: (overrides.occurrences ?? []).map((row, occurrenceId) => ({
      occurrenceId,
      source: row.source,
      ref: row.ref,
      offset: 0,
      length: row.ref.length,
      label: row.ref,
      clipboardText: row.ref,
    })),
    queue: [],
  }
}

function renderPost(overrides: {
  draft?: string
  phase?: 'plain' | 'running'
  selectedHumanId?: string | undefined
  actors?: readonly { id: string; kind: 'human' | 'ai'; name: string }[]
  mentionModels?: readonly { id: string; kind: 'human' | 'ai'; name: string }[]
  occurrences?: readonly { source: string; ref: string }[]
  post?: (text: string, mentions: readonly string[]) => Promise<void>
  promptWithRoom?: (text: string, mentions: readonly string[]) => Promise<void>
  thinking?: (value: boolean) => void
  publish?: () => Promise<void>
  sessionId?: string
  branchIds?: readonly string[]
  setDraft?: (value: string) => void
} = {}) {
  const post = overrides.post ?? vi.fn(async () => {})
  const promptWithRoom = overrides.promptWithRoom ?? vi.fn(async () => {})
  const thinking = overrides.thinking ?? vi.fn()
  const publish = overrides.publish ?? vi.fn(async () => {})
  const setDraft = overrides.setDraft ?? vi.fn()
  const actors = overrides.actors ?? humans
  const selectedHumanId = overrides.selectedHumanId === undefined && !('selectedHumanId' in overrides)
    ? 'alice'
    : overrides.selectedHumanId
  render(<PostButton
    t={t}
    useInput={(select: (state: InputState) => InputState) => select(inputState({
      draft: overrides.draft ?? 'hello',
      phase: overrides.phase ?? 'plain',
      occurrences: overrides.occurrences ?? [],
    }))}
    inputActions={{ setDraft } as never}
    sessionId={SessionId(overrides.sessionId ?? 'room')}
    post={post}
    promptWithRoom={promptWithRoom}
    publish={publish}
    thinking={thinking}
    useActors={selectRoster({
      actors,
      selectedHumanId,
      mentionModels: overrides.mentionModels ?? [],
      branchIds: overrides.branchIds ?? [],
    })}
  /> as never)
  return { post, promptWithRoom, thinking, publish, setDraft }
}

describe('collaboration-room views', () => {
  it('renders the header badge copy', () => {
    render(<Badge
      t={t}
      selectHuman={vi.fn()}
      useActors={selectRoster({ actors: [], selectedHumanId: undefined })}
    /> as never)
    expect(screen.getByRole('status').textContent).toContain('Collaboration room')
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('renders occupant names from the Host roster', () => {
    render(<Badge
      t={t}
      selectHuman={vi.fn()}
      useActors={selectRoster({
        actors: [
          { id: 'alice', kind: 'human', name: 'Alice' },
          { id: 'model-a', kind: 'ai', name: 'A' },
        ],
        selectedHumanId: 'alice',
      })}
    /> as never)
    expect(screen.getByRole('status', { name: 'Occupants Alice · A' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Choose which human posts to the room' })).toHaveProperty('value', 'alice')
  })

  it('falls back to the first human when none is selected', () => {
    render(<Badge
      t={t}
      selectHuman={vi.fn()}
      useActors={selectRoster({ actors: humans, selectedHumanId: undefined })}
    /> as never)
    expect(screen.getByRole('combobox', { name: 'Choose which human posts to the room' })).toHaveProperty('value', 'alice')
  })

  it('changes the test human from the header badge', () => {
    const selectHuman = vi.fn()
    render(<Badge
      t={t}
      selectHuman={selectHuman}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose which human posts to the room' }), {
      target: { value: 'bob' },
    })
    expect(selectHuman).toHaveBeenCalledWith('bob')
  })

  it('renders a human room line', () => {
    render(<MessageView
      t={t}
      node={messageNode({ actorId: 'alice', name: 'Alice', kind: 'human', text: 'hello' })}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    const row = screen.getByRole('group', { name: 'Room message from Alice' })
    expect(row.textContent).toContain('hello')
    expect(row.getAttribute('data-kind')).toBe('human')
    expect(row.parentElement?.getAttribute('data-side')).toBe('self')
  })

  it('places another human on the opposite side', () => {
    render(<MessageView
      t={t}
      node={messageNode({ actorId: 'bob', name: 'Bob', kind: 'human', text: 'from bob' })}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    expect(screen.getByRole('group', { name: 'Room message from Bob' }).parentElement?.getAttribute('data-side')).toBe('other')
  })

  it('places an unselected human with other occupants', () => {
    render(<MessageView
      t={t}
      node={messageNode({ actorId: 'alice', name: 'Alice', kind: 'human', text: 'hello' })}
      useActors={selectRoster({ actors: humans, selectedHumanId: undefined })}
    /> as never)
    expect(screen.getByRole('group', { name: 'Room message from Alice' }).parentElement?.getAttribute('data-side')).toBe('other')
  })

  it('renders an AI room line', () => {
    render(<MessageView
      t={t}
      node={messageNode({ actorId: 'model-a', name: 'A', kind: 'ai', text: 'reply' })}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    const row = screen.getByRole('group', { name: 'Room message from A' })
    expect(row.getAttribute('data-kind')).toBe('ai')
    expect(row.parentElement?.getAttribute('data-side')).toBe('ai')
    expect(row.textContent).toContain('This answer is from A')
  })

  it('renders a thinking row for an invoked model', () => {
    render(<ThinkingView
      t={t}
      node={thinkingNode({ actorId: 'qwen-token-plan/qwen-plus', running: true })}
      useActors={selectRoster({
        actors: humans,
        mentionModels: [{ id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' }],
        selectedHumanId: 'alice',
      })}
    /> as never)
    const row = screen.getByRole('status', { name: 'Qwen-Plus is thinking' })
    expect(row.textContent).toContain('Deep diving')
    expect(row.getAttribute('data-side')).toBe('ai')
  })

  it('falls back to the actor id when the roster has no name', () => {
    render(<ThinkingView
      t={t}
      node={thinkingNode({ actorId: 'missing', running: true })}
      useActors={selectRoster({ actors: humans, mentionModels: [], selectedHumanId: 'alice' })}
    /> as never)
    expect(screen.getByRole('status', { name: 'missing is thinking' })).toBeTruthy()
  })

  it('hides the composer thinking status while idle', () => {
    render(<ThinkingStatus
      t={t}
      useActors={selectRoster({ actors: humans, thinking: false, selectedHumanId: 'alice' })}
    /> as never)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the composer thinking status while a Remote call is in flight', () => {
    render(<ThinkingStatus
      t={t}
      useActors={selectRoster({ actors: humans, thinking: true, selectedHumanId: 'alice' })}
    /> as never)
    expect(screen.getByRole('status', { name: 'Deep diving' }).textContent).toContain('Deep diving')
  })

  it('posts the trimmed draft and clears it', async () => {
    const { post, setDraft } = renderPost({ draft: '  hello  ' })
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('hello', []) })
    expect(setDraft).toHaveBeenCalledWith('')
  })

  it('sends the trimmed draft with room context and clears it', async () => {
    const { promptWithRoom, setDraft, thinking } = renderPost({ draft: '  hello  ' })
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    await vi.waitFor(() => { expect(promptWithRoom).toHaveBeenCalledWith('hello', []) })
    expect(thinking).toHaveBeenCalledWith(true)
    expect(thinking).toHaveBeenCalledWith(false)
    expect(setDraft).toHaveBeenCalledWith('')
  })

  it('passes model chips as mentions on post', async () => {
    const { post } = renderPost({
      draft: '@Qwen-Plus hello',
      mentionModels: [{ id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' }],
      occurrences: [
        { source: 'models', ref: 'qwen-token-plan/qwen-plus' },
        { source: 'files', ref: '/tmp/a' },
        { source: 'models', ref: 'alice' },
        { source: 'models', ref: 'qwen-token-plan/qwen-plus' },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith('@Qwen-Plus hello', ['qwen-token-plan/qwen-plus'])
    })
  })

  it('passes model chips as mentions on send with room', async () => {
    const { promptWithRoom } = renderPost({
      draft: '@Qwen-Plus hello',
      mentionModels: [{ id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' }],
      occurrences: [{ source: 'models', ref: 'qwen-token-plan/qwen-plus' }],
    })
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    await vi.waitFor(() => {
      expect(promptWithRoom).toHaveBeenCalledWith('@Qwen-Plus hello', ['qwen-token-plan/qwen-plus'])
    })
  })

  it('keeps the draft when send with room fails', async () => {
    const { setDraft, thinking } = renderPost({
      promptWithRoom: async () => {
        throw new Error('flush failed')
      },
    })
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('flush failed')
    })
    expect(thinking).toHaveBeenCalledWith(true)
    expect(thinking).toHaveBeenCalledWith(false)
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('ignores a settled post after unmount', async () => {
    let resolvePost: (() => void) | undefined
    const post = vi.fn(() => new Promise<void>((resolve) => { resolvePost = resolve }))
    const setDraft = vi.fn()
    const thinking = vi.fn()
    const view = render(<PostButton
      t={t}
      useInput={(select: (state: InputState) => InputState) => select(inputState({ draft: 'hello', phase: 'plain' }))}
      inputActions={{ setDraft } as never}
      post={post}
      promptWithRoom={vi.fn(async () => {})}
      thinking={thinking}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    view.unmount()
    expect(thinking).toHaveBeenCalledWith(false)
    resolvePost?.()
    await Promise.resolve()
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('ignores a refused post after unmount', async () => {
    let rejectPost: ((reason: unknown) => void) | undefined
    const post = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectPost = reject }))
    const view = render(<PostButton
      t={t}
      useInput={(select: (state: InputState) => InputState) => select(inputState({ draft: 'hello', phase: 'plain' }))}
      inputActions={{ setDraft: vi.fn() } as never}
      post={post}
      promptWithRoom={vi.fn(async () => {})}
      thinking={vi.fn()}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    view.unmount()
    rejectPost?.(new Error('flush failed'))
    await Promise.resolve()
  })

  it('ignores a settled prompt after unmount', async () => {
    let resolvePrompt: (() => void) | undefined
    const promptWithRoom = vi.fn(() => new Promise<void>((resolve) => { resolvePrompt = resolve }))
    const setDraft = vi.fn()
    const view = render(<PostButton
      t={t}
      useInput={(select: (state: InputState) => InputState) => select(inputState({ draft: 'hello', phase: 'plain' }))}
      inputActions={{ setDraft } as never}
      post={vi.fn(async () => {})}
      promptWithRoom={promptWithRoom}
      thinking={vi.fn()}
      useActors={selectRoster({ actors: humans, selectedHumanId: 'alice' })}
    /> as never)
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    view.unmount()
    resolvePrompt?.()
    await Promise.resolve()
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('publishes the latest branch answer onto the room', async () => {
    const { publish, post } = renderPost({ sessionId: 'child-1', branchIds: ['child-1'] })
    expect(screen.queryByRole('button', { name: 'Post the draft to the collaboration room' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: "Post this branch's latest answer to the collaboration room" }))
    await vi.waitFor(() => { expect(publish).toHaveBeenCalled() })
    expect(post).not.toHaveBeenCalled()
  })

  it('does not post a blank draft', () => {
    const { post, promptWithRoom } = renderPost({ draft: '   ' })
    expect(screen.getByRole('button', { name: 'Post the draft to the collaboration room' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    expect(post).not.toHaveBeenCalled()
    expect(promptWithRoom).not.toHaveBeenCalled()
  })

  it('does not prompt while the conversation is running', () => {
    const { promptWithRoom } = renderPost({ phase: 'running' })
    expect(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    expect(promptWithRoom).not.toHaveBeenCalled()
  })

  it('does not post without a selected human', () => {
    const { post } = renderPost({ selectedHumanId: undefined, actors: [] })
    expect(screen.getByRole('button', { name: 'Post the draft to the collaboration room' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    expect(post).not.toHaveBeenCalled()
  })

  it('does not post while a human roster has no selection', () => {
    const { post } = renderPost({ selectedHumanId: undefined })
    expect(screen.getByRole('button', { name: 'Post the draft to the collaboration room' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    expect(post).not.toHaveBeenCalled()
  })

  it('shows a missing-human notice', async () => {
    renderPost({
      post: async () => {
        throw new RemoteError('collaboration/invalid-argument', 'no human occupant', { reason: 'no human occupant' })
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('No human occupant is configured')
    })
  })

  it('shows a local failure notice and keeps the draft', async () => {
    const { setDraft } = renderPost({
      post: async () => {
        throw new Error('flush failed')
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('flush failed')
    })
    expect(setDraft).not.toHaveBeenCalled()
  })

  it('shows a RemoteError message', async () => {
    renderPost({
      promptWithRoom: async () => {
        throw new RemoteError('collaboration/failed', 'session is busy', { reason: 'session is busy' })
      },
    })
    fireEvent.click(screen.getByRole('button', { name: "Send the draft and room transcript to this conversation's model" }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('session is busy')
    })
  })

  it('shows a generic failure when the rejection is not an Error', async () => {
    renderPost({
      post: async () => {
        throw 1
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Post the draft to the collaboration room' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Could not post')
    })
  })
})
