/** Room state projected incrementally from committed collaboration events. */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionEvent, SessionEventMap, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { SessionSeq as toSessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import {
  ActorId as toActorId,
  CollaborationMessageId as toMessageId,
} from './types.ts'
import type {
  ActorId,
  ActorKind,
  CollaborationMessage,
  CollaborationMessageId,
  CollaborationProjection,
} from './types.ts'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const sessionIdSchema = z.string().min(1).transform(value => brandString<SessionId>(value))
const sessionSeqSchema = nonNegativeSafeInteger.transform(value => toSessionSeq(value))
const actorIdSchema = z.string().min(1).transform(value => toActorId(value))
const messageIdSchema = z.string().min(1).transform(value => toMessageId(value))
const actorKindSchema = z.enum(['human', 'ai']) satisfies z.ZodType<ActorKind>

const messageSchema = z.object({
  id: messageIdSchema,
  seq: sessionSeqSchema,
  actorId: actorIdSchema,
  kind: actorKindSchema,
  name: z.string().min(1),
  text: z.string(),
  mentions: z.array(actorIdSchema),
}).strict() as z.ZodType<CollaborationMessage>

const collaborationMessageEventSchema = z.object({
  version: z.literal(1),
  id: messageIdSchema,
  actorId: actorIdSchema,
  kind: actorKindSchema,
  name: z.string().min(1),
  text: z.string(),
  mentions: z.array(actorIdSchema),
}).strict() as z.ZodType<SessionEventMap['collaboration/message']>

const branchOpenedEventSchema = z.object({
  version: z.literal(1),
  actorId: actorIdSchema,
  childSessionId: sessionIdSchema,
  baseSeq: sessionSeqSchema,
}).strict() as z.ZodType<SessionEventMap['collaboration/branch-opened']>

const actorInvokedEventSchema = z.object({
  version: z.literal(1),
  actorId: actorIdSchema,
  childSessionId: sessionIdSchema,
  throughSeq: sessionSeqSchema,
}).strict() as z.ZodType<SessionEventMap['collaboration/actor-invoked']>

/** Checkpoint-safe room state owned by the projected Session. */
export interface CollaborationProjectionState {
  readonly messages: readonly CollaborationMessage[]
  readonly children: Readonly<Record<string, SessionId>>
  readonly watermarks: Readonly<Record<string, SessionSeq>>
  readonly occupants: readonly ActorId[]
  readonly failure?: string
}

/**
 * Construct empty room state.
 * @returns empty collaboration state.
 */
export function emptyCollaborationState(): CollaborationProjectionState {
  return { messages: [], children: {}, watermarks: {}, occupants: [] }
}

const occupantEventSchema = z.object({
  version: z.literal(1),
  actorId: actorIdSchema,
}).strict() as z.ZodType<SessionEventMap['collaboration/occupant']>

const collaborationStateSchema = z.object({
  messages: z.array(messageSchema),
  children: z.record(z.string(), sessionIdSchema),
  watermarks: z.record(z.string(), sessionSeqSchema),
  occupants: z.array(actorIdSchema),
  failure: z.string().optional(),
}).strict() as z.ZodType<CollaborationProjectionState>

const collaborationViewSchema = z.object({
  messages: z.array(messageSchema),
  children: z.record(z.string(), sessionIdSchema),
  watermarks: z.record(z.string(), sessionSeqSchema),
  occupants: z.array(actorIdSchema),
  failure: z.string().optional(),
}).strict() as z.ZodType<CollaborationProjection>

/** Whether one event belongs to the collaboration domain. */
export type CollaborationEventType =
  | 'collaboration/message'
  | 'collaboration/branch-opened'
  | 'collaboration/actor-invoked'
  | 'collaboration/occupant'

/** One event owned by the collaboration domain. */
type CollaborationSessionEvent = SessionEvent<CollaborationEventType>

/**
 * Test whether a Session event belongs to the collaboration domain.
 * @param event - candidate Session event.
 * @returns whether the event has a collaboration-owned type.
 */
export function isCollaborationEvent(event: SessionEvent): event is CollaborationSessionEvent {
  return event.type === 'collaboration/message'
    || event.type === 'collaboration/branch-opened'
    || event.type === 'collaboration/actor-invoked'
    || event.type === 'collaboration/occupant'
}

/** Decode one persisted collaboration value and retain the schema failure as its cause. */
function parsePersisted<T>(type: CollaborationEventType, schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value)
  } catch (error: unknown) {
    throw new Error(`persisted collaboration ${type} payload is invalid`, { cause: error })
  }
}

