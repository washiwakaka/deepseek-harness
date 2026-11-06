import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { AccountChip, type AccountChipInjected } from '../src/client/AccountChip.tsx'
import { mountIdentityUi } from '../src/client/mount.ts'
import { IdentitySessionStore } from '../src/client/session.ts'
import type { IdentityAccountView } from '@deepseek-ai/dsh-experimental-api-identity/types'

const REMOTE: TypertRemoteContribution = { package: '@deepseek-ai/dsh-experimental-api-identity', descriptors: [] }

async function bench() {
  const ctx = new Context()
  const unmount = vi.fn(async () => {})
  class Remote extends Service {
    constructor() { super(ctx, 'remote') }
    async $mount(contribution: TypertRemoteContribution) {
      expect(contribution).toBe(REMOTE)
      return unmount
    }
  }
  new Remote()
  ctx.provide('remote.identity', {
    status: vi.fn(async () => ({
      ok: true as const,
      value: {
        current: null,
        methods: [{ id: 'password', kind: 'password' as const }],
        lines: [],
        accounts: [],
      },
    })),
    listCatalogModels: vi.fn(async () => ({ ok: true as const, value: [] })),
    loginPassword: vi.fn(async () => ({
      ok: true as const,
      value: { id: 'alice', name: 'Alice', admin: true, activeLineId: null, memberships: [] },
    })),
    registerPassword: vi.fn(async () => ({
      ok: true as const,
      value: { id: 'alice', name: 'Alice', admin: true, activeLineId: null, memberships: [] },
    })),
    logout: vi.fn(async () => ({ ok: true as const, value: undefined })),
    listAccounts: vi.fn(),
    createLine: vi.fn(async () => ({ ok: true as const, value: { id: 'core', name: 'Core' } })),
    joinLine: vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'alice',
        name: 'Alice',
        admin: true,
        activeLineId: 'core',
        memberships: [{ lineId: 'core', modelIds: [] }],
      },
    })),
    leaveLine: vi.fn(async () => ({
      ok: true as const,
      value: { id: 'alice', name: 'Alice', admin: true, activeLineId: null, memberships: [] },
    })),
    setLineModels: vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'alice',
        name: 'Alice',
        admin: true,
        activeLineId: 'core',
        memberships: [{ lineId: 'core', modelIds: ['mock/mock'] }],
      },
    })),
    setActiveLine: vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'alice',
        name: 'Alice',
        admin: true,
        activeLineId: 'core',
        memberships: [{ lineId: 'core', modelIds: [] }],
      },
    })),
    setAccountAdmin: vi.fn(async () => ({
      ok: true as const,
      value: { id: 'bob', name: 'Bob', admin: true, activeLineId: null, memberships: [] },
    })),
    setAccountCapabilities: vi.fn(async () => ({
      ok: true as const,
      value: { id: 'bob', name: 'Bob', admin: false, capabilities: ['terminal'], activeLineId: null, memberships: [] },
    })),
  })
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.account': { kind: 'single', scope: 'root' },
    },
  } as never, () => null)
  return { ctx, unmount }
}

