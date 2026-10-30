/** Chat Definition for one durable `collaboration/message` event. */

import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ActorKind } from '@deepseek-ai/dsh-experimental-collaboration/client'
import type {} from '@deepseek-ai/dsh-experimental-collaboration/types'

/** Final Chat payload for one room-visible line. */
export interface CollaborationMessageChatData {
  readonly actorId: string
  readonly name: string
  readonly kind: ActorKind
  readonly text: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** One human or auto-posted AI room line. */
    'collaboration-message': CollaborationMessageChatData
  }
}

interface CollaborationMessageState extends CollaborationMessageChatData {
  readonly seq: number
}

/** Project each room line as its own Chat row. */
export const collaborationMessageDefinition: ConversationNodeDefinition<CollaborationMessageState> = {
  kind: 'collaboration-message',
  target: 'chat',
  match: event => event.type === 'collaboration/message'
    ? { id: String(event.data.id), role: 'start' }
    : null,
  start: (_context, match) => {
    if (match.event.type !== 'collaboration/message') {
      throw new Error('collaboration-message start requires collaboration/message')
    }
    return {
      seq: match.event.seq,
      actorId: match.event.data.actorId,
      name: match.event.data.name,
      kind: match.event.data.kind,
      text: match.event.data.text,
    }
  },
  update: context => context.state,
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'collaboration-message',
      id: context.id,
      target: 'chat',
      anchorSeq: context.state.seq,
      location: context.start?.location ?? { kind: 'unresolved' },
      visibility: 'visible',
      data: {
        actorId: context.state.actorId,
        name: context.state.name,
        kind: context.state.kind,
        text: context.state.text,
      },
    }
  },
}
