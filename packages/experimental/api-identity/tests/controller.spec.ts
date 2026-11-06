import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import IdentityService from '@deepseek-ai/dsh-experimental-identity'
import type { Config } from '@deepseek-ai/dsh-experimental-identity'
import { remoteErrorOf, type PeerId, type PeerScope, type RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import IdentityController from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

async function setup(config: Config = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  new MemoryCredentials(ctx)
  const pluginConfig: { lines?: { id: string; name: string }[]; admins?: string[] } = {}
  if (config.lines !== undefined) pluginConfig.lines = config.lines.map(line => ({ id: line.id, name: line.name }))
  if (config.admins !== undefined) pluginConfig.admins = [...config.admins]
  await ctx.plugin(IdentityService, pluginConfig)
  const api = new IdentityController(ctx)
  return { api, ctx }
}

function caller(ctx: Context, id: string): Context {
  const peer = {
    id: id as PeerId,
    ctx,
    principal: { kind: 'owner' as const },
    interactions: 'answer' as const,
    signal: new AbortController().signal,
    dispose: () => Promise.resolve(),
  } satisfies PeerScope
  const invocation: RemoteInvocation = {
    request: { namespace: 'identity', method: 'loginPassword', args: {} },
    service: 'identityController',
    peer,
    signal: peer.signal,
    uplink: () => ({ async *[Symbol.asyncIterator]() {} }),
  }
  return ctx.extend({ invocation })
}

describe('identity Remote', () => {
  it('registers, signs in, and lists methods', async () => {
    const { api } = await setup({ admins: ['alice'] })
    const abort = new AbortController()
    expect(api.status()).toEqual({
      current: null,
      methods: [{ id: 'password', kind: 'password' }],
      lines: [],
      accounts: [],
    })
    expect(await api.registerPassword('alice', 'password1', 'Alice', abort.signal)).toEqual({
      id: 'alice',
      name: 'Alice',
      admin: true,
      seedAdmin: true,
      activeLineId: null,
      memberships: [],
    })
    try {
      api.listAccounts()
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
    expect(await api.loginPassword('alice', 'password1', abort.signal)).toEqual({
      id: 'alice',
      name: 'Alice',
      admin: true,
      seedAdmin: true,
      activeLineId: null,
      memberships: [],
    })
    expect(api.listAccounts()).toEqual([{
      id: 'alice',
      name: 'Alice',
      admin: true,
      seedAdmin: true,
      activeLineId: null,
      memberships: [],
    }])
    expect(api.status().current).toEqual({
      id: 'alice',
      name: 'Alice',
      admin: true,
      seedAdmin: true,
      activeLineId: null,
      memberships: [],
    })
    expect(api.status().accounts).toEqual(api.listAccounts())
    expect(await api.registerPassword('bob', 'password1', 'Bob', abort.signal)).toMatchObject({
      id: 'bob',
      admin: false,
    })
    expect(await api.setAccountAdmin('bob', true, abort.signal)).toMatchObject({
      id: 'bob',
      admin: true,
    })
    expect(await api.setAccountCapabilities('bob', ['workspace', 'cordis'], abort.signal)).toMatchObject({
      id: 'bob',
      capabilities: ['workspace', 'cordis'],
    })
    expect(await api.setAccountAdmin('bob', false, abort.signal)).toMatchObject({
      admin: false,
    })
    try {
      await api.setAccountAdmin('alice', false, abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/invalid-argument' })
    }
    api.logout()
    expect(await api.loginPassword('bob', 'password1', abort.signal)).toMatchObject({ admin: false })
    try {
      await api.setAccountCapabilities('alice', ['mcp'], abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
    try {
      api.listAccounts()
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
    expect(api.status().accounts).toEqual([])
    api.logout()
    expect(api.status().current).toBeNull()
  })

  it('creates independent lines and writes the active-line model allowlist', async () => {
    const { api } = await setup({ admins: ['alice'] })
    const abort = new AbortController()
    await api.registerPassword('alice', 'password1', 'Alice', abort.signal)
    await api.loginPassword('alice', 'password1', abort.signal)
    await api.createLine('core', 'Core', abort.signal)
    await api.createLine('guest', 'Guest', abort.signal)
    expect(api.status().lines.map(line => line.id)).toEqual(['core', 'guest'])
    await api.setLineModels('core', ['deepseek-official/deepseek-chat'], abort.signal)
    const account = await api.setActiveLine('guest', abort.signal)
    expect(account.activeLineId).toBe('guest')
    expect(account.memberships).toEqual([
      { lineId: 'core', modelIds: ['deepseek-official/deepseek-chat'] },
      { lineId: 'guest', modelIds: [] },
    ])
    const guest = await api.leaveLine('guest', abort.signal)
    expect(guest.memberships.map(row => row.lineId)).toEqual(['core'])
    const joined = await api.joinLine('guest', abort.signal)
    expect(joined.memberships.map(row => row.lineId)).toEqual(['core', 'guest'])
    expect(await api.listCatalogModels(abort.signal)).toEqual([])
    expect((await api.setActiveLine(null, abort.signal)).activeLineId).toBeNull()
    try {
      await api.createLine('core', 'Core', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/conflict' })
    }
    try {
      await api.joinLine('missing', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/invalid-argument' })
    }
    try {
      await api.createLine('Bad', 'X', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/invalid-argument' })
    }
    await api.registerPassword('bob', 'password1', 'Bob', abort.signal)
    api.logout()
    expect(await api.loginPassword('bob', 'password1', abort.signal)).toMatchObject({ admin: false, seedAdmin: false })
    try {
      await api.createLine('lab', 'Lab', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
    api.logout()
    try {
      await api.createLine('lab', 'Lab', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
  })

  it('maps duplicate register and wrong password onto conflict and unauthorized', async () => {
    const { api, ctx } = await setup()
    const abort = new AbortController()
    await api.registerPassword('alice', 'password1', 'Alice', abort.signal)
    try {
      await api.registerPassword('alice', 'password1', 'Alice', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/conflict' })
    }
    try {
      await api.loginPassword('alice', 'wrong-password', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unauthorized' })
    }
    const methods = Reflect.get(ctx.identity, 'methods') as Map<string, unknown>
    methods.clear()
    try {
      await api.loginPassword('alice', 'password1', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/unknown-method' })
    }
  })

  it('keeps two Remote callers signed in independently', async () => {
    const { ctx } = await setup()
    const abort = new AbortController()
    const alice = caller(ctx, 'peer-alice')
    const bob = caller(ctx, 'peer-bob')
    await alice.identityController.registerPassword('alice', 'password1', 'Alice', abort.signal)
    await bob.identityController.registerPassword('bob', 'password1', 'Bob', abort.signal)
    expect(await alice.identityController.loginPassword('alice', 'password1', abort.signal)).toMatchObject({
      id: 'alice',
    })
    expect(await bob.identityController.loginPassword('bob', 'password1', abort.signal)).toMatchObject({
      id: 'bob',
    })
    expect(alice.identityController.status().current?.id).toBe('alice')
    expect(bob.identityController.status().current?.id).toBe('bob')
    alice.identityController.logout()
    expect(alice.identityController.status().current).toBeNull()
    expect(bob.identityController.status().current?.id).toBe('bob')
  })

  it('maps missing credentials and unexpected throws onto failed', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(IdentityService, {})
    const api = new IdentityController(ctx)
    const abort = new AbortController()
    try {
      await api.registerPassword('alice', 'password1', 'Alice', abort.signal)
      expect.unreachable()
    } catch (error: unknown) {
      expect(remoteErrorOf(error)).toMatchObject({ code: 'identity/failed' })
    }
    const wired = await setup()
    vi.spyOn(wired.ctx.identity, 'registerPassword').mockRejectedValueOnce(new Error('boom'))
    await expect(wired.api.registerPassword('alice', 'password1', 'Alice', abort.signal)).rejects.toThrow('boom')
  })
})
