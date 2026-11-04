import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { TypertRemoteService, type PeerId, type PeerScope, type RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import IdentityService, {
  AccountId,
  IDENTITY_CLOSED_PROVIDER,
  IdentityError,
  LOCAL_USERS_KEY,
  occupancyOf,
} from '../src/index.ts'
import type { Config } from '../src/types.ts'

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
  return ctx
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
    service: 'identity',
    peer,
    signal: peer.signal,
    uplink: () => ({ async *[Symbol.asyncIterator]() {} }),
  }
  return ctx.extend({ invocation })
}

describe('local identity accounts', () => {
  it('registers, signs in, and lists the password method', async () => {
    const ctx = await setup()
    expect(ctx.identity.listMethods()).toEqual([{ id: 'password', kind: 'password' }])
    const created = await ctx.identity.registerPassword('alice', 'password1', ' Alice ')
    expect(created).toEqual({
      id: AccountId('alice'),
      name: 'Alice',
      admin: false,
      seedAdmin: false,
      memberships: [],
    })
    expect(ctx.identity.currentAccount()).toBeUndefined()
    await expect(ctx.identity.setAccountAdmin('alice', true)).rejects.toMatchObject({
      code: 'IDENTITY_UNAUTHORIZED',
    })
    expect(ctx.identity.listAccounts()).toEqual([created])
    await expect(ctx.identity.loginPassword('alice', 'wrong-password')).rejects.toMatchObject({
      code: 'IDENTITY_BAD_CREDENTIALS',
    })
    await ctx.identity.loginPassword('alice', 'password1')
    expect(ctx.identity.currentAccount()).toEqual(created)
  })

  it('refuses a duplicate username and invalid names', async () => {
    const ctx = await setup()
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    await expect(ctx.identity.registerPassword('bob', 'password1', 'Bobby'))
      .rejects.toMatchObject({ code: 'IDENTITY_ACCOUNT_EXISTS' })
    await expect(ctx.identity.registerPassword('Bob', 'password1', 'Bob'))
      .rejects.toMatchObject({ code: 'IDENTITY_INVALID_ARGUMENT' })
    await expect(ctx.identity.registerPassword('abe', 'password1', '   '))
      .rejects.toMatchObject({ code: 'IDENTITY_INVALID_ARGUMENT' })
    await expect(ctx.identity.registerPassword('ab', 'short', 'Abe'))
      .rejects.toMatchObject({ code: 'IDENTITY_INVALID_ARGUMENT' })
    await expect(ctx.identity.loginPassword('carol', 'password1')).rejects.toMatchObject({
      code: 'IDENTITY_BAD_CREDENTIALS',
    })
    const raced = await Promise.allSettled([
      ctx.identity.registerPassword('zack', 'password1', 'Zack'),
      ctx.identity.registerPassword('zack', 'password1', 'Zack'),
    ])
    expect(raced.filter(row => row.status === 'fulfilled')).toHaveLength(1)
  })

  it('makes Config-listed users admin on register and lets an admin promote later users', async () => {
    const ctx = await setup({ admins: ['carol'] })
    const first = await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    const second = await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    const named = await ctx.identity.registerPassword('carol', 'password1', 'Carol')
    expect(first.admin).toBe(false)
    expect(second.admin).toBe(false)
    expect(named.admin).toBe(true)
    await ctx.identity.loginPassword('alice', 'password1')
    await expect(ctx.identity.setAccountAdmin('bob', true)).rejects.toMatchObject({
      code: 'IDENTITY_UNAUTHORIZED',
    })
    await ctx.identity.loginPassword('carol', 'password1')
    await expect(ctx.identity.setAccountAdmin('carol', false)).rejects.toMatchObject({
      code: 'IDENTITY_INVALID_ARGUMENT',
    })
    await expect(ctx.identity.setAccountAdmin('missing', true)).rejects.toMatchObject({
      code: 'IDENTITY_INVALID_ARGUMENT',
    })
    const promoted = await ctx.identity.setAccountAdmin('bob', true)
    expect(promoted.admin).toBe(true)
    await expect(ctx.identity.setAccountAdmin('carol', false)).rejects.toMatchObject({
      code: 'IDENTITY_INVALID_ARGUMENT',
    })
    const demoted = await ctx.identity.setAccountAdmin('bob', false)
    expect(demoted.admin).toBe(false)
    await ctx.identity.loginPassword('bob', 'password1')
    expect(ctx.identity.currentAccount()?.admin).toBe(false)
    await expect(ctx.identity.setAccountAdmin('alice', true)).rejects.toMatchObject({
      code: 'IDENTITY_UNAUTHORIZED',
    })
  })

  it('keeps a Config admin after the stored role is dropped', async () => {
    const ctx = await setup({ admins: ['alice'] })
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    await ctx.credentials.modifyRecord(LOCAL_USERS_KEY, async (current) => {
      if (current === undefined || current.kind !== 'grant') return current
      if (typeof current.payload !== 'object' || current.payload === null || !('users' in current.payload)) {
        return current
      }
      const users = current.payload.users
      if (!Array.isArray(users)) return current
      return {
        kind: 'grant',
        payload: {
          users: users.map((user) => {
            if (typeof user !== 'object' || user === null) return user
            const { role: _role, ...rest } = user as { role?: unknown }
            void _role
            return rest
          }),
          lines: 'lines' in current.payload ? current.payload.lines : [],
        },
      }
    })
    await ctx.identity.loginPassword('alice', 'password1')
    expect(ctx.identity.currentAccount()?.admin).toBe(true)
    await ctx.identity.loginPassword('bob', 'password1')
    expect(ctx.identity.currentAccount()?.admin).toBe(false)
  })

  it('clears the signed-in account on logout', async () => {
    const ctx = await setup()
    await ctx.identity.registerPassword('eve', 'password1', 'Eve')
    await ctx.identity.loginPassword('eve', 'password1')
    ctx.identity.logout()
    expect(ctx.identity.currentAccount()).toBeUndefined()
    expect(ctx.identity.listAccounts()).toHaveLength(1)
  })

  it('keeps two Remote callers signed in independently', async () => {
    class Anchor extends TypertRemoteService {
      constructor(owner: Context) {
        super(owner, 'identityInvocationAnchor')
      }
    }
    const ctx = new Context()
    contexts.push(ctx)
    new MemoryCredentials(ctx)
    await ctx.plugin(Anchor)
    await ctx.plugin(IdentityService, {})
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    const alice = caller(ctx, 'peer-alice')
    const bob = caller(ctx, 'peer-bob')
    await alice.identity.loginPassword('alice', 'password1')
    await bob.identity.loginPassword('bob', 'password1')
    expect(alice.identity.currentAccount()?.id).toBe(AccountId('alice'))
    expect(bob.identity.currentAccount()?.id).toBe(AccountId('bob'))
    expect(ctx.identity.accountForBrowserSession('peer-alice')?.id).toBe(AccountId('alice'))
    expect(ctx.identity.accountForBrowserSession('peer-bob')?.id).toBe(AccountId('bob'))
    expect(ctx.identity.currentAccount()).toBeUndefined()
    alice.identity.logout()
    expect(alice.identity.currentAccount()).toBeUndefined()
    expect(ctx.identity.accountForBrowserSession('peer-alice')).toBeUndefined()
    expect(bob.identity.currentAccount()?.id).toBe(AccountId('bob'))
  })

  it('keeps two Remote callers signed in independently without a prior Remote Service', async () => {
    const ctx = await setup()
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    const alice = caller(ctx, 'peer-alice')
    const bob = caller(ctx, 'peer-bob')
    await alice.identity.loginPassword('alice', 'password1')
    await bob.identity.loginPassword('bob', 'password1')
    expect(alice.identity.currentAccount()?.id).toBe(AccountId('alice'))
    expect(bob.identity.currentAccount()?.id).toBe(AccountId('bob'))
    expect(ctx.identity.currentAccount()).toBeUndefined()
    alice.identity.logout()
    expect(alice.identity.currentAccount()).toBeUndefined()
    expect(bob.identity.currentAccount()?.id).toBe(AccountId('bob'))
  })

  it('keeps business-line memberships independent and drives occupancy from the active line', async () => {
    const ctx = await setup({
      admins: ['alice'],
      lines: [
        { id: 'core', name: 'Core' },
        { id: 'guest', name: 'Guest' },
      ],
    })
    expect(ctx.identity.listLines()).toEqual([
      { id: 'core', name: 'Core' },
      { id: 'guest', name: 'Guest' },
    ])
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.loginPassword('alice', 'password1')
    const unsigned = ctx.identity.currentAccount()
    expect(unsigned).toBeDefined()
    if (unsigned === undefined) return
    expect(occupancyOf(unsigned)).toEqual({
      group: '',
      providers: [IDENTITY_CLOSED_PROVIDER],
      models: [IDENTITY_CLOSED_PROVIDER],
    })
    await ctx.identity.joinLine('core')
    expect(ctx.identity.currentAccount()).toMatchObject({
      activeLineId: 'core',
      memberships: [{ lineId: 'core', modelIds: [] }],
    })
    await ctx.identity.joinLine('guest')
    await ctx.identity.setLineModels('core', ['deepseek-official/deepseek-chat'])
    await ctx.identity.setLineModels('guest', ['qwen-token-plan/qwen-plus'])
    const onCore = ctx.identity.currentAccount()
    expect(onCore).toBeDefined()
    if (onCore === undefined) return
    expect(occupancyOf(onCore)).toEqual({
      group: 'core',
      providers: ['deepseek-official'],
      models: ['deepseek-official/deepseek-chat'],
    })
    await ctx.identity.setActiveLine('guest')
    const onGuest = ctx.identity.currentAccount()
    expect(onGuest).toBeDefined()
    if (onGuest === undefined) return
    expect(occupancyOf(onGuest)).toEqual({
      group: 'guest',
      providers: ['qwen-token-plan'],
      models: ['qwen-token-plan/qwen-plus'],
    })
    await ctx.identity.registerPassword('bob', 'password1', 'Bob')
    await ctx.identity.leaveLine('core')
    await ctx.identity.createLine('ops', 'Ops')
    expect(ctx.identity.listLines().map(line => line.id)).toEqual(['core', 'guest', 'ops'])
    await expect(ctx.identity.createLine('Bad', 'X')).rejects.toMatchObject({ code: 'IDENTITY_INVALID_ARGUMENT' })
    await expect(ctx.identity.createLine('ops', 'Ops')).rejects.toMatchObject({ code: 'IDENTITY_LINE_EXISTS' })
    expect(ctx.identity.currentAccount()?.memberships.some(row => row.lineId === 'ops')).toBe(true)
    await ctx.identity.leaveLine('guest')
    expect(ctx.identity.currentAccount()?.memberships.map(row => row.lineId)).toEqual(['ops'])
    await ctx.identity.setActiveLine(undefined)
    const cleared = ctx.identity.currentAccount()
    expect(cleared).toBeDefined()
    if (cleared === undefined) return
    expect(cleared.activeLineId).toBeUndefined()
    expect(await ctx.identity.listCatalogModels()).toEqual([])
    ctx.identity.logout()
    await ctx.identity.loginPassword('bob', 'password1')
    await expect(ctx.identity.createLine('lab', 'Lab')).rejects.toMatchObject({ code: 'IDENTITY_UNAUTHORIZED' })
    ctx.identity.logout()
    await expect(ctx.identity.createLine('lab', 'Lab')).rejects.toMatchObject({ code: 'IDENTITY_UNAUTHORIZED' })
  })


  it('fails loud when credentials are missing', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const service = new IdentityService(ctx, {})
    await expect(service.registerPassword('alice', 'password1', 'Alice')).rejects.toBeInstanceOf(IdentityError)
  })

  it('refuses invalid Config lines and duplicate method ids', () => {
    const bad = new Context()
    contexts.push(bad)
    expect(() => new IdentityService(bad, { lines: [{ id: 'Bad', name: 'X' }] })).toThrow(IdentityError)
    const badAdmin = new Context()
    contexts.push(badAdmin)
    expect(() => new IdentityService(badAdmin, { admins: ['Bad'] })).toThrow(IdentityError)
    const dupAdmins = new Context()
    contexts.push(dupAdmins)
    expect(() => new IdentityService(dupAdmins, { admins: ['alice', 'alice'] })).not.toThrow()
    const dup = new Context()
    contexts.push(dup)
    expect(() => new IdentityService(dup, {
      lines: [{ id: 'core', name: 'Core' }, { id: 'core', name: 'Dup' }],
    })).toThrow(IdentityError)
    const ctx = new Context()
    contexts.push(ctx)
    const service = new IdentityService(ctx, {})
    expect(() => service.registerMethod({ id: 'password', kind: 'password' })).toThrow(IdentityError)
    const dispose = service.registerMethod({ id: 'github', kind: 'oauth' })
    expect(service.listMethods()).toHaveLength(2)
    dispose()
    expect(service.listMethods()).toEqual([{ id: 'password', kind: 'password' }])
  })

  it('lists Settings models when llm is loaded and skips a failing provider', async () => {
    const ctx = await setup()
    class CatalogLlm extends Service {
      constructor() { super(ctx, 'llm') }
      listProviders() {
        return [{ id: 'mock' }, { id: 'down' }]
      }
      async listModels(provider: string) {
        if (provider === 'down') throw new Error('offline')
        return [{ id: 'chat', name: 'Chat' }]
      }
    }
    new CatalogLlm()
    expect(await ctx.identity.listCatalogModels()).toEqual([
      { id: 'mock/chat', name: 'mock · Chat' },
    ])
  })

  it('rejects unknown lines, non-members, and invalid model ids', async () => {
    const ctx = await setup({ lines: [{ id: 'core', name: 'Core' }, { id: 'guest', name: 'Guest' }] })
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.identity.loginPassword('alice', 'password1')
    await expect(ctx.identity.joinLine('missing')).rejects.toMatchObject({ code: 'IDENTITY_UNKNOWN_LINE' })
    await ctx.identity.joinLine('core')
    await ctx.identity.joinLine('core')
    await expect(ctx.identity.setLineModels('guest', [])).rejects.toMatchObject({ code: 'IDENTITY_NOT_MEMBER' })
    await expect(ctx.identity.setLineModels('core', ['not-a-route'])).rejects.toMatchObject({
      code: 'IDENTITY_INVALID_ARGUMENT',
    })
    await ctx.identity.setLineModels('core', ['mock/a', 'mock/a', 'mock/b'])
    expect(ctx.identity.currentAccount()?.memberships[0]?.modelIds).toEqual(['mock/a', 'mock/b'])
    await expect(ctx.identity.setActiveLine('guest')).rejects.toMatchObject({ code: 'IDENTITY_NOT_MEMBER' })
    await expect(ctx.identity.createLine('core', 'Core')).rejects.toMatchObject({ code: 'IDENTITY_UNAUTHORIZED' })
    await expect(ctx.identity.createLine('Bad', 'X')).rejects.toMatchObject({ code: 'IDENTITY_UNAUTHORIZED' })
    await expect(ctx.identity.createLine('ops', '   ')).rejects.toMatchObject({ code: 'IDENTITY_UNAUTHORIZED' })
  })

  it('treats an active line without membership as closed occupancy', () => {
    expect(occupancyOf({
      id: AccountId('alice'),
      name: 'Alice',
      admin: false,
      seedAdmin: false,
      activeLineId: 'core',
      memberships: [],
    })).toEqual({
      group: 'core',
      providers: [IDENTITY_CLOSED_PROVIDER],
      models: [IDENTITY_CLOSED_PROVIDER],
    })
  })

  it('fails loud when the local-users record is not a grant payload', async () => {
    const ctx = await setup()
    await ctx.credentials.modifyRecord(LOCAL_USERS_KEY, async () => ({ kind: 'api-key', key: 'x' }))
    await expect(ctx.identity.registerPassword('alice', 'password1', 'Alice')).rejects.toBeInstanceOf(Error)
    await ctx.credentials.modifyRecord(LOCAL_USERS_KEY, async () => ({ kind: 'grant', payload: { users: 1 } }))
    await expect(ctx.identity.loginPassword('alice', 'password1')).rejects.toBeInstanceOf(Error)
  })

  it('rejects a truncated hash, a missing sign-in method, and a corrupt reload', async () => {
    const ctx = await setup()
    await ctx.identity.registerPassword('alice', 'password1', 'Alice')
    await ctx.credentials.modifyRecord(LOCAL_USERS_KEY, async (current) => {
      if (current === undefined || current.kind !== 'grant') return current
      if (typeof current.payload !== 'object' || current.payload === null || !('users' in current.payload)) {
        return current
      }
      const users = current.payload.users
      if (!Array.isArray(users)) return current
      return {
        kind: 'grant',
        payload: {
          users: users.map((user) => {
            if (typeof user !== 'object' || user === null) return user
            return { ...user, hash: '00' }
          }),
          lines: 'lines' in current.payload ? current.payload.lines : [],
        },
      }
    })
    await expect(ctx.identity.loginPassword('alice', 'password1')).rejects.toMatchObject({
      code: 'IDENTITY_BAD_CREDENTIALS',
    })
    const methods = Reflect.get(ctx.identity, 'methods') as Map<string, unknown>
    methods.clear()
    await expect(ctx.identity.loginPassword('alice', 'password1')).rejects.toMatchObject({
      code: 'IDENTITY_UNKNOWN_METHOD',
    })
    methods.set('password', { id: 'password', kind: 'password' })
    const credentials = ctx.credentials
    const original = credentials.readRecord.bind(credentials)
    credentials.readRecord = async () => {
      throw new Error('unreadable')
    }
    await expect(ctx.identity.registerPassword('carol', 'password1', 'Carol')).rejects.toMatchObject({
      code: 'IDENTITY_ACCOUNTS_CORRUPT',
    })
    credentials.readRecord = original
  })
})
