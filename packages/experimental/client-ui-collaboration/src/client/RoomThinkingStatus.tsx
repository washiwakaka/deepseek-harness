import { memo } from 'react'
import { IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { NS } from './locales.ts'
import css from './RoomThinkingView.module.css'

/** Injected in-flight flag for send-with-room and post-to-room. */
export interface RoomThinkingStatusInjected {
  hooks: { actors: HostObservable<ActorRosterSnapshot> }
}

/** Full props of the composer-dock thinking indicator. */
export type RoomThinkingStatusProps =
  PropsRuntime<'conversation.composer.dock'>
  & InjectFace<RoomThinkingStatusInjected>
  & PropsLocale<typeof NS>

/** Deep-diving shimmer while a collaboration Remote call is in flight. */
export const RoomThinkingStatus = memo(function RoomThinkingStatus({
  t, useActors,
}: RoomThinkingStatusProps) {
  const thinking = useActors(snapshot => snapshot.thinking)
  if (!thinking) return null
  return (
    <div
      className={css.running}
      data-chat-running
      role="status"
      aria-live="polite"
      aria-label={t('thinking')}
    >
      <span className={css.content}>
        <IconThinkOutlineRegular size={16} />
        <TextShimmer active className={css.text}>{t('thinking')}</TextShimmer>
      </span>
    </div>
  )
})
