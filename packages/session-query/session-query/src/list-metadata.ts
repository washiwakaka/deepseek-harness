/** Session-list metadata projection definition registered by `SessionQueryEngine`. */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { SessionListMetadata } from './types.ts'

const sessionListMetadataSchema: z.ZodType<SessionListMetadata> = z.object({
  blank: z.boolean(),
  lastPromptAt: z.number().nullable(),
})

/**
 * Event types that give a Session user-visible content. A collaboration room
 * post counts even though the room Session itself never runs a turn; without
 * it the room reads as blank forever and never earns a sidebar row.
 */
const CONTENT_EVENT_TYPES: ReadonlySet<string> = new Set(['turn/start', 'collaboration/message'])

/** Advance blankness and human-prompt recency without retaining history. */
function applySessionListMetadata(
  state: SessionListMetadata,
  event: SessionEvent,
): SessionListMetadata {
  const blank = state.blank && !CONTENT_EVENT_TYPES.has(event.type)
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  return blank === state.blank && lastPromptAt === state.lastPromptAt
    ? state
    : { blank, lastPromptAt }
}

/** Blankness and latest human-prompt time folded per Session; persisted at state version 2. */
export const sessionListMetadataDefinition = {
  key: 'sessionListMetadata',
  stateSchema: sessionListMetadataSchema,
  init: () => ({ blank: true, lastPromptAt: null }),
  apply: applySessionListMetadata,
  wire: { viewSchema: sessionListMetadataSchema, view: state => state },
  stateVersion: 2,
} satisfies ProjectionDefinition<'sessionListMetadata', SessionListMetadata>
