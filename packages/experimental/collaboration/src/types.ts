/** Public collaboration-room identities, durable records, and service request values. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'

/** Stable identifier for one Config occupant. */
export type ActorId = Branded<'ActorId'>

/**
 * Brand a validated occupant id.
 * @param id - Config occupant identity.
 * @returns the same string branded as an occupant identity.
 */
export function ActorId(id: string): ActorId {
  return id as ActorId
}

/** Stable identifier for one room message. */
export type CollaborationMessageId = Branded<'CollaborationMessageId'>

/**
 * Brand a generated room-message id.
 * @param id - Durable room-message identity.
 * @returns the same string branded as a room-message identity.
 */
export function CollaborationMessageId(id: string): CollaborationMessageId {
  return id as CollaborationMessageId
}

/** Occupant kind listed in Host Config. */
export type ActorKind = 'human' | 'ai'

/** One Config occupant. */
export interface ActorConfig {
  /** Stable occupant identity used in `mentions` and room events. */
  readonly id: string
  /** Whether this occupant is a human author or an @-invoked AI. */
  readonly kind: ActorKind
  /** Display name compiled into child transcripts. */
  readonly name: string
  /** Permission group used in child session titles. Humans only. */
  readonly group?: string
  /**
   * Provider ids this human may `@`. Empty means every connected Settings provider.
   * Humans only.
   */
  readonly providers?: string[]
  /** Required when {@link kind} is `ai`. */
  readonly provider?: string
  /** Required when {@link kind} is `ai`. */
  readonly model?: string
}

/** Collaboration-service deployment limits and occupant roster. */
export interface Config {
  /**
   * Human authors and optional Config AI occupants.
   * Omit to use Alice/Bob with per-human provider allowlists; Clients list `@` models through `listMentionModels`.
   */
  readonly actors?: ActorConfig[]
  /** Maximum UTF-8 bytes in one room message. */
  readonly maxMessageBytes?: number
}

/** Resolved human occupant. */
export interface ResolvedHumanActor {
  readonly id: ActorId
  readonly kind: 'human'
  readonly name: string
  readonly group: string
  readonly providers: string[]
}

/** Resolved AI occupant. */
export interface ResolvedAiActor {
  readonly id: ActorId
  readonly kind: 'ai'
  readonly name: string
  readonly provider: string
  readonly model: string
}

/** Resolved Config occupant. */
export type ResolvedActor = ResolvedHumanActor | ResolvedAiActor

/** Input for one room post. */
export interface PostMessageRequest {
  readonly actorId: ActorId
  readonly text: string
  /** Human ids to invite and AI ids to wake. */
  readonly mentions?: readonly ActorId[]
}

/** Result of one room post after mentioned branches have started. */
export interface PostMessageResult {
  readonly childSessionIds: readonly SessionId[]
}

/** One projected room-visible line. */
export interface CollaborationMessage {
  readonly id: CollaborationMessageId
  readonly seq: SessionSeq
  readonly actorId: ActorId
  readonly kind: ActorKind
  readonly name: string
  readonly text: string
  readonly mentions: readonly ActorId[]
}

/** Durable client view of one room. */
export interface CollaborationProjection {
  readonly messages: readonly CollaborationMessage[]
  readonly children: Readonly<Record<string, SessionId>>
  readonly watermarks: Readonly<Record<string, SessionSeq>>
  /** Humans who may see and operate on this room, creator first. */
  readonly occupants: readonly ActorId[]
  readonly failure?: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Room-visible lines, AI children, and per-actor compile watermarks. */
    collaboration: CollaborationProjection
  }
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'collaboration-mention': {
      kind: 'collaboration-mention'
      roomId: SessionId
      actorId: ActorId
      throughSeq: SessionSeq
    }
    /** Uncompiled peer-chat delta logged before a room-Agent Send that requested it. */
    'collaboration-room-context': {
      kind: 'collaboration-room-context'
      roomId: SessionId
      throughSeq: SessionSeq
    }
  }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** One room-visible line from a human or an auto-posted AI reply. */
    'collaboration/message': {
      version: 1
      id: CollaborationMessageId
      actorId: ActorId
      kind: ActorKind
      name: string
      text: string
      mentions: ActorId[]
    }
    /** First persistent child for one AI occupant. */
    'collaboration/branch-opened': {
      version: 1
      actorId: ActorId
      childSessionId: SessionId
      baseSeq: SessionSeq
    }
    /** One @ invoke of an AI occupant, recording the compiled-through seq. */
    'collaboration/actor-invoked': {
      version: 1
      actorId: ActorId
      childSessionId: SessionId
      throughSeq: SessionSeq
    }
    /** One human admitted to this room: the creator, or a later @-invite. */
    'collaboration/occupant': {
      version: 1
      actorId: ActorId
    }
  }
}
