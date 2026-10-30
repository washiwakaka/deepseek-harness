import { memo } from 'react'
import { IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { occupantName } from './actor-roster.ts'
import { NS } from './locales.ts'
import css from './RoomThinkingView.module.css'

/** Injected roster used to label the thinking row. */
export interface RoomThinkingInjected {
  hooks: { actors: HostObservable<ActorRosterSnapshot> }
}

/** Full props of one collaboration-room thinking Chat row. */
export type RoomThinkingViewProps =
  PropsRuntime<'conversation.chat.node', 'collaboration-thinking'>
  & InjectFace<RoomThinkingInjected>
  & PropsLocale<typeof NS>

/** Deep-diving shimmer for one invoked AI child until its room line arrives. */
export const RoomThinkingView = memo(function RoomThinkingView({
  node, t, useActors,
}: RoomThinkingViewProps) {
  const name = useActors(snapshot => occupantName(snapshot, node.data.actorId))
  return (
    <div
      className={css.running}
      data-chat-running
      data-side="ai"
      role="status"
      aria-live="polite"
      aria-label={t('thinking.aria', { name })}
    >
      <span className={css.content}>
        <IconThinkOutlineRegular size={16} />
        <TextShimmer active className={css.text}>{t('thinking')}</TextShimmer>
      </span>
    </div>
  )
})
