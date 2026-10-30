import { memo } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { NS } from './locales.ts'
import { roomMessageSide } from './message-side.ts'
import css from './RoomMessageView.module.css'

/** Injected test-human selection used to place room lines. */
export interface RoomMessageInjected {
  hooks: { actors: HostObservable<ActorRosterSnapshot> }
}

/** Full props of one collaboration-room Chat row. */
export type RoomMessageViewProps =
  PropsRuntime<'conversation.chat.node', 'collaboration-message'>
  & InjectFace<RoomMessageInjected>
  & PropsLocale<typeof NS>

/** Name and text of one durable room line, placed against the selected test human. */
export const RoomMessageView = memo(function RoomMessageView({ node, t, useActors }: RoomMessageViewProps) {
  const selectedHumanId = useActors(snapshot => snapshot.selectedHumanId)
  const side = roomMessageSide(node.data.kind, node.data.actorId, selectedHumanId)
  return (
    <div className={css.wrap} data-side={side}>
      <div
        className={css.row}
        data-kind={node.data.kind}
        role="group"
        aria-label={t('message.aria', { name: node.data.name })}
      >
        <div className={css.name}>{node.data.name}</div>
        <div className={css.text}>{node.data.text}</div>
        {node.data.kind === 'ai' ? (
          <div className={css.from}>{t('message.from', { name: node.data.name })}</div>
        ) : null}
      </div>
    </div>
  )
})
