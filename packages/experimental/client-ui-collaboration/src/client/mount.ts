/** Source-safe collaboration-room browser registration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-experimental-api-collaboration/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { ActorRosterStore } from './actor-roster.ts'
import { RoomBadge, type RoomBadgeInjected } from './RoomBadge.tsx'
import { RoomMessageView, type RoomMessageInjected } from './RoomMessageView.tsx'
import { RoomPostButton, type RoomPostInjected } from './RoomPostButton.tsx'
import { BranchPublishAction, type BranchPublishInjected } from './BranchPublishAction.tsx'
import { RoomThinkingStatus, type RoomThinkingStatusInjected } from './RoomThinkingStatus.tsx'
import { RoomThinkingView, type RoomThinkingInjected } from './RoomThinkingView.tsx'
import { collaborationMessageDefinition } from './message-definition.ts'
import { collaborationThinkingDefinition } from './thinking-definition.ts'
import { collaborationMentionSource, roomMentionIds } from './mention-source.ts'
import { branchInfoOf, leaveRoom, postBranchDraft, postRoomDraft, publishFromChild, removeOccupant, sendWithRoom } from './post-draft.ts'
import { en, ja, es, fr, de, ru, pt, NS, zh, type CollaborationRoomKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Collaboration-room header, Chat-row, and composer-button copy. */
    'collaboration-room': CollaborationRoomKey
  }
}

/** Required browser services for Conversation nodes, slots, Remote posts, and localized copy. */
export const inject = ['remote', 'uiConversation', 'slots', 'locale', 'inputTriggers', 'uiWorkspace', 'sessions']

/**
 * Remember mention branches without leaving the room Session.
 * The sidebar nests the branch under that room via `parentSession`. The
 * owner publishes from the branch when they want the reply on the room.
 * @param actors - Client roster that tracks opened branch ids.
 * @param ids - branch Session ids returned by a room post.
 */
function rememberMentionedBranches(
  actors: ActorRosterStore,
  ids: readonly string[],
): void {
  for (const id of ids) actors.addBranch(id)
}

