import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import IdentityService from '@deepseek-ai/dsh-experimental-identity'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import * as GitHubOauth from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

describe('identity-oauth-github', () => {
  it('advertises github and withdraws it on dispose', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    new MemoryCredentials(ctx)
    await ctx.plugin(IdentityService)
    expect(ctx.identity.listMethods()).toEqual([{ id: 'password', kind: 'password' }])
    const fiber = await ctx.plugin(GitHubOauth)
    expect(ctx.identity.listMethods()).toEqual([
      { id: 'password', kind: 'password' },
      { id: GitHubOauth.GITHUB_METHOD_ID, kind: 'oauth' },
    ])
    await fiber.dispose()
    expect(ctx.identity.listMethods()).toEqual([{ id: 'password', kind: 'password' }])
  })
})
