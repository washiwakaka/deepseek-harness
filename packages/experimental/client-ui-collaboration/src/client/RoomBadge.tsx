import { IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { NS } from './locales.ts'
import css from './RoomBadge.module.css'

/** Injected Host occupant roster from `listActors`. */
export interface RoomBadgeInjected {
  selectHuman: (id: string) => void
  hooks: { actors: HostObservable<ActorRosterSnapshot> }
}

/** Full props of the collaboration-room header leading control. */
export type RoomBadgeProps =
  PropsRuntime<'conversation.header.leading'>
  & InjectFace<RoomBadgeInjected>
  & PropsLocale<typeof NS>

/** Marker that the overlay loaded, plus the Config human switch. */
export function RoomBadge({
  t, selectHuman, useActors,
}: RoomBadgeProps) {
  const actors = useActors(snapshot => snapshot.actors)
  const selectedHumanId = useActors(snapshot => snapshot.selectedHumanId)
  const localAccounts = useActors(snapshot => snapshot.localAccounts)
  const humans = actors.filter(actor => actor.kind === 'human')
  const fallbackHumanId = humans[0]?.id
  const signed = humans.find(human => human.id === selectedHumanId)
  const names = actors.map(actor => actor.name).join(' · ')
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
    </span>
  )
}
