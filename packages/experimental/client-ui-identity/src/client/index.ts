/** Browser entry: mounts the identity Remote and registers the sidebar chip. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import identityRemote from '@deepseek-ai/dsh-experimental-api-identity/remote'
import { mountIdentityUi } from './mount.ts'

export { inject } from './mount.ts'

/**
 * Register identity dictionaries and the sidebar account chip.
 * @param ctx - Client Context with the declared `inject` services available.
 * @returns disposer that withdraws the UI and the Remote mount.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountIdentityUi(ctx, identityRemote)
}
