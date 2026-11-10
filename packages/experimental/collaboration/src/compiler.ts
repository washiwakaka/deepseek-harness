/** Per-actor compile of room-visible lines and room-Agent turns into one child task. */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session'
import type { CollaborationMessage, ResolvedAiActor } from './types.ts'

/** Stable instruction prefix for one mention task. The recipient name follows. */
export const COLLABORATION_MENTION_INSTRUCTION
  = 'You are {name} in a shared room. Use the room conversation below. Answer as yourself.'

/** Prefix for the room Agent's compiled peer-chat delta. */
export const COLLABORATION_ROOM_CONTEXT_INSTRUCTION = 'Shared room transcript.'

/** Label for a room-Agent `user/message` turn in a mention transcript. */
export const ROOM_USER_LABEL = 'User'

/** Label for a room-Agent `assistant/message` turn in a mention transcript. */
export const ROOM_ASSISTANT_LABEL = 'Assistant'

/** One labeled line from the room Agent conversation, keyed by log seq. */
export interface RoomConversationLine {
  readonly seq: SessionSeq
  readonly name: string
  readonly text: string
}

function inWindow(
  seq: SessionSeq,
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
): boolean {
  const start = lastThroughSeq === undefined ? -1 : lastThroughSeq
  return seq > start && seq <= throughSeq
}

function textOf(content: readonly ContentBlock[]): string {
  let text = ''
  for (const block of content) {
    if (block.type !== 'text') continue
    text += block.text
  }
  return text
}

function labeledLines(
  messages: readonly CollaborationMessage[],
  conversation: readonly RoomConversationLine[],
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
  skipActorId: string | undefined,
): string[] {
  const lines: { seq: SessionSeq; text: string }[] = []
  for (const message of messages) {
    if (!inWindow(message.seq, throughSeq, lastThroughSeq)) continue
    if (skipActorId !== undefined && message.actorId === skipActorId) continue
    lines.push({ seq: message.seq, text: `[${message.name}] ${message.text}` })
  }
  for (const row of conversation) {
    if (!inWindow(row.seq, throughSeq, lastThroughSeq)) continue
    if (row.text.length === 0) continue
    lines.push({ seq: row.seq, text: `[${row.name}] ${row.text}` })
  }
  lines.sort((left, right) => left.seq - right.seq)
  return lines.map(line => line.text)
}

/** Marker replacing room lines dropped by the compile byte budget. */
export const COLLABORATION_COMPILE_OMITTED_LINE = '[earlier room lines omitted]'

/**
 * Drop the oldest lines until the joined transcript fits the byte budget.
 * The durable room log is untouched; only this compiled copy shrinks.
 * @param lines - labeled transcript lines in seq order.
 * @param maxBytes - UTF-8 byte budget for the joined lines, or `undefined` for no budget.
 * @returns the newest lines that fit, led by an omission marker when any line was dropped.
 */
export function fitCompileLines(
  lines: readonly string[],
  maxBytes: number | undefined,
): string[] {
  if (maxBytes === undefined) return [...lines]
  const kept = [...lines]
  let omitted = false
  const joinedBytes = (rows: readonly string[]): number =>
    Buffer.byteLength(rows.join('\n'), 'utf8')
  while (kept.length > 1 && joinedBytes(kept) > maxBytes) {
    kept.shift()
    omitted = true
  }
  if (!omitted) return kept
  const withMarker = [COLLABORATION_COMPILE_OMITTED_LINE, ...kept]
  while (withMarker.length > 2 && joinedBytes(withMarker) > maxBytes) {
    withMarker.splice(1, 1)
  }
  return withMarker
}

/**
 * Pull room-Agent user and assistant turns that a mention child cannot see through `deriveMessages()`.
 * Fork-inherited events stay off the child's own history; skip already-compiled mention and room-context injects.
 * @param events - room log in seq order.
 * @param throughSeq - inclusive seq of the triggering mention.
 * @param lastThroughSeq - previous watermark for this occupant, if any.
 * @returns labeled turns inside the compile window.
 */
export function collectRoomConversation(
  events: readonly SessionEvent[],
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
): RoomConversationLine[] {
  const lines: RoomConversationLine[] = []
  for (const event of events) {
    if (!inWindow(event.seq, throughSeq, lastThroughSeq)) continue
    if (event.type === 'user/message') {
      const kind = event.data.source.kind
      if (kind === 'collaboration-room-context' || kind === 'collaboration-mention') continue
      if (kind !== 'user') continue
      const text = textOf(event.data.content)
      if (text.length === 0) continue
      lines.push({ seq: event.seq, name: ROOM_USER_LABEL, text })
      continue
    }
    if (event.type !== 'assistant/message') continue
    const text = textOf(event.data.message.content)
    if (text.length === 0) continue
    lines.push({ seq: event.seq, name: ROOM_ASSISTANT_LABEL, text })
  }
  return lines
}

/**
 * Compile room-visible lines and room-Agent turns for one AI occupant through an inclusive seq.
 * Skips that occupant's own auto-posted replies; those already live on the child.
 * @param messages - projected room lines in log order.
 * @param recipient - AI occupant being invoked.
 * @param throughSeq - inclusive seq of the triggering mention.
 * @param lastThroughSeq - previous watermark for this occupant, if any.
 * @param conversation - room-Agent user and assistant turns in the same window.
 * @param maxCompileBytes - UTF-8 byte budget for the compiled task; older lines drop out behind an omission marker.
 * @returns labeled transcript plus the recipient instruction.
 */
export function compileMentionTask(
  messages: readonly CollaborationMessage[],
  recipient: ResolvedAiActor,
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
  conversation: readonly RoomConversationLine[] = [],
  maxCompileBytes?: number,
): string {
  const lines = labeledLines(messages, conversation, throughSeq, lastThroughSeq, recipient.id)
  const instruction = COLLABORATION_MENTION_INSTRUCTION.replace('{name}', recipient.name)
  if (lines.length === 0) return instruction
  const budget = maxCompileBytes === undefined
    ? undefined
    : Math.max(0, maxCompileBytes - Buffer.byteLength(`${instruction}\n\n`, 'utf8'))
  return `${instruction}\n\n${fitCompileLines(lines, budget).join('\n')}`
}

/**
 * Compile uncompiled room-visible lines for the room Agent.
 * @param messages - projected room lines in log order.
 * @param throughSeq - inclusive seq of the latest room line.
 * @param lastThroughSeq - previous room-Agent compile watermark, if any.
 * @param maxCompileBytes - UTF-8 byte budget for the compiled delta; older lines drop out behind an omission marker.
 * @returns labeled transcript, or `undefined` when the delta is empty.
 */
export function compileRoomContext(
  messages: readonly CollaborationMessage[],
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
  maxCompileBytes?: number,
): string | undefined {
  const lines = labeledLines(messages, [], throughSeq, lastThroughSeq, undefined)
  if (lines.length === 0) return undefined
  const budget = maxCompileBytes === undefined
    ? undefined
    : Math.max(0, maxCompileBytes - Buffer.byteLength(`${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n`, 'utf8'))
  return `${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n${fitCompileLines(lines, budget).join('\n')}`
}
