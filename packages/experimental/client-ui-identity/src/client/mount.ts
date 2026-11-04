/** Source-safe local-identity browser registration. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-experimental-api-identity/remote'
import type { IdentityAccountView } from '@deepseek-ai/dsh-experimental-api-identity/types'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { AccountChip, type AccountChipInjected } from './AccountChip.tsx'
import { en, ja, es, fr, de, ru, pt, NS, zh, type IdentityUiKey } from './locales.ts'
import { IdentitySessionStore } from './session.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Client snapshot of the Host signed-in local account. */
    identitySession: IdentitySessionStore
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar account chip and sign-in dialog copy. */
    'local-identity': IdentityUiKey
  }
}

/** Required browser services for slots, Remote identity, and localized copy. */
export const inject = ['remote', 'slots', 'locale']

/**
 * Replace the Client snapshot from Host status and the Settings catalog.
 * @param ctx - Client Context with identity Remote.
 * @param session - published snapshot store.
 * @param fallback - account to keep when status fails after a mutation.
 */
async function pullStatus(
  ctx: ClientContext,
  session: IdentitySessionStore,
  fallback?: IdentityAccountView,
): Promise<void> {
  const status = await ctx.remote.identity.status()
  const catalog = await ctx.remote.identity.listCatalogModels()
  const models = catalog.ok ? catalog.value : session.getSnapshot().models
  if (status.ok) {
    session.set({
      current: status.value.current === null ? undefined : status.value.current,
      methods: status.value.methods,
      lines: status.value.lines,
      models,
      accounts: status.value.accounts,
    })
    return
  }
  if (fallback !== undefined) {
    session.set({
      ...session.getSnapshot(),
      current: fallback,
      models,
    })
  }
}

function registerIdentityUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-identity: dictionaries')
  const session = new IdentitySessionStore()
  ctx.provide('identitySession', session)
  ctx.effect(() => {
    let cancelled = false
    void pullStatus(ctx, session).then(() => {
      if (cancelled) return
    }, () => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
  }, 'client-ui-identity: status')
  ctx.slots.inject(
    'sidebar.account',
    () => ctx.slots.register({
      name: 'sidebar.account',
      locale: NS,
      inject: (): AccountChipInjected => ({
        login: async (username, password) => {
          const result = await ctx.remote.identity.loginPassword(username, password)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        register: async (username, password, name) => {
          const created = await ctx.remote.identity.registerPassword(username, password, name)
          if (!created.ok) throw created.error
          const result = await ctx.remote.identity.loginPassword(username, password)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        logout: async () => {
          const result = await ctx.remote.identity.logout()
          if (!result.ok) throw result.error
          session.set({
            ...session.getSnapshot(),
            current: undefined,
          })
        },
        createLine: async (id, name) => {
          const result = await ctx.remote.identity.createLine(id, name)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session)
        },
        joinLine: async (lineId) => {
          const result = await ctx.remote.identity.joinLine(lineId)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        leaveLine: async (lineId) => {
          const result = await ctx.remote.identity.leaveLine(lineId)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        setLineModels: async (lineId, modelIds) => {
          const result = await ctx.remote.identity.setLineModels(lineId, modelIds)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        setActiveLine: async (lineId) => {
          const result = await ctx.remote.identity.setActiveLine(lineId)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session, result.value)
        },
        setAccountAdmin: async (username, admin) => {
          const result = await ctx.remote.identity.setAccountAdmin(username, admin)
          if (!result.ok) throw result.error
          await pullStatus(ctx, session)
        },
        hooks: { identity: session },
      }),
    }, AccountChip),
  )
}

/**
 * Mount the identity Remote and register the sidebar account chip.
 * @param ctx - Client Context with the declared `inject` services available.
 * @param contribution - generated `identity` Remote contribution.
 * @returns disposer that withdraws the UI then the Remote mount.
 */
export async function mountIdentityUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.identity', 'slots', 'locale'], registerIdentityUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
