import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('collaboration bundle', () => {
  it('inserts identity, GitHub method, Host, Remote, and Client UI plugins without an overlay actor list', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const parsed = yaml.load(
      readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
    const inserted = (parsed as { insert?: { id?: string; name?: string }[] }[])
      .flatMap(patch => patch.insert ?? [])
    expect(inserted.find(entry => entry.id === 'identity')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-identity',
    })
    expect(inserted.find(entry => entry.id === 'identity-oauth-github')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-identity-oauth-github',
    })
    expect(inserted.find(entry => entry.id === 'api-identity')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-api-identity',
    })
    expect(inserted.find(entry => entry.id === 'ui-identity')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-client-ui-identity',
    })
    expect(inserted.find(entry => entry.id === 'collaboration')).toEqual({
      id: 'collaboration',
      name: '@deepseek-ai/dsh-experimental-collaboration',
      config: { actors: [] },
    })
    expect(inserted.find(entry => entry.id === 'api-collaboration')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-api-collaboration',
    })
    expect(inserted.find(entry => entry.id === 'ui-collaboration')).toMatchObject({
      name: '@deepseek-ai/dsh-experimental-client-ui-collaboration',
    })
  })
})
