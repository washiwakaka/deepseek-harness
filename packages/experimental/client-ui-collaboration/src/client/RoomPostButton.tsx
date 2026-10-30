import { useEffect, useRef, useState } from 'react'
import { IconSendOutlineRegular, IconUsersOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { roomMentionIds } from './mention-source.ts'
import { isNoHumanPostError } from './post-draft.ts'
import { NS } from './locales.ts'
import css from './RoomPostButton.module.css'

/** Injected post of the current Session's trimmed composer draft as the selected test human. */
export interface RoomPostInjected {
  sessionId: string
  post: (text: string, mentions: readonly string[]) => Promise<void>
  promptWithRoom: (text: string, mentions: readonly string[]) => Promise<void>
  publish: () => Promise<void>
  thinking: (value: boolean) => void
  hooks: { actors: HostObservable<ActorRosterSnapshot> }
}

/** Full props of the compact room-post control before the composer Send button. */
export type RoomPostButtonProps =
  PropsRuntime<'conversation.input.right'>
  & InjectFace<RoomPostInjected>
  & PropsLocale<typeof NS>

/**
 * Localized failure copy for a room post or send-with-room rejection.
 * @param reason - rejection from the Remote helper.
 * @param t - collaboration-room locale binder.
 */
function sendErrorCopy(reason: unknown, t: RoomPostButtonProps['t']): string {
  if (isNoHumanPostError(reason)) return t('send.noHuman')
  const remote = remoteErrorOf(reason)
  if (remote !== undefined) return remote.message
  return reason instanceof Error ? reason.message : t('send.failed')
}

/**
 * Posts the composer draft through the collaboration Remote, or admits room context then followups.
 */
export function RoomPostButton({
  useInput, inputActions, sessionId, post, promptWithRoom, publish, thinking, useActors, t,
}: RoomPostButtonProps) {
  const draft = useInput(s => s.draft)
  const phase = useInput(s => s.phase)
  const occurrences = useInput(s => s.occurrences ?? [])
  const mentionModels = useActors(snapshot => snapshot.mentionModels ?? [])
  const humans = useActors(snapshot => snapshot.actors.filter(actor => actor.kind === 'human'))
  const selectedHumanId = useActors(snapshot => snapshot.selectedHumanId)
  const mentions = roomMentionIds(occurrences, [
    ...humans.map(human => human.id).filter(id => id !== selectedHumanId),
    ...mentionModels.map(model => model.id),
  ])
  const onBranch = useActors(snapshot => snapshot.branchIds?.includes(sessionId) === true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      thinking(false)
    }
  }, [thinking])
  const text = draft.trim()
  const busy = sending || phase !== 'plain'
  const postDisabled = busy || text === '' || selectedHumanId === undefined
  const promptDisabled = busy || text === ''

  const finish = (action: () => Promise<void>): void => {
    setSending(true)
    thinking(true)
    setError(null)
    void action().then(() => {
      thinking(false)
      if (!alive.current) return
      setSending(false)
      inputActions.setDraft('')
    }, (reason: unknown) => {
      thinking(false)
      if (!alive.current) return
      setSending(false)
      setError(sendErrorCopy(reason, t))
    })
  }

  return (
    <span className={css.wrap}>
      {onBranch ? (
        <Tooltip label={t('publish.aria')} side="top" delayMs={500} disabled={sending}>
          <button
            type="button"
            className={css.button}
            aria-label={t('publish.aria')}
            aria-busy={sending}
            disabled={sending}
            onClick={() => { finish(() => publish()) }}
          >
            <span className={css.label}>{t('publish')}</span>
          </button>
        </Tooltip>
      ) : (
        <>
          <Tooltip label={t('send.aria')} side="top" delayMs={500} disabled={postDisabled}>
            <button
              type="button"
              className={css.button}
              aria-label={t('send.aria')}
              aria-busy={sending}
              disabled={postDisabled}
              onClick={() => { finish(() => post(text, mentions)) }}
            >
              <IconUsersOutlineRegular size={14} />
              <span className={css.label}>{t('send')}</span>
            </button>
          </Tooltip>
          <Tooltip label={t('prompt.aria')} side="top" delayMs={500} disabled={promptDisabled}>
            <button
              type="button"
              className={css.button}
              aria-label={t('prompt.aria')}
              aria-busy={sending}
              disabled={promptDisabled}
              onClick={() => { finish(() => promptWithRoom(text, mentions)) }}
            >
              <IconSendOutlineRegular size={14} />
              <span className={css.label}>{t('prompt')}</span>
            </button>
          </Tooltip>
        </>
      )}
      {error !== null && <span className={css.error} role="status">{error}</span>}
    </span>
  )
}
