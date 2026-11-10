import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError, type TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { apply, inject } from '../src/client/index.ts'
import { mountCollaborationUi } from '../src/client/mount.ts'
import { apply as nodeApply } from '../src/index.ts'
import { RoomBadge } from '../src/client/RoomBadge.tsx'
import { RoomMessageView } from '../src/client/RoomMessageView.tsx'
import { RoomPostButton } from '../src/client/RoomPostButton.tsx'
import { BranchPublishAction } from '../src/client/BranchPublishAction.tsx'
import { RoomThinkingStatus } from '../src/client/RoomThinkingStatus.tsx'
import { RoomThinkingView } from '../src/client/RoomThinkingView.tsx'
import { collaborationMessageDefinition } from '../src/client/message-definition.ts'
import { collaborationThinkingDefinition } from '../src/client/thinking-definition.ts'

const REMOTE: TypertRemoteContribution = { package: '@deepseek-ai/dsh-experimental-api-collaboration', descriptors: [] }

function stubSessions(overrides: {
  getSnapshot?: () => unknown
  subscribe?: (listener: () => void) => () => void
} = {}) {
  return {
    list: {
      getSnapshot: overrides.getSnapshot ?? (() => ({
        ids: [],
        byId: {},
        phase: 'ready' as const,
        projectionsBySession: {},
      })),
      subscribe: overrides.subscribe ?? (() => () => {}),
    },
  }
}

async function bench() {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(contribution: TypertRemoteContribution) {
      expect(contribution).toBe(REMOTE)
      return unmount
    }
  }
  new Remote()
  const listActors = vi.fn(async () => ({
    ok: true as const,
    value: [
      { id: 'alice', kind: 'human' as const, name: 'Alice' },
      { id: 'bob', kind: 'human' as const, name: 'Bob' },
    ],
  }))
  const listMentionModels = vi.fn(async (actorId: string): Promise<
    | { ok: true; value: readonly { id: string; kind: 'ai'; name: string }[] }
    | { ok: false; error: Error }
  > => ({
    ok: true,
    value: actorId === 'bob'
      ? [{ id: 'deepseek-official/deepseek-chat', kind: 'ai' as const, name: 'DeepSeek Chat' }]
      : [{ id: 'qwen-token-plan/qwen-plus', kind: 'ai' as const, name: 'Qwen-Plus' }],
  }))
  const postMessage = vi.fn(async (_sessionId: SessionId, request: { mentions?: readonly string[] }): Promise<
    | { ok: true; value: { childSessionIds: string[] } }
    | { ok: false; error: RemoteError }
  > => ({
    ok: true,
    value: { childSessionIds: request.mentions !== undefined && request.mentions.length > 0 ? ['child-a'] : [] },
  }))
  const sendWithRoom = vi.fn(async () => ({ ok: true as const }))
  const publish = vi.fn(async () => ({ ok: true as const }))
  const branchInfo = vi.fn(async () => ({
    ok: true as const,
    value: { roomId: 'sess-1', actorId: 'model-a' },
  }))
  const leaveRoom = vi.fn(async () => ({ ok: true as const }))
  const removeOccupantRemote = vi.fn(async () => ({ ok: true as const }))
  const openSession = vi.fn()
  const filterSessions = vi.fn((visible: (id: SessionId, list: {
    ids: string[]
    byId: Record<string, unknown>
    phase: 'ready'
    projectionsBySession: Record<string, unknown>
  }) => boolean) => {
    visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
    return () => {}
  })
  const startSession = vi.fn()
  const clearSession = vi.fn()
  const claimRoom = vi.fn(async () => ({ ok: true as const }))
  let mentionSource: InputTriggerSource | undefined
  ctx.provide('remote.collaboration', {
    listActors,
    listMentionModels,
    postMessage,
    sendWithRoom,
    publish,
    branchInfo,
    leaveRoom,
    removeOccupant: removeOccupantRemote,
    claimRoom,
  })
  const registered: unknown[] = []
  ctx.provide('uiConversation', {
    events: {
      register: (definition: unknown) => {
        registered.push(definition)
        return () => {}
      },
    },
  })
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('uiWorkspace', { openSession, filterSessions, startSession, clearSession })
  ctx.provide('sessions', stubSessions())
  ctx.provide('inputTriggers', {
    registerSource: (source: InputTriggerSource) => {
      mentionSource = source
      return () => { mentionSource = undefined }
    },
  })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.header.leading': { kind: 'single', scope: 'root' },
      'conversation.chat.node': { kind: 'keyed', scope: 'session' },
      'conversation.input.right': { kind: 'list', scope: 'session' },
      'conversation.composer.dock': { kind: 'list', scope: 'session' },
      'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  let dispose: (() => Promise<void>) | undefined
  const fiber = ctx.plugin({
    inject: [...inject],
    apply: async (plugin: Context) => {
      dispose = await mountCollaborationUi(plugin, REMOTE)
    },
  })
  await fiber.await()
  if (dispose === undefined) throw new Error('mount did not return a disposer')
  return {
    ctx, fiber, registered, dispose, unmount, listActors, listMentionModels,
    postMessage, sendWithRoom, publish, branchInfo, leaveRoom,
    removeOccupantRemote, openSession, mentionSource: () => mentionSource,
  }
}

