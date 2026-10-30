/** JSON-safe inputs and results of the experimental collaboration Remote. */

import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The posted actor id is not in the Host roster. */
    'collaboration/unknown-actor': { readonly actorId: string }
    /** A mention named a human or other non-AI occupant. */
    'collaboration/not-ai': { readonly actorId: string }
    /** The calling human is not an occupant of this room. */
    'collaboration/forbidden': { readonly actorId: string }
    /** The post failed validation before any child turn. */
    'collaboration/invalid-argument': { readonly reason: string }
    /** The room rejected the post after validation. */
    'collaboration/failed': { readonly reason: string }
  }
}

/** One occupant the Client may show in the room-post select. */
export interface CollaborationActorRow {
  readonly id: string
  readonly kind: 'human' | 'ai'
  readonly name: string
}

/** One room post from the authenticated Client. */
export interface CollaborationPostRequest {
  readonly actorId: string
  readonly text: string
  readonly mentions?: readonly string[]
}

/** Started branch Session ids after a room post. */
export interface CollaborationPostResult {
  readonly childSessionIds: readonly string[]
}