describe('identity browser plugin', () => {
  it('declares remote, slots, and locale', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale'])
    nodeApply()
  })

  it('occupies sidebar.account and loads status', async () => {
    const b = await bench()
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    const entry = b.ctx.slots.entries('sidebar.account')[0]
    expect(entry?.component).toBe(AccountChip)
    expect(entry?.locale).toBe('local-identity')
    await vi.waitFor(() => {
      expect(b.ctx.identitySession.getSnapshot()).toEqual({
        current: undefined,
        methods: [{ id: 'password', kind: 'password' }],
        lines: [],
        models: [],
        accounts: [],
      })
    })
    const t = b.ctx.locale.bind('local-identity')
    expect(t('chip.signIn')).toBe('Sign in')
    const injected = entry?.inject?.() as never as AccountChipInjected
    await injected.login('alice', 'password1')
    await injected.register('alice', 'password1', 'Alice')
    await injected.createLine('core', 'Core')
    await injected.joinLine('core')
    await injected.setLineModels('core', ['mock/mock'])
    await injected.setActiveLine('core')
    await injected.setAccountAdmin('bob', true)
    await injected.leaveLine('core')
    await injected.logout()
    expect(b.ctx.identitySession.getSnapshot().current).toBeUndefined()
    const store = new IdentitySessionStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.set(b.ctx.identitySession.getSnapshot())
    expect(listener).toHaveBeenCalled()
    off()
    await dispose()
    expect(b.unmount).toHaveBeenCalled()
  })

  it('refreshes the Session list when the signed-in account changes', async () => {
    const b = await bench()
    const refresh = vi.fn(async () => {})
    b.ctx.provide('sessions', { refresh })
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      loginPassword: ReturnType<typeof vi.fn>
      logout: ReturnType<typeof vi.fn>
      joinLine: ReturnType<typeof vi.fn>
    }
    const alice: IdentityAccountView = {
      id: 'alice',
      name: 'Alice',
      admin: true,
      seedAdmin: false,
      activeLineId: null,
      memberships: [],
    }
    let current: IdentityAccountView | null = null
    remote.status.mockImplementation(async () => ({
      ok: true as const,
      value: {
        current,
        methods: [{ id: 'password', kind: 'password' as const }],
        lines: [],
        accounts: [],
      },
    }))
    remote.loginPassword.mockImplementation(async () => {
      current = alice
      return { ok: true as const, value: alice }
    })
    remote.joinLine.mockImplementation(async () => {
      current = { ...alice, activeLineId: 'core', memberships: [{ lineId: 'core', modelIds: [] }] }
      return { ok: true as const, value: current }
    })
    remote.logout.mockImplementation(async () => {
      current = null
      return { ok: true as const, value: undefined }
    })
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    await vi.waitFor(() => {
      expect(b.ctx.identitySession.getSnapshot().methods).toHaveLength(1)
    })
    const entry = b.ctx.slots.entries('sidebar.account')[0]
    const injected = entry?.inject?.() as never as AccountChipInjected
    expect(refresh).not.toHaveBeenCalled()
    await injected.login('alice', 'password1')
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1)
    })
    await injected.joinLine('core')
    expect(refresh).toHaveBeenCalledTimes(1)
    await injected.logout()
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(2)
    })
    await dispose()
  })

  it('keeps sign-in when Session list refresh fails', async () => {
    const b = await bench()
    const refresh = vi.fn(async () => {
      throw new Error('list')
    })
    b.ctx.provide('sessions', { refresh })
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      loginPassword: ReturnType<typeof vi.fn>
    }
    const alice = { id: 'alice', name: 'Alice', admin: true, seedAdmin: false, activeLineId: null, memberships: [] }
    let current: typeof alice | null = null
    remote.status.mockImplementation(async () => ({
      ok: true as const,
      value: {
        current,
        methods: [{ id: 'password', kind: 'password' as const }],
        lines: [],
        accounts: [],
      },
    }))
    remote.loginPassword.mockImplementation(async () => {
      current = alice
      return { ok: true as const, value: alice }
    })
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    const entry = b.ctx.slots.entries('sidebar.account')[0]
    const injected = entry?.inject?.() as never as AccountChipInjected
    await injected.login('alice', 'password1')
    expect(b.ctx.identitySession.getSnapshot().current?.id).toBe('alice')
    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
    await dispose()
  })

  it('does not throw when the Session layer is absent at sign-in', async () => {
    const b = await bench()
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      loginPassword: ReturnType<typeof vi.fn>
    }
    const alice = { id: 'alice', name: 'Alice', admin: true, seedAdmin: false, activeLineId: null, memberships: [] }
    remote.status
      .mockResolvedValueOnce({
        ok: true as const,
        value: { current: null, methods: [{ id: 'password', kind: 'password' as const }], lines: [], accounts: [] },
      })
      .mockResolvedValueOnce({
        ok: true as const,
        value: { current: alice, methods: [{ id: 'password', kind: 'password' as const }], lines: [], accounts: [] },
      })
    remote.loginPassword.mockResolvedValueOnce({ ok: true as const, value: alice })
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    await vi.waitFor(() => {
      expect(b.ctx.identitySession.getSnapshot().methods).toHaveLength(1)
    })
    const entry = b.ctx.slots.entries('sidebar.account')[0]
    const injected = entry?.inject?.() as never as AccountChipInjected
    await injected.login('alice', 'password1')
    expect(b.ctx.identitySession.getSnapshot().current?.id).toBe('alice')
    await dispose()
  })

  it('exports apply that mounts the generated remote', async () => {
    const ctx = new Context()
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount(contribution: TypertRemoteContribution) {
        expect(contribution.package).toBe('@deepseek-ai/dsh-experimental-api-identity')
        return async () => {}
      }
    }
    new Remote()
    ctx.provide('remote.identity', {
      status: vi.fn(async () => ({ ok: false as const, error: new Error('skip') })),
      listCatalogModels: vi.fn(async () => ({ ok: false as const, error: new Error('skip') })),
    })
    ctx.provide('locale', new LocaleRuntime(ctx))
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'sidebar.account': { kind: 'single', scope: 'root' } },
    } as never, () => null)
    const dispose = await apply(ctx)
    await dispose()
  })

  it('throws Host errors and falls back when status fails after login', async () => {
    const b = await bench()
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      loginPassword: ReturnType<typeof vi.fn>
      registerPassword: ReturnType<typeof vi.fn>
      logout: ReturnType<typeof vi.fn>
      createLine: ReturnType<typeof vi.fn>
      joinLine: ReturnType<typeof vi.fn>
      leaveLine: ReturnType<typeof vi.fn>
      setLineModels: ReturnType<typeof vi.fn>
      setActiveLine: ReturnType<typeof vi.fn>
      setAccountAdmin: ReturnType<typeof vi.fn>
      setAccountCapabilities: ReturnType<typeof vi.fn>
      listCatalogModels: ReturnType<typeof vi.fn>
    }
    let statusCalls = 0
    remote.status.mockImplementation(async () => {
      statusCalls += 1
      if (statusCalls === 1) {
        return {
          ok: true as const,
          value: {
            current: null,
            methods: [{ id: 'password', kind: 'password' as const }],
            lines: [],
            accounts: [],
          },
        }
      }
      return { ok: false as const, error: new Error('status') }
    })
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    await vi.waitFor(() => {
      expect(b.ctx.identitySession.getSnapshot().methods).toHaveLength(1)
    })
    const entry = b.ctx.slots.entries('sidebar.account')[0]
    const injected = entry?.inject?.() as never as AccountChipInjected
    await injected.login('alice', 'password1')
    expect(b.ctx.identitySession.getSnapshot().current?.id).toBe('alice')
    remote.createLine.mockResolvedValueOnce({ ok: false as const, error: new Error('line') })
    await expect(injected.createLine('core', 'Core')).rejects.toThrow('line')
    remote.joinLine.mockResolvedValueOnce({ ok: false as const, error: new Error('join') })
    await expect(injected.joinLine('core')).rejects.toThrow('join')
    remote.leaveLine.mockResolvedValueOnce({ ok: false as const, error: new Error('leave') })
    await expect(injected.leaveLine('core')).rejects.toThrow('leave')
    remote.setLineModels.mockResolvedValueOnce({ ok: false as const, error: new Error('models') })
    await expect(injected.setLineModels('core', [])).rejects.toThrow('models')
    remote.setActiveLine.mockResolvedValueOnce({ ok: false as const, error: new Error('active') })
    await expect(injected.setActiveLine('core')).rejects.toThrow('active')
    remote.setAccountAdmin.mockResolvedValueOnce({ ok: false as const, error: new Error('admin') })
    await expect(injected.setAccountAdmin('bob', true)).rejects.toThrow('admin')
    await injected.setAccountCapabilities?.('bob', ['terminal'])
    remote.setAccountCapabilities.mockResolvedValueOnce({ ok: false as const, error: new Error('caps') })
    await expect(injected.setAccountCapabilities?.('bob', ['terminal'])).rejects.toThrow('caps')
    remote.registerPassword.mockResolvedValueOnce({ ok: false as const, error: new Error('reg') })
    await expect(injected.register('alice', 'password1', 'Alice')).rejects.toThrow('reg')
    remote.registerPassword.mockResolvedValueOnce({
      ok: true as const,
      value: { id: 'alice', name: 'Alice', admin: true, activeLineId: null, memberships: [] },
    })
    remote.loginPassword.mockResolvedValueOnce({ ok: false as const, error: new Error('after-reg') })
    await expect(injected.register('alice', 'password1', 'Alice')).rejects.toThrow('after-reg')
    remote.logout.mockResolvedValueOnce({ ok: false as const, error: new Error('out') })
    await expect(injected.logout()).rejects.toThrow('out')
    remote.loginPassword.mockResolvedValueOnce({ ok: false as const, error: new Error('auth') })
    await expect(injected.login('alice', 'password1')).rejects.toThrow('auth')
    await dispose()
  })

  it('ignores a late status failure after dispose', async () => {
    const b = await bench()
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      listCatalogModels: ReturnType<typeof vi.fn>
    }
    remote.status.mockImplementation(() => new Promise((_, reject) => {
      setTimeout(() => { reject(new Error('late')) }, 20)
    }))
    remote.listCatalogModels.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => { resolve({ ok: true as const, value: [] }) }, 20)
    }))
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    await dispose()
    await new Promise((resolve) => { setTimeout(resolve, 40) })
  })

  it('ignores a late status success after dispose', async () => {
    const b = await bench()
    const remote = b.ctx.get('remote.identity') as {
      status: ReturnType<typeof vi.fn>
      listCatalogModels: ReturnType<typeof vi.fn>
    }
    const status = Promise.withResolvers<{
      ok: true
      value: { current: null; methods: never[]; lines: never[]; accounts: never[] }
    }>()
    const catalog = Promise.withResolvers<{ ok: true; value: never[] }>()
    remote.status.mockReturnValue(status.promise)
    remote.listCatalogModels.mockReturnValue(catalog.promise)
    const dispose = await mountIdentityUi(b.ctx, REMOTE)
    await dispose()
    status.resolve({
      ok: true as const,
      value: { current: null, methods: [], lines: [], accounts: [] },
    })
    catalog.resolve({ ok: true as const, value: [] })
    await status.promise
    await catalog.promise
    await new Promise(resolve => setTimeout(resolve, 10))
  })

  it('unmounts the Remote when slot inject fails', async () => {
    const ctx = new Context()
    const unmount = vi.fn(async () => {})
    class Remote extends Service {
      constructor() { super(ctx, 'remote') }
      async $mount() {
        return unmount
      }
    }
    new Remote()
    ctx.provide('remote.identity', {
      status: vi.fn(async () => ({
        ok: true as const,
        value: { current: null, methods: [], lines: [], accounts: [] },
      })),
      listCatalogModels: vi.fn(async () => ({ ok: true as const, value: [] })),
    })
    ctx.provide('locale', {
      register() {
        throw new Error('locale')
      },
    })
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'sidebar.account': { kind: 'single', scope: 'root' } },
    } as never, () => null)
    await expect(mountIdentityUi(ctx, REMOTE)).rejects.toThrow('locale')
    expect(unmount).toHaveBeenCalled()
  })
})