describe('collaboration-room browser plugin', () => {
  it('registers a disposable header badge, Chat row, composer button, and Conversation Definition', async () => {
    const b = await bench()
    expect(inject).toEqual(['remote', 'uiConversation', 'slots', 'locale', 'inputTriggers', 'uiWorkspace', 'sessions'])
    expect(b.registered).toContain(collaborationMessageDefinition)
    expect(b.registered).toContain(collaborationThinkingDefinition)
    const badge = b.ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    expect(badge).toMatchObject({ locale: 'collaboration-room' })
    const row = b.ctx.slots.entries('conversation.chat.node')
      .find(entry => entry.component === RoomMessageView)
    expect(row).toMatchObject({
      options: { key: 'collaboration-message' },
      locale: 'collaboration-room',
    })
    const post = b.ctx.slots.entries('conversation.input.right')
      .find(entry => entry.component === RoomPostButton)
    expect(post).toMatchObject({
      options: { id: 'collaboration-room-post', order: 0 },
      locale: 'collaboration-room',
    })
    const thinkingRow = b.ctx.slots.entries('conversation.chat.node')
      .find(entry => entry.component === RoomThinkingView)
    expect(thinkingRow).toMatchObject({
      options: { key: 'collaboration-thinking' },
      locale: 'collaboration-room',
    })
    const thinkingDock = b.ctx.slots.entries('conversation.composer.dock')
      .find(entry => entry.component === RoomThinkingStatus)
    expect(thinkingDock).toMatchObject({
      options: { id: 'collaboration-thinking', order: -20 },
      locale: 'collaboration-room',
    })
    const t = b.ctx.locale.bind('collaboration-room')
    expect(t('send')).toBe('Post to room')
    expect(t('actor.aria')).toBe('Choose which human posts to the room')
    expect(t('thinking')).toBe('Deep diving')
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => unknown } } }
    const rowInjected = row?.inject?.() as { hooks: { actors: { getSnapshot: () => unknown } } }
    await vi.waitFor(() => {
      expect(injected.hooks.actors.getSnapshot()).toEqual({
        actors: [
          { id: 'alice', kind: 'human', name: 'Alice' },
          { id: 'bob', kind: 'human', name: 'Bob' },
        ],
        mentionModels: [
          { id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' },
        ],
        selectedHumanId: 'alice',
        selectedAiId: undefined,
        thinking: false,
        branchIds: [],
        localAccounts: false,
      })
    })
    expect(rowInjected.hooks.actors.getSnapshot()).toEqual(injected.hooks.actors.getSnapshot())
    expect(thinkingRow?.inject?.()).toEqual({ hooks: { actors: injected.hooks.actors } })
    expect(thinkingDock?.inject?.()).toEqual({ hooks: { actors: injected.hooks.actors } })

    await b.dispose()
    expect(b.unmount).toHaveBeenCalled()
    expect(b.ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)).toBeUndefined()
    expect(b.ctx.slots.entries('conversation.input.right')
      .find(entry => entry.component === RoomPostButton)).toBeUndefined()
  })

  it('routes an ordinary Send with a model chip to the room post', async () => {
    const b = await bench()
    const badge = b.ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { mentionModels: unknown[] } } } }
    await vi.waitFor(() => {
      expect(injected.hooks.actors.getSnapshot().mentionModels).toHaveLength(1)
    })
    const settled = await b.ctx.serial('conversation/before-send', {
      sessionId: 'sess-1',
      text: 'qwen-token-plan/qwen-plus look',
      draft: '@Qwen-Plus look',
      occurrences: [{ source: 'models', ref: 'qwen-token-plan/qwen-plus' }],
      attachmentCount: 0,
      mode: 'queue',
    } as never)
    expect(settled).toEqual({ kind: 'success' })
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', {
      actorId: 'alice',
      text: '@Qwen-Plus look',
      mentions: ['qwen-token-plan/qwen-plus'],
    })
    const passthrough = await b.ctx.serial('conversation/before-send', {
      sessionId: 'sess-1',
      text: 'plain hello',
      draft: 'plain hello',
      occurrences: [],
      attachmentCount: 0,
      mode: 'queue',
    } as never)
    expect(passthrough).toBeUndefined()
    await b.dispose()
  })

  it('passes attachments, remembered branches, and blank drafts through before-send', async () => {
    const b = await bench()
    const send = (request: Record<string, unknown>) => b.ctx.serial('conversation/before-send', request as never)
    const withChip = {
      sessionId: 'sess-1',
      text: 'qwen-token-plan/qwen-plus look',
      draft: '@Qwen-Plus look',
      occurrences: [{ source: 'models', ref: 'qwen-token-plan/qwen-plus' }],
      mode: 'queue',
    }
    await expect(send({ ...withChip, attachmentCount: 2 })).resolves.toBeUndefined()
    expect(b.postMessage).not.toHaveBeenCalled()
    await expect(send({ ...withChip, attachmentCount: 0, draft: '   ', text: '   ' })).resolves.toBeUndefined()
    expect(b.postMessage).not.toHaveBeenCalled()
    await expect(send({ ...withChip, attachmentCount: 0 })).resolves.toEqual({ kind: 'success' })
    expect(b.postMessage).toHaveBeenCalledTimes(1)
    // The post remembered child-a as a branch; a Send there keeps the ordinary path.
    await expect(send({ ...withChip, sessionId: 'child-a', attachmentCount: 0 })).resolves.toBeUndefined()
    expect(b.postMessage).toHaveBeenCalledTimes(1)
    b.postMessage.mockImplementationOnce(async () => ({
      ok: false as const,
      error: new RemoteError('collaboration/failed', 'down', { reason: 'down' }),
    }))
    await expect(send({ ...withChip, attachmentCount: 0 })).resolves.toEqual({ kind: 'error' })
    await b.dispose()
  })

  it('wires branch info, member removal, leave, and per-reply publish through the mount', async () => {
    const b = await bench()
    const badge = b.ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const badgeInjected = badge?.inject?.() as {
      selectHuman: (id: string) => void
      leave: (sessionId: string) => Promise<void>
      removeOccupant: (sessionId: string, targetId: string) => Promise<void>
      hooks: { actors: { getSnapshot: () => { selectedHumanId?: string } } }
    }
    await vi.waitFor(() => {
      expect(badgeInjected.hooks.actors.getSnapshot().selectedHumanId).toBe('alice')
    })
    await badgeInjected.leave('sess-1')
    expect(b.leaveRoom).toHaveBeenCalledWith('sess-1', 'alice')
    await badgeInjected.removeOccupant('sess-1', 'bob')
    expect(b.removeOccupantRemote).toHaveBeenCalledWith('sess-1', 'alice', 'bob')
    const store = badgeInjected.hooks.actors as unknown as { clearHuman: () => void }
    store.clearHuman()
    await badgeInjected.leave('sess-1')
    expect(b.leaveRoom).toHaveBeenCalledTimes(1)
    badgeInjected.selectHuman('alice')

    const post = b.ctx.slots.entries('conversation.input.right')
      .find(entry => entry.component === RoomPostButton)
    const postInjected = post?.inject?.('sess-1' as SessionId as never) as {
      branchInfo: (sessionId: string) => Promise<boolean>
      post: (text: string, mentions?: readonly string[]) => Promise<string | undefined>
      promptWithRoom: (text: string, mentions?: readonly string[]) => Promise<string | undefined>
    }
    await expect(postInjected.branchInfo('sess-1')).resolves.toBe(true)
    b.postMessage.mockImplementationOnce(async () => ({
      ok: true as const,
      value: { childSessionIds: [], failedActorIds: ['model-a'] },
    }))
    await expect(postInjected.post('hi', ['model-a'])).resolves.toContain('model-a')
    b.postMessage.mockImplementationOnce(async () => ({
      ok: true as const,
      value: { childSessionIds: [], failedActorIds: ['model-a'] },
    }))
    await expect(postInjected.promptWithRoom('hi', ['model-a'])).resolves.toContain('model-a')

    const action = b.ctx.slots.entries('conversation.chat.assistant-actions')
      .find(entry => entry.component === BranchPublishAction)
    expect(action).toMatchObject({ options: { id: 'collaboration-publish-reply', order: 20 } })
    const actionInjected = action?.inject?.('sess-1' as SessionId as never) as {
      publishReply: (messageId: string) => Promise<void>
      branchInfo: (sessionId: string) => Promise<boolean>
    }
    await actionInjected.publishReply('msg-7')
    expect(b.publish).toHaveBeenCalledWith('sess-1', 'alice', undefined, 'msg-7')
    await expect(actionInjected.branchInfo('sess-1')).resolves.toBe(true)
    await b.dispose()
  })

  it('restores the last session for a human after switching away', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    let mainId: string | undefined = 'room-1'
    const claimRoom = vi.fn(async () => ({ ok: true as const }))
    const clearSession = vi.fn(() => { mainId = undefined })
    const openSession = vi.fn((id: SessionId) => { mainId = id })
    const catalog = () => ({
      ids: ['room-1'],
      byId: {
        'room-1': {
          id: 'room-1',
          displayTitle: 'room',
          running: false,
          retainedBy: { mainView: mainId === 'room-1' ? 1 : 0 },
          blank: true,
          updatedAt: 0,
        },
      },
      phase: 'ready' as const,
      projectionsBySession: {
        'room-1': {
          state: 'ready' as const,
          error: null,
          values: { collaboration: { occupants: ['alice'], children: {} } },
        },
      },
    })
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [
          { id: 'alice', kind: 'human' as const, name: 'Alice' },
          { id: 'bob', kind: 'human' as const, name: 'Bob' },
        ],
      })),
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      claimRoom,
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession,
      filterSessions: vi.fn(() => () => {}),
      startSession: vi.fn(),
      clearSession,
    })
    ctx.provide('sessions', stubSessions({ getSnapshot: catalog }))
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => {
      const roster = ctx.slots.entries('conversation.header.leading')
        .find(entry => entry.component === RoomBadge)
        ?.inject?.() as { hooks: { actors: { getSnapshot: () => { selectedHumanId: string | undefined } } } }
      expect(roster.hooks.actors.getSnapshot().selectedHumanId).toBe('alice')
    })
    expect(claimRoom).not.toHaveBeenCalled()
    const injected = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
      ?.inject?.() as { selectHuman: (id: string) => void }
    injected.selectHuman('bob')
    expect(clearSession).toHaveBeenCalled()
    expect(openSession).not.toHaveBeenCalled()
    injected.selectHuman('alice')
    expect(openSession).toHaveBeenCalledWith('room-1')
    await fiber.dispose()
  })

  it('keeps the restored session when it is already open', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    let mainId: string | undefined = 'room-1'
    const openSession = vi.fn((id: SessionId) => { mainId = id })
    const catalog = () => ({
      ids: ['room-1'],
      byId: {
        'room-1': {
          id: 'room-1',
          displayTitle: 'room',
          running: false,
          retainedBy: { mainView: mainId === 'room-1' ? 1 : 0 },
          blank: false,
          updatedAt: 0,
        },
      },
      phase: 'ready' as const,
      projectionsBySession: {
        'room-1': {
          state: 'ready' as const,
          error: null,
          values: { collaboration: { occupants: ['alice', 'bob'], children: {} } },
        },
      },
    })
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [
          { id: 'alice', kind: 'human' as const, name: 'Alice' },
          { id: 'bob', kind: 'human' as const, name: 'Bob' },
        ],
      })),
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      claimRoom: vi.fn(async () => ({ ok: true as const })),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession,
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('room-1' as SessionId, catalog())
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(() => { mainId = undefined }),
    })
    ctx.provide('sessions', stubSessions({ getSnapshot: catalog }))
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => {
      const roster = ctx.slots.entries('conversation.header.leading')
        .find(entry => entry.component === RoomBadge)
        ?.inject?.() as { hooks: { actors: { getSnapshot: () => { selectedHumanId: string | undefined } } } }
      expect(roster.hooks.actors.getSnapshot().selectedHumanId).toBe('alice')
    })
    const injected = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
      ?.inject?.() as { selectHuman: (id: string) => void }
    injected.selectHuman('bob')
    mainId = 'room-1'
    injected.selectHuman('alice')
    expect(openSession).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('leaves the roster empty when listActors returns not ok', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    const listActors = vi.fn(async () => ({
      ok: false as const,
      error: new Error('offline'),
    }))
    const publish = vi.fn()
    const sendWithRoom = vi.fn()
    ctx.provide('remote.collaboration', {
      listActors,
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      publish,
      sendWithRoom,
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => { expect(listActors).toHaveBeenCalled() })
    const badge = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => unknown } } }
    expect(injected.hooks.actors.getSnapshot()).toEqual({
      actors: [],
      mentionModels: [],
      selectedHumanId: undefined,
      selectedAiId: undefined,
      thinking: false,
      branchIds: [],
      localAccounts: false,
    })
    const post = ctx.slots.entries('conversation.input.right')
      .find(entry => entry.component === RoomPostButton)
      ?.inject?.('sess-1' as SessionId as never) as {
      publish: () => Promise<void>
      promptWithRoom: (text: string) => Promise<void>
    }
    await post.publish()
    await post.promptWithRoom('hello')
    expect(publish).not.toHaveBeenCalled()
    expect(sendWithRoom).not.toHaveBeenCalled()
    await fiber.dispose()
  })

  it('leaves the roster empty when listActors fails', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    const listActors = vi.fn(async () => {
      throw new Error('offline')
    })
    ctx.provide('remote.collaboration', {
      listActors,
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => { expect(listActors).toHaveBeenCalled() })
    const badge = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => unknown } } }
    expect(injected.hooks.actors.getSnapshot()).toEqual({
      actors: [],
      mentionModels: [],
      selectedHumanId: undefined,
      selectedAiId: undefined,
      thinking: false,
      branchIds: [],
      localAccounts: false,
    })
    await fiber.dispose()
  })

  it('ignores a late listActors result after dispose', async () => {
    let settle: ((result: { ok: true; value: readonly { id: string; kind: 'human'; name: string }[] }) => void) | undefined
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    const listActors = vi.fn(() => new Promise<{ ok: true; value: readonly { id: string; kind: 'human'; name: string }[] }>((resolve) => {
      settle = resolve
    }))
    ctx.provide('remote.collaboration', {
      listActors,
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    let dispose: (() => Promise<void>) | undefined
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: async (plugin: Context) => { dispose = await mountCollaborationUi(plugin, REMOTE) },
    })
    await fiber.await()
    const badge = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => unknown } } }
    await dispose?.()
    settle?.({ ok: true, value: [{ id: 'alice', kind: 'human', name: 'Alice' }] })
    await Promise.resolve()
    expect(injected.hooks.actors.getSnapshot()).toEqual({
      actors: [],
      mentionModels: [],
      selectedHumanId: undefined,
      selectedAiId: undefined,
      thinking: false,
      branchIds: [],
      localAccounts: false,
    })
  })

  it('ignores a late listActors rejection after dispose', async () => {
    let fail: ((error: Error) => void) | undefined
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    const listActors = vi.fn(() => new Promise<never>((_resolve, reject) => { fail = reject }))
    ctx.provide('remote.collaboration', {
      listActors,
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    let dispose: (() => Promise<void>) | undefined
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: async (plugin: Context) => { dispose = await mountCollaborationUi(plugin, REMOTE) },
    })
    await fiber.await()
    await dispose?.()
    fail?.(new Error('offline'))
    await Promise.resolve()
  })

  it('leaves mention models empty when listMentionModels rejects while mounted', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    const listMentionModels = vi.fn(async () => {
      throw new Error('offline')
    })
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [{ id: 'alice', kind: 'human' as const, name: 'Alice' }],
      })),
      listMentionModels,
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => { expect(listMentionModels).toHaveBeenCalled() })
    const badge = ctx.slots.entries('conversation.header.leading')
      .find(entry => entry.component === RoomBadge)
    const injected = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { mentionModels: unknown } } } }
    expect(injected.hooks.actors.getSnapshot().mentionModels).toEqual([])
    await fiber.dispose()
  })

  it('leaves mention models empty when listMentionModels is not ok', async () => {
    const b = await bench()
    b.listMentionModels.mockResolvedValueOnce({ ok: false as const, error: new Error('offline') })
    const badgeSelect = b.ctx.slots.entries('conversation.header.leading')
      .find(candidate => candidate.component === RoomBadge)
    const injected = badgeSelect?.inject?.() as { selectHuman: (id: string) => void }
    injected.selectHuman('bob')
    await vi.waitFor(() => { expect(b.listMentionModels).toHaveBeenCalledWith('bob') })
    const badge = b.ctx.slots.entries('conversation.header.leading')
      .find(candidate => candidate.component === RoomBadge)
    const roster = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { mentionModels: unknown } } } }
    expect(roster.hooks.actors.getSnapshot().mentionModels).toEqual([])
    await b.dispose()
  })

  it('drops a stale listMentionModels result after switching humans', async () => {
    let settleAlice: ((result: { ok: true; value: readonly { id: string; kind: 'ai'; name: string }[] }) => void) | undefined
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [
          { id: 'alice', kind: 'human' as const, name: 'Alice' },
          { id: 'bob', kind: 'human' as const, name: 'Bob' },
        ],
      })),
      listMentionModels: vi.fn(async (actorId: string) => {
        if (actorId === 'alice') {
          return await new Promise<{ ok: true; value: readonly { id: string; kind: 'ai'; name: string }[] }>((resolve) => {
            settleAlice = resolve
          })
        }
        return {
          ok: true as const,
          value: [{ id: 'deepseek-official/deepseek-chat', kind: 'ai' as const, name: 'DeepSeek Chat' }],
        }
      }),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply: async (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await fiber.await()
    await vi.waitFor(() => { expect(settleAlice).toBeDefined() })
    const badgeSelect = ctx.slots.entries('conversation.header.leading')
      .find(candidate => candidate.component === RoomBadge)
    const injected = badgeSelect?.inject?.() as { selectHuman: (id: string) => void }
    injected.selectHuman('bob')
    await vi.waitFor(() => {
      const badge = ctx.slots.entries('conversation.header.leading')
        .find(candidate => candidate.component === RoomBadge)
      const roster = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { mentionModels: { name: string }[] } } } }
      expect(roster.hooks.actors.getSnapshot().mentionModels.map(model => model.name)).toEqual(['DeepSeek Chat'])
    })
    settleAlice?.({ ok: true, value: [{ id: 'qwen-token-plan/qwen-plus', kind: 'ai', name: 'Qwen-Plus' }] })
    await Promise.resolve()
    const badge = ctx.slots.entries('conversation.header.leading')
      .find(candidate => candidate.component === RoomBadge)
    const roster = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { mentionModels: { name: string }[] } } } }
    expect(roster.hooks.actors.getSnapshot().mentionModels.map(model => model.name)).toEqual(['DeepSeek Chat'])
    await fiber.dispose()
  })

  it('ignores a late listMentionModels rejection after dispose', async () => {
    let fail: ((error: Error) => void) | undefined
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return async () => {} }
    }
    new Remote()
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({
        ok: true as const,
        value: [{ id: 'alice', kind: 'human' as const, name: 'Alice' }],
      })),
      listMentionModels: vi.fn(() => new Promise<never>((_resolve, reject) => { fail = reject })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    let dispose: (() => Promise<void>) | undefined
    const fiber = ctx.plugin({
      inject: [...inject],
      apply: async (plugin: Context) => { dispose = await mountCollaborationUi(plugin, REMOTE) },
    })
    await fiber.await()
    await vi.waitFor(() => { expect(fail).toBeDefined() })
    await dispose?.()
    fail?.(new Error('offline'))
    await Promise.resolve()
  })

  it('posts the draft as the first human occupant on the current Session', async () => {
    const b = await bench()
    const entry = b.ctx.slots.entries('conversation.input.right')
      .find(candidate => candidate.component === RoomPostButton)
    const injected = entry?.inject?.('sess-1' as SessionId as never) as {
      post: (text: string, mentions?: readonly string[]) => Promise<void>
      promptWithRoom: (text: string, mentions?: readonly string[]) => Promise<void>
      publish: () => Promise<void>
      thinking: (value: boolean) => void
    }
    const badgeSelect = b.ctx.slots.entries('conversation.header.leading')
      .find(candidate => candidate.component === RoomBadge)
    const badge = badgeSelect?.inject?.() as { selectHuman: (id: string) => void }
    await vi.waitFor(() => {
      const badge = b.ctx.slots.entries('conversation.header.leading')
        .find(candidate => candidate.component === RoomBadge)
      const roster = badge?.inject?.() as { hooks: { actors: { getSnapshot: () => { selectedHumanId: string | undefined } } } }
      expect(roster.hooks.actors.getSnapshot().selectedHumanId).toBe('alice')
    })
    await injected.publish()
    expect(b.publish).toHaveBeenCalledWith('sess-1', 'alice', undefined, undefined)
    injected.thinking(true)
    expect(
      (badgeSelect?.inject?.() as { hooks: { actors: { getSnapshot: () => { thinking: boolean } } } })
        .hooks.actors.getSnapshot().thinking,
    ).toBe(true)
    injected.thinking(true)
    injected.thinking(false)
    await injected.post('hello room')
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', { actorId: 'alice', text: 'hello room' })
    const source = b.mentionSource()
    await vi.waitFor(async () => {
      const listed = await source!.candidates({ sessionId: 'sess-1' as SessionId }, {
        query: '',
        quoted: false,
        position: 'inline',
        drilled: false,
        signal: new AbortController().signal,
      })
      expect(listed.some(item => item.name === 'Qwen-Plus')).toBe(true)
    })
    const qwen = (await source!.candidates({ sessionId: 'sess-1' as SessionId }, {
      query: '',
      quoted: false,
      position: 'inline',
      drilled: false,
      signal: new AbortController().signal,
    })).find(item => item.name === 'Qwen-Plus')
    source!.onPick({
      candidate: qwen!,
      session: { sessionId: 'sess-1' as SessionId },
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span: { start: 0, end: 1, draftRev: 1 },
    })
    await injected.post('still a room line')
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', { actorId: 'alice', text: 'still a room line' })
    await injected.post('@Qwen-Plus look', ['qwen-token-plan/qwen-plus'])
    await injected.promptWithRoom('@Qwen-Plus look', ['qwen-token-plan/qwen-plus'])
    badge.selectHuman('bob')
    await injected.post('from bob')
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', { actorId: 'bob', text: 'from bob' })
    await injected.promptWithRoom('what did Alice say?')
    expect(b.sendWithRoom).toHaveBeenCalledWith('sess-1', 'what did Alice say?', 'bob')
    await injected.promptWithRoom('@Qwen-Plus look', ['qwen-token-plan/qwen-plus'])
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', {
      actorId: 'bob',
      text: '@Qwen-Plus look',
      mentions: ['qwen-token-plan/qwen-plus'],
    })
    expect(b.openSession).not.toHaveBeenCalledWith('child-a')
    expect(source).toMatchObject({ trigger: '@', name: 'models', order: -10 })
    await vi.waitFor(async () => {
      const listed = await source!.candidates({ sessionId: 'sess-1' as SessionId }, {
        query: '',
        quoted: false,
        position: 'inline',
        drilled: false,
        signal: new AbortController().signal,
      })
      expect(listed.map(item => item.name)).toEqual(['Alice', 'DeepSeek Chat'])
    })
    const models = await source!.candidates({ sessionId: 'sess-1' as SessionId }, {
      query: '',
      quoted: false,
      position: 'inline',
      drilled: false,
      signal: new AbortController().signal,
    })
    source!.onPick({
      candidate: models.find(item => item.name === 'DeepSeek Chat')!,
      session: { sessionId: 'sess-1' as SessionId },
      position: 'inline',
      via: 'menu',
      action: 'pick',
      span: { start: 0, end: 1, draftRev: 1 },
    })
    await injected.post('wake a')
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', {
      actorId: 'bob',
      text: 'wake a',
    })
    await injected.post('via chips', ['deepseek-official/deepseek-chat'])
    expect(b.postMessage).toHaveBeenCalledWith('sess-1', {
      actorId: 'bob',
      text: 'via chips',
      mentions: ['deepseek-official/deepseek-chat'],
    })
    await injected.promptWithRoom('from store')
    expect(b.sendWithRoom).toHaveBeenCalledWith('sess-1', 'from store', 'bob')
    await b.dispose()
  })

  it('withdraws the Remote mount when registration fails', async () => {
    const ctx = new Context()
    const unmount = vi.fn(async () => {})
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() { return unmount }
    }
    new Remote()
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({ ok: true as const, value: [] })),
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot failed') })
    const fiber = ctx.plugin({ inject: [...inject], apply: (plugin: Context) => mountCollaborationUi(plugin, REMOTE) })
    await expect(fiber).rejects.toThrow('slot failed')
    expect(unmount).toHaveBeenCalled()
  })

  it('surfaces a refused post as a RemoteError', async () => {
    const b = await bench()
    b.postMessage.mockResolvedValueOnce({
      ok: false as const,
      error: new RemoteError('collaboration/failed', 'flush failed', { reason: 'flush failed' }),
    })
    const entry = b.ctx.slots.entries('conversation.input.right')
      .find(candidate => candidate.component === RoomPostButton)
    const injected = entry?.inject?.('sess-1' as SessionId as never) as { post: (text: string) => Promise<void> }
    await expect(injected.post('hello')).rejects.toThrow('flush failed')
    await b.dispose()
  })

  it('keeps the Host half inert', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('apply mounts the generated Remote contribution', async () => {
    const ctx = new Context()
    const unmount = vi.fn(async () => {})
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount(contribution: TypertRemoteContribution) {
        expect(contribution.package).toBe('@deepseek-ai/dsh-experimental-api-collaboration')
        return unmount
      }
    }
    new Remote()
    ctx.provide('remote.collaboration', {
      listActors: vi.fn(async () => ({ ok: true as const, value: [] })),
      listMentionModels: vi.fn(async () => ({ ok: true as const, value: [] })),
      postMessage: vi.fn(),
      admitRoomContext: vi.fn(),
    })
    ctx.provide('uiConversation', { events: { register: () => () => {} } })
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('uiWorkspace', {
      openSession: vi.fn(),
      filterSessions: vi.fn((visible: (id: SessionId, list: unknown) => boolean) => {
        visible('x' as SessionId, { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
        return () => {}
      }),
      startSession: vi.fn(),
      clearSession: vi.fn(),
    })
    ctx.provide('sessions', stubSessions())
    ctx.provide('inputTriggers', { registerSource: () => () => {} })
    await ctx.plugin(SlotRegistry)
    ctx.slots.register({
      name: 'root',
      children: {
        'conversation.header.leading': { kind: 'single', scope: 'root' },
        'conversation.chat.node': { kind: 'keyed', scope: 'session' },
        'conversation.input.right': { kind: 'list', scope: 'session' },
        'conversation.composer.dock': { kind: 'list', scope: 'session' },
        'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
      },
    } as never, () => null)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.right')
      .find(entry => entry.component === RoomPostButton)).toBeDefined()
    await fiber.dispose()
  })
})
