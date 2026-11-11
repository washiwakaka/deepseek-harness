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
    /** Identity is loaded and nobody is signed in. */
    'collaboration/unauthorized': { readonly reason: string }
    /** The branch reply selected for publishing is already on its room or parent branch. */
    'collaboration/already-published': { readonly reason: string }
    /** The branch or its room could not be resumed from persistence. */
    'collaboration/child-missing': { readonly reason: string }
    /** The durable collaboration projection has failed and the room is read-only. */
    'collaboration/projection-failed': { readonly reason: string }
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
  /** Mentioned AI occupant ids whose branch could not be started. */
  readonly failedActorIds: readonly string[]
}

/** Room branch ownership of one Session, when it is a mention branch. */
export interface CollaborationBranchInfo {
  readonly roomId: string
  readonly actorId: string
  /** Assistant reply message ids this branch produced itself; inherited replies are excluded. */
  readonly replyIds: readonly string[]
}
