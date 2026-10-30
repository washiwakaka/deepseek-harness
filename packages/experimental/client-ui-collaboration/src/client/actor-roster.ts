/** Observable Host occupant roster and the test human currently posting. */

import type { CollaborationActorRow } from '@deepseek-ai/dsh-experimental-api-collaboration/types'
import { firstHumanId } from './post-draft.ts'

/** Roster plus the human selected as the test author and the optional Settings model to mention. */
export interface ActorRosterSnapshot {
  readonly actors: readonly CollaborationActorRow[]
  readonly mentionModels: readonly CollaborationActorRow[]
  readonly selectedHumanId: string | undefined
  readonly selectedAiId: string | undefined
  /** True while a room post or send-with-room Remote call is in flight. */
  readonly thinking: boolean
  /** Branch Session ids opened from a mention on this Client. */
  readonly branchIds: readonly string[]
}

/**
 * Display name for a Host occupant or Settings mention, else the raw id.
 * @param snapshot - current roster.
 * @param actorId - occupant or mention route id.
 */
export function occupantName(snapshot: ActorRosterSnapshot, actorId: string): string {
  for (const row of snapshot.actors) {
    if (row.id === actorId) return row.name
  }
  for (const row of snapshot.mentionModels) {
    if (row.id === actorId) return row.name
  }
  return actorId
}

/**
 * Keep the current human when they remain in the roster; otherwise the first human.
 * @param selectedHumanId - previously selected author.
 * @param actors - latest Host roster.
 */
function selectedHumanAmong(
  selectedHumanId: string | undefined,
  actors: readonly CollaborationActorRow[],
): string | undefined {
  if (selectedHumanId !== undefined
    && actors.some(actor => actor.id === selectedHumanId && actor.kind === 'human')) {
    return selectedHumanId
  }
  return firstHumanId(actors)
}

/**
 * Keep the current mention target when it remains in the Settings list; otherwise none.
 * @param selectedAiId - previously selected model, if any.
 * @param models - latest Settings models this human may `@`.
 */
function selectedAiAmong(
  selectedAiId: string | undefined,
  models: readonly CollaborationActorRow[],
): string | undefined {
  if (selectedAiId !== undefined && models.some(actor => actor.id === selectedAiId)) {
    return selectedAiId
  }
  return undefined
}

/** Bare snapshot source of occupants from `listActors` and `@` models from `listMentionModels`. */
export class ActorRosterStore {
  private snapshot: ActorRosterSnapshot = {
    actors: [],
    mentionModels: [],
    selectedHumanId: undefined,
    selectedAiId: undefined,
    thinking: false,
    branchIds: [],
  }
  private readonly listeners = new Set<() => void>()

  getSnapshot(): ActorRosterSnapshot {
    return this.snapshot
  }

  /**
   * Subscribe to roster replacements.
   * @param listener - runs after {@link set}, {@link setMentionModels}, {@link selectHuman},
   * {@link selectAi}, {@link setThinking}, or {@link addBranch}.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Replace the occupant roster and keep a valid human selection.
   * @param next - occupants in Host order.
   */
  set(next: readonly CollaborationActorRow[]): void {
    this.snapshot = {
      ...this.snapshot,
      actors: next,
      selectedHumanId: selectedHumanAmong(this.snapshot.selectedHumanId, next),
    }
    this.notify()
  }

  /**
   * Replace the Settings models this human may `@`.
   * @param next - advertised models for the selected human.
   */
  setMentionModels(next: readonly CollaborationActorRow[]): void {
    this.snapshot = {
      ...this.snapshot,
      mentionModels: next,
      selectedAiId: selectedAiAmong(this.snapshot.selectedAiId, next),
    }
    this.notify()
  }

  /**
   * Select a human author for test posts. Non-human ids are ignored.
   * @param id - Host occupant id.
   */
  selectHuman(id: string): void {
    if (this.snapshot.selectedHumanId === id) return
    if (!this.snapshot.actors.some(actor => actor.id === id && actor.kind === 'human')) return
    this.snapshot = {
      ...this.snapshot,
      selectedHumanId: id,
      selectedAiId: undefined,
      mentionModels: [],
    }
    this.notify()
  }

  /**
   * Select which Settings model the next room post should mention, or clear the target.
   * @param id - mention route id, or `''` for none.
   */
  selectAi(id: string): void {
    const next = id === '' ? undefined : id
    if (this.snapshot.selectedAiId === next) return
    if (next !== undefined && !this.snapshot.mentionModels.some(actor => actor.id === next)) {
      return
    }
    this.snapshot = { ...this.snapshot, selectedAiId: next }
    this.notify()
  }

  /**
   * Show or hide the in-flight thinking row next to the composer.
   * @param thinking - true while a room Remote call has not settled.
   */
  setThinking(thinking: boolean): void {
    if (this.snapshot.thinking === thinking) return
    this.snapshot = { ...this.snapshot, thinking }
    this.notify()
  }

  /**
   * Remember a branch Session opened from a room mention.
   * @param id - branch Session identity.
   */
  addBranch(id: string): void {
    if (this.snapshot.branchIds.includes(id)) return
    this.snapshot = { ...this.snapshot, branchIds: [...this.snapshot.branchIds, id] }
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
