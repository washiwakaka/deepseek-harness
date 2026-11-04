/** Advertise GitHub as an identity OAuth method. Authorization is not implemented. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-identity'

/** Cordis function-plugin name. */
export const name = 'identity-oauth-github'
/** Host identity registry that receives the GitHub method. */
export const inject = ['identity']

/** Method id advertised to Clients. */
export const GITHUB_METHOD_ID = 'github'

/**
 * Register `{ id: 'github', kind: 'oauth' }` on `ctx.identity`.
 * @param ctx - Host context that already provides `identity`.
 */
export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.identity.registerMethod({ id: GITHUB_METHOD_ID, kind: 'oauth' }),
    'identity-oauth-github',
  )
}
