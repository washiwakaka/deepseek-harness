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
 * @returns labeled transcript plus the recipient instruction.
 */
export function compileMentionTask(
  messages: readonly CollaborationMessage[],
  recipient: ResolvedAiActor,
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
  conversation: readonly RoomConversationLine[] = [],
): string {
  const lines = labeledLines(messages, conversation, throughSeq, lastThroughSeq, recipient.id)
  const instruction = COLLABORATION_MENTION_INSTRUCTION.replace('{name}', recipient.name)
  if (lines.length === 0) return instruction
  return `${instruction}\n\n${lines.join('\n')}`
}

/**
 * Compile uncompiled room-visible lines for the room Agent.
 * @param messages - projected room lines in log order.
 * @param throughSeq - inclusive seq of the latest room line.
 * @param lastThroughSeq - previous room-Agent compile watermark, if any.
 * @returns labeled transcript, or `undefined` when the delta is empty.
 */
export function compileRoomContext(
  messages: readonly CollaborationMessage[],
  throughSeq: SessionSeq,
  lastThroughSeq: SessionSeq | undefined,
): string | undefined {
  const lines = labeledLines(messages, [], throughSeq, lastThroughSeq, undefined)
  if (lines.length === 0) return undefined
  return `${COLLABORATION_ROOM_CONTEXT_INSTRUCTION}\n\n${lines.join('\n')}`
}