function applyProjectionEvent(
  state: CollaborationProjectionState,
  event: SessionEvent,
): CollaborationProjectionState {
  if (state.failure !== undefined) return state
  if (!isCollaborationEvent(event)) return state
  try {
    return applyCurrentEvent(state, event)
  } catch (error: unknown) {
    /* v8 ignore next -- the owned transition throws Error instances. */
    return { ...state, failure: error instanceof Error ? error.message : String(error) }
  }
}

function withOccupant(
  state: CollaborationProjectionState,
  actorId: ActorId,
): CollaborationProjectionState {
  if (state.occupants.includes(actorId)) return state
  return { ...state, occupants: [...state.occupants, actorId] }
}

function applyCurrentEvent(
  state: CollaborationProjectionState,
  event: CollaborationSessionEvent,
): CollaborationProjectionState {
  switch (event.type) {
    case 'collaboration/message': {
      const data = parsePersisted(event.type, collaborationMessageEventSchema, event.data)
      if (state.messages.some(message => message.id === data.id)) {
        throw new Error(`collaboration message "${data.id}" was posted twice`)
      }
      const message: CollaborationMessage = {
        id: data.id,
        seq: event.seq,
        actorId: data.actorId,
        kind: data.kind,
        name: data.name,
        text: data.text,
        mentions: data.mentions,
      }
      const next = { ...state, messages: [...state.messages, message] }
      return data.kind === 'human' ? withOccupant(next, data.actorId) : next
    }
    case 'collaboration/occupant': {
      const data = parsePersisted(event.type, occupantEventSchema, event.data)
      return withOccupant(state, data.actorId)
    }
    case 'collaboration/branch-opened': {
      const data = parsePersisted(event.type, branchOpenedEventSchema, event.data)
      if (state.children[data.actorId] !== undefined) {
        throw new Error(`collaboration child for "${data.actorId}" was opened twice`)
      }
      return { ...state, children: { ...state.children, [data.actorId]: data.childSessionId } }
    }
    case 'collaboration/actor-invoked': {
      const data = parsePersisted(event.type, actorInvokedEventSchema, event.data)
      const child = state.children[data.actorId]
      if (child === undefined) {
        throw new Error(`collaboration actor "${data.actorId}" was invoked before a child opened`)
      }
      if (child !== data.childSessionId) {
        throw new Error(`collaboration actor "${data.actorId}" invoked a different child`)
      }
      return { ...state, watermarks: { ...state.watermarks, [data.actorId]: data.throughSeq } }
    }
    /* v8 ignore next 2 -- CollaborationEventType is closed and every member is handled above. */
    default:
      return state
  }
}

/**
 * Durable client view of one room state.
 * @param state - current room state.
 * @returns the wire view, including any projection failure.
 */
export function collaborationProjectionView(state: CollaborationProjectionState): CollaborationProjection {
  return {
    messages: state.messages,
    children: state.children,
    watermarks: state.watermarks,
    occupants: state.occupants,
    ...state.failure === undefined ? {} : { failure: state.failure },
  }
}

/** Room projection selected by the projected Session identity. */
export const collaborationProjectionDefinition = {
  key: 'collaboration',
  stateVersion: 2,
  stateSchema: collaborationStateSchema,
  init: (_header, _inheritedEventCount) => emptyCollaborationState(),
  apply: applyProjectionEvent,
  wire: { viewSchema: collaborationViewSchema, view: collaborationProjectionView },
} satisfies ProjectionDefinition<'collaboration', CollaborationProjectionState>

/**
 * Latest compiled-through seq for one AI occupant, if any.
 * @param state - current room state.
 * @param actorId - AI occupant.
 * @returns the watermark seq, or `undefined` when that occupant has never been invoked.
 */
export function watermarkOf(
  state: CollaborationProjectionState,
  actorId: ActorId,
): SessionSeq | undefined {
  return state.watermarks[actorId]
}

/**
 * Persistent child Session for one AI occupant, if any.
 * @param state - current room state.
 * @param actorId - AI occupant.
 * @returns the child Session identity, or `undefined` before the first invoke.
 */
export function childOf(
  state: CollaborationProjectionState,
  actorId: ActorId,
): SessionId | undefined {
  return state.children[actorId]
}

export type { CollaborationMessageId }
