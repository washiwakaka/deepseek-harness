/** Chat Definition for an in-flight AI child started by `collaboration/actor-invoked`. */

import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-experimental-collaboration/types'

/** Chat payload for one AI occupant's thinking row. */
export interface CollaborationThinkingChatData {
  readonly actorId: string
  readonly running: boolean
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** In-flight mention child until that AI posts a room line. */
    'collaboration-thinking': CollaborationThinkingChatData
  }
}

interface CollaborationThinkingState extends CollaborationThinkingChatData {
  readonly seq: number
}

function thinkId(actorId: string): string {
  return `think:${actorId}`
}

/** Show a thinking row from invoke until that actor's auto-posted room line. */
export const collaborationThinkingDefinition: ConversationNodeDefinition<CollaborationThinkingState> = {
  kind: 'collaboration-thinking',
  target: 'chat',
  match: (event) => {
    if (event.type === 'collaboration/actor-invoked') {
      return { id: thinkId(String(event.data.actorId)), role: 'start' }
    }
    if (event.type === 'collaboration/message' && event.data.kind === 'ai') {
      return { id: thinkId(String(event.data.actorId)), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'collaboration/actor-invoked') {
      throw new Error('collaboration-thinking start requires collaboration/actor-invoked')
    }
    return {
      seq: match.event.seq,
      actorId: String(match.event.data.actorId),
      running: true,
    }
  },
  update: (context, match) => {
    if (match.event.type === 'collaboration/actor-invoked') {
      return {
        seq: match.event.seq,
        actorId: String(match.event.data.actorId),
        running: true,
      }
    }
    if (match.event.type === 'collaboration/message' && match.event.data.kind === 'ai') {
      return { ...context.state, running: false }
    }
    return context.state
  },
  buildViewNode: (context) => {
    if (context.state === undefined || !context.state.running) return null
    return {
      key: context.key,
      kind: 'collaboration-thinking',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        actorId: context.state.actorId,
        running: true,
      },
    }
  },
}
