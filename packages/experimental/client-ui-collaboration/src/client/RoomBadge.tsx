import { useState } from 'react'
import { IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { occupantName } from './actor-roster.ts'
import { NS } from './locales.ts'
import css from './RoomBadge.module.css'

/** Injected Host occupant roster from `listActors`. */
export interface RoomBadgeInjected {
  selectHuman: (id: string) => void
  leave: (sessionId: string) => Promise<void>
  removeOccupant: (sessionId: string, targetId: string) => Promise<void>
  hooks: {
    actors: HostObservable<ActorRosterSnapshot>
    sessions: HostObservable<SessionListState>
  }
}

/** Full props of the collaboration-room header leading control. */
export type RoomBadgeProps =
  PropsRuntime<'conversation.header.leading'>
  & InjectFace<RoomBadgeInjected>
  & PropsLocale<typeof NS>

interface RoomOccupants {
  readonly sessionId: string
  readonly occupants: readonly string[]
}

function occupantsOf(list: SessionListState): RoomOccupants | undefined {
  const current = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
  if (current === undefined) return undefined
  const values = list.projectionsBySession[current.id]?.values as
    | { collaboration?: { occupants?: readonly string[] } }
    | undefined
  const occupants = values?.collaboration?.occupants
  if (occupants === undefined || occupants.length === 0) return undefined
  return { sessionId: current.id, occupants }
}

/** Marker that the overlay loaded, plus the Config human switch and room members. */
export function RoomBadge({
  t, selectHuman, leave, removeOccupant, useActors, useSessions,
}: RoomBadgeProps) {
  const actors = useActors(snapshot => snapshot.actors)
  const snapshot = useActors(value => value)
  const selectedHumanId = useActors(value => value.selectedHumanId)
  const localAccounts = useActors(value => value.localAccounts)
  const room = useSessions(list => occupantsOf(list))
  const [error, setError] = useState<string | null>(null)
  const humans = actors.filter(actor => actor.kind === 'human')
  const fallbackHumanId = humans[0]?.id
  const signed = humans.find(human => human.id === selectedHumanId)
  const names = actors.map(actor => actor.name).join(' · ')
  const memberNames = room?.occupants.map(id => occupantName(snapshot, id)) ?? []
  const isCreator = room !== undefined && room.occupants[0] === selectedHumanId
  const isOccupant = room !== undefined && selectedHumanId !== undefined && room.occupants.includes(selectedHumanId)
  const canLeave = isOccupant && (!isCreator || room.occupants.length === 1)
  const run = (action: () => Promise<void>): void => {
    setError(null)
    void action().then(() => {}, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t('send.failed'))
    })
  }
  return (
    <span className={css.badge} role="status" aria-label={names === '' ? t('badge') : t('roster.aria', { names })}>
      <IconUsersOutlineRegular size={14} />
      <span className={css.label}>{t('badge')}</span>
      {localAccounts
        ? signed === undefined ? null : <span className={css.who}>{signed.name}</span>
        : fallbackHumanId === undefined ? null : (
          <select
            className={css.actor}
            aria-label={t('actor.aria')}
            value={selectedHumanId ?? fallbackHumanId}
            onChange={(event) => { selectHuman(event.target.value) }}
          >
            {humans.map(human => (
              <option key={human.id} value={human.id}>{human.name}</option>
            ))}
          </select>
        )}
      {room !== undefined && (
        <span className={css.members} aria-label={t('occupants.aria', { names: memberNames.join(' · ') })}>
          {room.occupants.map(id => (
            <span key={id} className={css.member}>
              {occupantName(snapshot, id)}
              {isCreator && id !== selectedHumanId && (
                <button
                  type="button"
                  className={css.mini}
                  aria-label={t('occupants.remove', { name: occupantName(snapshot, id) })}
                  onClick={() => { run(() => removeOccupant(room.sessionId, id)) }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canLeave && (
            <button
              type="button"
              className={css.mini}
              onClick={() => { run(() => leave(room.sessionId)) }}
            >
              {t('occupants.leave')}
            </button>
          )}
        </span>
      )}
      {error !== null && <span className={css.error} role="status">{error}</span>}
    </span>
  )
}
