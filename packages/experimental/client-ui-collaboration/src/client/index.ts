/** Browser entry: mounts the collaboration Remote and registers room presentation. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import collaborationRemote from '@deepseek-ai/dsh-experimental-api-collaboration/remote'
import { mountCollaborationUi } from './mount.ts'

export { inject } from './mount.ts'

/**
 * Register collaboration-room dictionaries, Chat rows, thinking rows, the header badge, and the composer post button.
 * @param ctx - Client Context with the declared `inject` services available.
 * @returns disposer that withdraws the UI and the Remote mount.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountCollaborationUi(ctx, collaborationRemote)
}
