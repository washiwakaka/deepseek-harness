/** `@` source that lists room humans and Settings models above the built-in reference groups. */

import { IconSparkleRegular, IconUserOutlineRegular, rankByName } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InputTriggerCandidate,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { CollaborationActorRow } from '@deepseek-ai/dsh-experimental-api-collaboration/types'
import type { ActorRosterStore } from './actor-roster.ts'
import type { CollaborationRoomKey } from './locales.ts'

/** Menu group name; lower `order` lists this source above files and sessions. */
export const MENTION_SOURCE_NAME = 'models'

/** Translate one collaboration-room dictionary key. */
type Translate = (key: CollaborationRoomKey, params?: Record<string, unknown>) => string

interface MentionCandidate {
  readonly id: string
  readonly name: string
  readonly kind: 'human' | 'ai'
}

/**
 * Registerable `@` source for room humans and Settings models this human may mention.
 * @param actors - live Host roster and mention list.
 * @param t - collaboration-room dictionary.
 * @returns the source; picking a model records it as the next room-post mention.
 */
export function collaborationMentionSource(
  actors: ActorRosterStore,
  t: Translate,
): InputTriggerSource {
  return {
    trigger: '@',
    name: MENTION_SOURCE_NAME,
    order: -10,
    showGroupTitle: false,
    async candidates(_session, { query, quoted, drilled, signal }) {
      if (quoted === true || drilled || signal.aborted) return []
      const snapshot = actors.getSnapshot()
      const rows: CollaborationActorRow[] = [
        ...snapshot.actors.filter(actor =>
          actor.kind === 'human' && actor.id !== snapshot.selectedHumanId),
        ...snapshot.mentionModels,
      ]
      return rankByName(rows, query).map(actor => mentionCandidate(actor, t))
    },
    onPick({ candidate }) {
      const actor = parseMentionCandidate(candidate.value)
      if (actor === undefined) return undefined
      if (actor.kind === 'ai') actors.selectAi(actor.id)
      return {
        insert: {
          source: MENTION_SOURCE_NAME,
          ref: actor.id,
          label: actor.name,
          clipboardText: `@${actor.name}`,
        },
      }
    },
    codec: {
      clipboardText: ref => clipboardName(actors, ref),
      serialize: ref => Promise.resolve(ref),
    },
  }
}

/**
 * Mention route ids from composer chips that name a Settings model.
 * @param occurrences - InputState reference chips in clipboard order.
 * @param aiIds - Settings model ids the current human may `@`.
 * @returns unique model route ids in chip order.
 */
export function modelMentionIds(
  occurrences: readonly { readonly source: string; readonly ref: string }[],
  aiIds: readonly string[] = [],
): readonly string[] {
  return roomMentionIds(occurrences, aiIds)
}

/**
 * Mention ids from composer chips that name a room human or a Settings model.
 * @param occurrences - InputState reference chips in clipboard order.
 * @param allowedIds - human occupant ids and Settings model ids the poster may `@`.
 * @returns unique ids in chip order.
 */
export function roomMentionIds(
  occurrences: readonly { readonly source: string; readonly ref: string }[],
  allowedIds: readonly string[] = [],
): readonly string[] {
  const allowed = new Set(allowedIds)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const occurrence of occurrences) {
    if (occurrence.source !== MENTION_SOURCE_NAME || !allowed.has(occurrence.ref) || seen.has(occurrence.ref)) {
      continue
    }
    seen.add(occurrence.ref)
    ids.push(occurrence.ref)
  }
  return ids
}

function mentionCandidate(actor: CollaborationActorRow, t: Translate): InputTriggerCandidate {
  return {
    name: actor.name,
    icon: actor.kind === 'human' ? IconUserOutlineRegular : IconSparkleRegular,
    section: actor.kind === 'human' ? t('section.people') : t('section.models'),
    value: JSON.stringify({ id: actor.id, name: actor.name, kind: actor.kind }),
  }
}

function parseMentionCandidate(value: string | undefined): MentionCandidate | undefined {
  if (value === undefined) return undefined
  const parsed = JSON.parse(value) as MentionCandidate
  if (parsed.kind !== 'human' && parsed.kind !== 'ai') return undefined
  return parsed
}

function clipboardName(actors: ActorRosterStore, ref: string): string {
  const snapshot = actors.getSnapshot()
  const row = snapshot.actors.find(actor => actor.id === ref)
    ?? snapshot.mentionModels.find(actor => actor.id === ref)
  return row === undefined ? `@${ref}` : `@${row.name}`
}
