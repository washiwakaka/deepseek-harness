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
import { RoomThinkingStatus, type RoomThinkingStatusInjected } from './RoomThinkingStatus.tsx'
import { RoomThinkingView, type RoomThinkingInjected } from './RoomThinkingView.tsx'
import { collaborationMessageDefinition } from './message-definition.ts'
import { collaborationThinkingDefinition } from './thinking-definition.ts'
import { collaborationMentionSource } from './mention-source.ts'
import { claimRoom, postRoomDraft, publishFromChild, sendWithRoom } from './post-draft.ts'
import { sessionVisibleTo } from './visibility.ts'
import { en, ja, es, fr, de, ru, pt, NS, zh, type CollaborationRoomKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Collaboration-room header, Chat-row, and composer-button copy. */
    'collaboration-room': CollaborationRoomKey
  }
}

/** Required browser services for Conversation nodes, slots, Remote posts, and localized copy. */
export const inject = ['remote', 'uiConversation', 'slots', 'locale', 'inputTriggers', 'uiWorkspace', 'sessions']

function registerCollaborationUi(ctx: ClientContext): void {
  ctx.uiConversation.events.register(collaborationMessageDefinition)
  ctx.uiConversation.events.register(collaborationThinkingDefinition)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-collaboration: dictionaries')
  const actors = new ActorRosterStore()
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
        if (cancelled || token !== generation || !result.ok) return
        actors.setMentionModels(result.value)
      }, () => {
        if (cancelled) return
      })
    }
    void ctx.remote.collaboration.listActors().then((result) => {
      if (cancelled || !result.ok) return
      actors.set(result.value)
      loadMentions(actors.getSnapshot().selectedHumanId)
    }, () => {
      if (cancelled) return
    })
    const unsubscribe = actors.subscribe(() => {
      loadMentions(actors.getSnapshot().selectedHumanId)
    })
    const seen = new Set<string>()
    const claimed = new Set<string>()
    const lastByHuman = new Map<string, SessionId>()
    let selectedHuman: string | undefined
    let catalogReady = false
    const claimBlank = (id: SessionId, humanId: string) => {
      if (claimed.has(id)) return
      claimed.add(id)
      void claimRoom(ctx.remote.collaboration, id, humanId).then(() => undefined, () => {
        if (cancelled) return
        claimed.delete(id)
      })
    }
    const syncAccess = () => {
      const humanId = actors.getSnapshot().selectedHumanId
      const catalog = ctx.sessions.list.getSnapshot()
      const switched = selectedHuman !== undefined && humanId !== selectedHuman
      selectedHuman = humanId
      if (humanId === undefined) {
        ctx.uiWorkspace.filterSessions(() => true)
        return
      }
      const current = Object.values(catalog.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
      if (!switched && current?.blank === true) claimBlank(current.id, humanId)
      ctx.uiWorkspace.filterSessions((id, list) => sessionVisibleTo(humanId, list, id, claimed))
      if (switched) {
        const remembered = lastByHuman.get(humanId)
        if (remembered !== undefined && sessionVisibleTo(humanId, catalog, remembered, claimed)) {
          if (current?.id !== remembered) ctx.uiWorkspace.openSession(remembered)
        } else if (current !== undefined) {
          ctx.uiWorkspace.clearSession()
        }
      } else if (current !== undefined && sessionVisibleTo(humanId, catalog, current.id, claimed)) {
        lastByHuman.set(humanId, current.id)
      } else if (current !== undefined) {
        ctx.uiWorkspace.clearSession()
      }
      if (!catalogReady) {
        if (catalog.phase !== 'ready') return
        for (const id of catalog.ids) seen.add(id)
        catalogReady = true
      }
      if (switched) return
      for (const id of catalog.ids) {
        if (seen.has(id)) continue
        seen.add(id)
        const row = catalog.byId[id]
        if (row?.blank !== true) continue
        claimBlank(id, humanId)
      }
    }
    const unsubActorsAccess = actors.subscribe(syncAccess)
    const unsubList = ctx.sessions.list.subscribe(syncAccess)
    syncAccess()
    return () => {
      cancelled = true
      unsubscribe()
      unsubActorsAccess()
      unsubList()
      ctx.uiWorkspace.filterSessions(() => true)
    }
  }, 'client-ui-collaboration: listActors')
  ctx.slots.inject(
    'conversation.header.leading',
    () => ctx.slots.register({
      name: 'conversation.header.leading',
      locale: NS,
      inject: (): RoomBadgeInjected => ({
        selectHuman: (id) => { actors.selectHuman(id) },
        hooks: { actors },
      }),
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
        post: async (text, mentions = []) => {
          const snapshot = actors.getSnapshot()
          const ids = await postRoomDraft(
            ctx.remote.collaboration,
            sessionId,
            text,
            snapshot.selectedHumanId,
            mentions.length > 0 ? mentions : undefined,
          )
          for (const id of ids) {
            actors.addBranch(id)
            try {
              ctx.uiWorkspace.openSession(id as SessionId)
            } catch (_openFailed) {
              // The room line already landed; a missing catalog row must not look like a failed post.
            }
          }
        },
        promptWithRoom: async (text, mentions = []) => {
          const snapshot = actors.getSnapshot()
          if (mentions.length > 0) {
            const opened = await postRoomDraft(
              ctx.remote.collaboration,
              sessionId,
              text,
              snapshot.selectedHumanId,
              mentions,
            )
            for (const id of opened) {
              actors.addBranch(id)
              try {
                ctx.uiWorkspace.openSession(id as SessionId)
              } catch (_openFailed) {
                // The room line already landed; a missing catalog row must not look like a failed post.
              }
            }
            return
          }
          const humanId = snapshot.selectedHumanId
          if (humanId === undefined) return
          await sendWithRoom(ctx.remote.collaboration, sessionId, text, humanId)
        },
        hooks: { actors },
      }),
    }, RoomPostButton),
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
