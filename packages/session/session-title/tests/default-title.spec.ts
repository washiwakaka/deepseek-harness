// SessionTitleService.initialize/replaceDefault: system-supplied `default`
// titles written at Session creation. A default is a placeholder — it never
// overrides a standing title, first-prompt generation still replaces it, and
// replaceDefault upgrades it only while it is still the standing title.
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionTitleService, {
  SessionTitleProviderId,
  foldSessionTitle,
  type SessionTitleProviderRequest,
} from '@deepseek-ai/dsh-session-title'

const CONFIG = {
  fallbackMaxWords: 5,
  fallbackMaxBytes: 40,
  maxTitleBytes: 40,
} as const

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function mountTitle(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SessionTitleService, CONFIG)
  return ctx
}

function appendHumanPrompt(session: ReturnType<Context['sessions']['create']>, text: string) {
  return session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
}

function titleEventCount(session: ReturnType<Context['sessions']['create']>): number {
  return session.snapshotEvents().filter(event => event.type === 'session/title').length
}

describe('SessionTitleService default titles', () => {
  it('writes a default-source title with no source messages on initialize', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-initialize'))

    const accepted = ctx.sessionTitle.initialize(session, '  Alice   session  ')
    expect(accepted).toMatchObject({
      title: 'Alice session',
      messageSeqs: [],
      source: { kind: 'default' },
    })
    expect(ctx.sessionTitle.get(session)?.source).toEqual({ kind: 'default' })
    // foldSessionTitle round-trips the fourth source kind.
    expect(foldSessionTitle(session.snapshotEvents())?.title).toBe('Alice session')
  })

  it('initialize never overrides a standing title of any source', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-no-override'))
    ctx.sessionTitle.rename(session, 'Hand named')
    const standing = ctx.sessionTitle.initialize(session, 'System name')
    expect(standing?.title).toBe('Hand named')
    expect(titleEventCount(session)).toBe(1)
  })

  it('initialize rejects empty titles and dead sessions', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-reject'))
    expect(() => ctx.sessionTitle.initialize(session, '  \t  ')).toThrow(/visible characters/)
    expect(() => ctx.sessionTitle.initialize(Session.create(SessionId('detached')), 'name'))
      .toThrow(/not live in this store/)
    expect(titleEventCount(session)).toBe(0)
  })

  it('replaceDefault upgrades a standing default and no-ops on identical text', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-upgrade'))
    ctx.sessionTitle.initialize(session, 'Alice session')

    const upgraded = ctx.sessionTitle.replaceDefault(session, 'Alice room')
    expect(upgraded).toMatchObject({ title: 'Alice room', source: { kind: 'default' } })
    expect(titleEventCount(session)).toBe(2)

    const again = ctx.sessionTitle.replaceDefault(session, 'Alice room')
    expect(again?.title).toBe('Alice room')
    expect(titleEventCount(session)).toBe(2)
  })

  it('replaceDefault leaves fallback, provider, and user titles untouched', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-untouched'))
    // No standing title: nothing is written.
    expect(ctx.sessionTitle.replaceDefault(session, 'Alice room')).toBeUndefined()
    expect(titleEventCount(session)).toBe(0)

    ctx.sessionTitle.rename(session, 'Pinned by hand')
    const kept = ctx.sessionTitle.replaceDefault(session, 'Alice room')
    expect(kept).toMatchObject({ title: 'Pinned by hand', source: { kind: 'user' } })
    expect(titleEventCount(session)).toBe(1)
  })

  it('replaceDefault rejects an empty replacement while a default stands', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-replace-reject'))
    ctx.sessionTitle.initialize(session, 'Alice session')
    expect(() => ctx.sessionTitle.replaceDefault(session, ' \t ')).toThrow(/visible characters/)
    expect(ctx.sessionTitle.get(session)?.title).toBe('Alice session')
    expect(titleEventCount(session)).toBe(1)
  })

  it('first-prompt generation still replaces a default title', async () => {
    const ctx = await mountTitle()
    const generate = vi.fn(async (request: SessionTitleProviderRequest) => ({
      title: 'Generated from prompt',
      messageSeqs: request.messages.map(message => message.seq),
    }))
    ctx.sessionTitle.register({
      id: SessionTitleProviderId('first-prompt-provider'),
      automatic: 'first-prompt',
      generate,
    })
    const session = ctx.sessions.create(SessionId('default-first-prompt'))
    ctx.sessionTitle.initialize(session, 'Alice session')

    appendHumanPrompt(session, 'First real prompt')
    session.append('request/header', {
      header: { config: { provider: 'main-route', model: 'chat-model' } },
      reason: 'change',
    })
    await settle()
    await settle()

    expect(generate).toHaveBeenCalledOnce()
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'Generated from prompt',
      source: { kind: 'provider' },
    })
  })

  it('the deterministic fallback does not overwrite a default title', async () => {
    const ctx = await mountTitle()
    const session = ctx.sessions.create(SessionId('default-no-fallback'))
    ctx.sessionTitle.initialize(session, 'Alice session')

    appendHumanPrompt(session, 'First real prompt')
    await settle()

    expect(ctx.sessionTitle.get(session)).toMatchObject({
      title: 'Alice session',
      source: { kind: 'default' },
    })
    expect(titleEventCount(session)).toBe(1)
  })
})