function registerCollaborationUi(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.uiConversation.events.register(collaborationMessageDefinition),
    'client-ui-collaboration: message definition',
  )
  ctx.effect(
    () => ctx.uiConversation.events.register(collaborationThinkingDefinition),
    'client-ui-collaboration: thinking definition',
  )
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-collaboration: dictionaries')
  const actors = new ActorRosterStore()
  // An ordinary composer Send carrying mention chips never reaches the
  // Session Agent as a prompt: in a room it is a room post routed to
  // collaboration/postMessage, and inside a mention branch its model chips
  // invoke sub-branches via collaboration/postBranchMessage, so @-mentioned
  // models and humans are never silently dropped.
  ctx.effect(() => ctx.on('conversation/before-send', async (request) => {
    if (request.attachmentCount > 0) return undefined
    const snapshot = actors.getSnapshot()
    const humanId = snapshot.selectedHumanId
    if (humanId === undefined) return undefined
    const mentions = roomMentionIds(request.occurrences, [
      ...snapshot.actors.filter(actor => actor.kind === 'human' && actor.id !== humanId).map(actor => actor.id),
      ...snapshot.mentionModels.map(model => model.id),
    ])
    if (mentions.length === 0) return undefined
    const text = request.draft.trim()
    if (text === '') return undefined
    const modelMentions = mentions.filter(id => snapshot.mentionModels.some(model => model.id === id))
    // Inside a mention branch, a Send carrying model chips invokes those
    // models in sub-branches of the branch instead of prompting the branch
    // Agent, so the owner can cross-check models where the work happens.
    const onBranch = snapshot.branchIds.includes(request.sessionId)
      || (await branchInfoOf(ctx.remote.collaboration, request.sessionId as SessionId)) !== undefined
    if (onBranch) {
      if (modelMentions.length === 0) return undefined
      try {
        const posted = await postBranchDraft(
          ctx.remote.collaboration,
          request.sessionId as SessionId,
          text,
          humanId,
          modelMentions,
        )
        rememberMentionedBranches(actors, posted.childSessionIds)
        return { kind: 'success' as const }
      } catch (postError) {
        void postError
        return { kind: 'error' as const }
      }
    }
    try {
      const posted = await postRoomDraft(
        ctx.remote.collaboration,
        request.sessionId as SessionId,
        text,
        humanId,
        mentions,
      )
      rememberMentionedBranches(actors, posted.childSessionIds)
      return { kind: 'success' as const }
    } catch (postError) {
      void postError
      return { kind: 'error' as const }
    }
  }), 'client-ui-collaboration: before-send room mentions')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.inputTriggers.registerSource(collaborationMentionSource(actors, t)),
    'client-ui-collaboration: @ models',
  )
  ctx.effect(() => {
    let cancelled = false
    let listedHuman: string | undefined
    let generation = 0
    const loadMentions = (humanId: string | undefined) => {
      if (humanId === undefined || humanId === listedHuman) return
      listedHuman = humanId
      const token = ++generation
      void ctx.remote.collaboration.listMentionModels(humanId).then((result) => {
        if (cancelled || token !== generation) return
        if (!result.ok) {
          listedHuman = undefined
          return
        }
        actors.setMentionModels(result.value)
      }, () => {
        if (cancelled || token !== generation) return
        listedHuman = undefined
      })
    }
    const identity = ctx.get('identitySession') as {
      getSnapshot(): { current?: { id: string; admin?: boolean } }
      subscribe(listener: () => void): () => void
    } | undefined
    const applyIdentity = (): void => {
      actors.setLocalAccounts(identity !== undefined)
      const current = identity?.getSnapshot().current
      if (current === undefined) {
        if (identity !== undefined) actors.clearHuman()
        return
      }
      actors.selectHuman(current.id)
    }
    void ctx.remote.collaboration.listActors().then((result) => {
      if (cancelled || !result.ok) return
      actors.set(result.value)
      applyIdentity()
      loadMentions(actors.getSnapshot().selectedHumanId)
    }, () => {
      if (cancelled) return
    })
    const unsubscribe = actors.subscribe(() => {
      loadMentions(actors.getSnapshot().selectedHumanId)
    })
    const unsubIdentity = identity?.subscribe(() => {
      void ctx.remote.collaboration.listActors().then((result) => {
        if (cancelled || !result.ok) return
        actors.set(result.value)
        applyIdentity()
      }, () => {
        if (cancelled) return
      })
    })
    const lastByHuman = new Map<string, SessionId>()
    let selectedHuman: string | undefined
    const syncAccess = () => {
      const humanId = actors.getSnapshot().selectedHumanId
      const catalog = ctx.sessions.list.getSnapshot()
      const switched = selectedHuman !== undefined && humanId !== selectedHuman
      selectedHuman = humanId
      if (humanId === undefined) return
      const current = Object.values(catalog.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
      if (switched) {
        const remembered = lastByHuman.get(humanId)
        if (remembered !== undefined) {
          if (current?.id !== remembered) ctx.uiWorkspace.openSession(remembered)
        } else if (current !== undefined) {
          ctx.uiWorkspace.clearSession()
        }
        return
      }
      if (current !== undefined) lastByHuman.set(humanId, current.id)
    }
    const unsubActorsAccess = actors.subscribe(syncAccess)
    const unsubList = ctx.sessions.list.subscribe(syncAccess)
    syncAccess()
    return () => {
      cancelled = true
      unsubscribe()
      unsubIdentity?.()
      unsubActorsAccess()
      unsubList()
    }
  }, 'client-ui-collaboration: listActors')
  const auth = (): RoomBadgeInjected => ({
    selectHuman: (id) => { actors.selectHuman(id) },
    leave: async (targetSessionId) => {
      const humanId = actors.getSnapshot().selectedHumanId
      if (humanId === undefined) return
      await leaveRoom(ctx.remote.collaboration, targetSessionId as SessionId, humanId)
    },
    removeOccupant: async (targetSessionId, targetId) => {
      const humanId = actors.getSnapshot().selectedHumanId
      if (humanId === undefined) return
      await removeOccupant(ctx.remote.collaboration, targetSessionId as SessionId, humanId, targetId)
    },
    hooks: { actors, sessions: ctx.sessions.list },
  })
  ctx.slots.inject(
    'conversation.header.leading',
    () => ctx.slots.register({
      name: 'conversation.header.leading',
      locale: NS,
      inject: auth,
    }, RoomBadge),
  )
  ctx.slots.inject(
    'conversation.chat.node',
    () => ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'collaboration-message',
      locale: NS,
      inject: (): RoomMessageInjected => ({ hooks: { actors } }),
    }, RoomMessageView),
  )
  ctx.slots.inject(
    'conversation.chat.node',
    () => ctx.slots.register({
      name: 'conversation.chat.node',
      key: 'collaboration-thinking',
      locale: NS,
      inject: (): RoomThinkingInjected => ({ hooks: { actors } }),
    }, RoomThinkingView),
  )
  ctx.slots.inject(
    'conversation.composer.dock',
    () => ctx.slots.register({
      name: 'conversation.composer.dock',
      id: 'collaboration-thinking',
      order: -20,
      locale: NS,
      inject: (): RoomThinkingStatusInjected => ({ hooks: { actors } }),
    }, RoomThinkingStatus),
  )
  ctx.slots.inject(
    'conversation.input.right',
    () => ctx.slots.register({
      name: 'conversation.input.right',
      id: 'collaboration-room-post',
      order: 0,
      locale: NS,
      inject: (sessionId: SessionId): RoomPostInjected => ({
        sessionId,
        thinking: (value) => { actors.setThinking(value) },
        publish: async () => {
          const humanId = actors.getSnapshot().selectedHumanId
          if (humanId === undefined) return
          await publishFromChild(ctx.remote.collaboration, sessionId, humanId)
        },
        branchInfo: async (targetSessionId) => {
          const info = await branchInfoOf(ctx.remote.collaboration, targetSessionId as SessionId)
          return info !== undefined
        },
        post: async (text, mentions = []) => {
          const snapshot = actors.getSnapshot()
          const posted = await postRoomDraft(
            ctx.remote.collaboration,
            sessionId,
            text,
            snapshot.selectedHumanId,
            mentions.length > 0 ? mentions : undefined,
          )
          rememberMentionedBranches(actors, posted.childSessionIds)
          if (posted.failedActorIds.length > 0) {
            return t('send.partialFailed', { names: posted.failedActorIds.join(', ') })
          }
          return undefined
        },
        promptWithRoom: async (text, mentions = []) => {
          const snapshot = actors.getSnapshot()
          if (mentions.length > 0) {
            const posted = await postRoomDraft(
              ctx.remote.collaboration,
              sessionId,
              text,
              snapshot.selectedHumanId,
              mentions,
            )
            rememberMentionedBranches(actors, posted.childSessionIds)
            if (posted.failedActorIds.length > 0) {
              return t('send.partialFailed', { names: posted.failedActorIds.join(', ') })
            }
            return undefined
          }
          const humanId = snapshot.selectedHumanId
          if (humanId === undefined) return undefined
          await sendWithRoom(ctx.remote.collaboration, sessionId, text, humanId)
          return undefined
        },
        hooks: { actors, sessions: ctx.sessions.list },
      }),
    }, RoomPostButton),
  )
  ctx.slots.inject(
    'conversation.chat.assistant-actions',
    () => ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'collaboration-publish-reply',
      order: 20,
      locale: NS,
      inject: (sessionId: SessionId): BranchPublishInjected => ({
        sessionId,
        publishReply: async (messageId) => {
          const humanId = actors.getSnapshot().selectedHumanId
          if (humanId === undefined) return
          await publishFromChild(ctx.remote.collaboration, sessionId, humanId, { assistantMessageId: messageId })
        },
        branchInfo: async (targetSessionId, targetMessageId) => {
          const info = await branchInfoOf(ctx.remote.collaboration, targetSessionId as SessionId)
          if (info === undefined) return { branch: false, ownReply: false }
          return { branch: true, ownReply: info.replyIds.includes(targetMessageId) }
        },
        hooks: { actors, sessions: ctx.sessions.list },
      }),
    }, BranchPublishAction),
  )
}

/**
 * Mount the collaboration Remote and register Chat rows, the header leading switch, and the composer post button.
 * @param ctx - Client Context with the declared `inject` services available.
 * @param contribution - generated `collaboration` Remote contribution.
 * @returns disposer that withdraws the UI then the Remote mount.
 */
export async function mountCollaborationUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.collaboration', 'uiConversation', 'slots', 'locale', 'inputTriggers', 'uiWorkspace', 'sessions'], registerCollaborationUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
