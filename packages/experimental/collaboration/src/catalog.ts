/** Settings-connected LLM routes a human occupant may `@`. */

import { ActorId } from './types.ts'
import type { ResolvedAiActor, ResolvedHumanActor } from './types.ts'

/** Host LLM surface used to list connected providers and advertised models. */
export interface CollaborationLlm {
  listProviders(): readonly { readonly id: string }[]
  listModels(provider: string): Promise<readonly { readonly id: string; readonly name: string }[]>
}

/**
 * Durable mention id for one Settings route.
 * @param provider - registered LLM provider id.
 * @param model - advertised model id on that provider.
 * @returns `{provider}/{model}`.
 */
export function mentionRouteId(provider: string, model: string): string {
  return `${provider}/${model}`
}

/**
 * Split a Settings mention id into provider and model.
 * @param id - `{provider}/{model}`; the model may contain further `/` characters.
 * @returns provider and model, or `undefined` when the id has no `/`.
 */
export function parseMentionRoute(id: string): { provider: string; model: string } | undefined {
  const slash = id.indexOf('/')
  if (slash <= 0 || slash === id.length - 1) return undefined
  return { provider: id.slice(0, slash), model: id.slice(slash + 1) }
}

/**
 * Whether this human's allowlist includes the provider.
 * @param human - posting author.
 * @param provider - registered LLM provider id.
 * @returns false when the human lists providers and this one is absent.
 */
export function humanMayUseProvider(human: ResolvedHumanActor, provider: string): boolean {
  return human.providers.length === 0 || human.providers.includes(provider)
}

/**
 * Advertised models this human may `@`, in provider then model order.
 * @param llm - live Host LLM registry.
 * @param human - posting author whose `providers` allowlist applies.
 * @returns advertised models on allowed providers.
 */
export async function listCatalogMentions(
  llm: CollaborationLlm,
  human: ResolvedHumanActor,
): Promise<readonly ResolvedAiActor[]> {
  const rows: ResolvedAiActor[] = []
  for (const provider of llm.listProviders()) {
    if (!humanMayUseProvider(human, provider.id)) continue
    let models: readonly { readonly id: string; readonly name: string }[]
    try {
      models = await llm.listModels(provider.id)
    } catch (catalogError) {
      // A missing credential or down endpoint must not hide other connected providers.
      void catalogError
      continue
    }
    for (const model of models) {
      rows.push({
        id: ActorId(mentionRouteId(provider.id, model.id)),
        kind: 'ai',
        name: model.name,
        provider: provider.id,
        model: model.id,
      })
    }
  }
  return rows
}
