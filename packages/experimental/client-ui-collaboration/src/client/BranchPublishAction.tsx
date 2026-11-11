import { useEffect, useRef, useState } from 'react'
import { IconSendOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ActorRosterSnapshot } from './actor-roster.ts'
import { isNestedBranch, isOwnedBranch } from './visibility.ts'
import { NS } from './locales.ts'
import css from './BranchPublishAction.module.css'

/** Injected per-reply publish control for one assistant message on a mention branch. */
export interface BranchPublishInjected {
  sessionId: string
  publishReply: (messageId: string) => Promise<void>
  branchInfo: (sessionId: string, messageId: string) => Promise<{ branch: boolean; ownReply: boolean }>
  hooks: {
    actors: HostObservable<ActorRosterSnapshot>
    sessions: HostObservable<SessionListState>
  }
}

/** Full props of the per-reply publish action before the assistant-actions strip. */
export type BranchPublishActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<BranchPublishInjected>
  & PropsLocale<typeof NS>

/**
 * Publish this one assistant reply onto the room, from the branch that produced it.
 * Renders nothing outside a mention branch the selected human owns, and nothing
 * under replies inherited from the room or an ancestor branch.
 * @param props - owner message identity, injected publish verbs, roster and Session hooks, locale binder.
 * @returns the publish button with its failure notice, or nothing off a branch.
 */
export function BranchPublishAction({
  messageId, sessionId, publishReply, branchInfo, useActors, useSessions, t,
}: BranchPublishActionProps) {
  const selectedHumanId = useActors(snapshot => snapshot.selectedHumanId)
  const remembered = useActors(snapshot => snapshot.branchIds?.includes(sessionId) === true)
  const listed = useSessions(list => isOwnedBranch(selectedHumanId, list, sessionId))
  const nested = useSessions(list => isNestedBranch(list, sessionId))
  const [queried, setQueried] = useState<{ branch: boolean; ownReply: boolean } | null>(null)
  useEffect(() => {
    setQueried(null)
    let cancelled = false
    void branchInfo(sessionId, String(messageId)).then((info) => {
      if (!cancelled) setQueried(info)
    }, () => {})
    return () => { cancelled = true }
  }, [branchInfo, messageId, sessionId])
  const [state, setState] = useState<'idle' | 'publishing' | 'published' | 'failed'>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  if (selectedHumanId === undefined || queried?.ownReply !== true) return null
  if (!(remembered || listed || queried.branch)) return null
  const label = state === 'published'
    ? t(nested ? 'publish.replyBranchDone' : 'publish.replyDone')
    : t(nested ? 'publish.replyBranch' : 'publish.reply')
  const publish = (): void => {
    setState('publishing')
    setFailure(null)
    void publishReply(String(messageId)).then(() => {
      if (alive.current) setState('published')
    }, (reason: unknown) => {
      if (!alive.current) return
      const remote = remoteErrorOf(reason)
      if (remote?.code === 'collaboration/already-published') {
        setState('published')
        return
      }
      setState('failed')
      setFailure(remote?.message ?? t('publish.failed'))
    })
  }
  return (
    <>
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          className={css.action}
          aria-label={label}
          aria-busy={state === 'publishing'}
          disabled={state === 'publishing' || state === 'published'}
          onClick={publish}
        >
          <IconSendOutlineRegular />
        </button>
      </Tooltip>
      {failure !== null && <span className={css.failure} role="status">{failure}</span>}
    </>
  )
}
