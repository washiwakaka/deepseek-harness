import type { ReactNode } from 'react'
import { IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { isRoomSession } from './visibility.ts'
import { NS } from './locales.ts'
import css from './RoomRowMark.module.css'

/** Injected Session catalog used to tell room rows from ordinary ones. */
export interface RoomRowMarkInjected {
  hooks: { sessions: HostObservable<SessionListState> }
}

/** Full props of the room mark after one Session row's time label. */
export type RoomRowMarkProps =
  PropsRuntime<'sidebar.session.row.trailing'>
  & InjectFace<RoomRowMarkInjected>
  & PropsLocale<typeof NS>

/**
 * Multi-person mark on a collaboration room's sidebar row, so a shared room
 * reads differently from the viewer's own conversations and branches.
 * @param props - row Session identity, injected Session catalog, locale binder.
 * @returns the users icon for a room row, or nothing for any other row.
 */
export function RoomRowMark({ sessionId, useSessions, t }: RoomRowMarkProps): ReactNode {
  const room = useSessions(list => isRoomSession(list, sessionId))
  if (!room) return null
  return (
    <span className={css.mark} role="img" aria-label={t('badge')}>
      <IconUsersOutlineRegular size={13} />
    </span>
  )
}
