/** Local username/password occupants stored as a credentials grant. */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto'
import z from 'zod'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'

/** Credentials record that holds overlay local users. */
export const LOCAL_USERS_KEY = credentialKey('identity', 'local-users')

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const HASH_BYTES = 32
const SALT_BYTES = 16
const USERNAME = /^[a-z][a-z0-9-]{1,31}$/
const MIN_PASSWORD = 8
const MAX_PASSWORD = 128
const MAX_NAME = 64

const storedMembershipSchema = z.object({
  lineId: z.string(),
  modelIds: z.array(z.string()),
})

const storedLineSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const storedUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  salt: z.string(),
  hash: z.string(),
  n: z.number(),
  role: z.enum(['admin', 'member']).default('member'),
  memberships: z.array(storedMembershipSchema).default([]),
  activeLineId: z.string().optional(),
})

const payloadSchema = z.object({
  users: z.array(storedUserSchema),
  lines: z.array(storedLineSchema).default([]),
})

/** One hashed local account as stored in the grant payload. */
export interface StoredLocalUser {
  readonly id: string
  readonly name: string
  readonly salt: string
  readonly hash: string
  readonly n: number
  readonly role: 'admin' | 'member'
  readonly memberships: readonly { readonly lineId: string; readonly modelIds: readonly string[] }[]
  readonly activeLineId?: string
}

/**
 * Copy a stored user and set or drop `activeLineId` under exactOptionalPropertyTypes.
 * @param user - current stored row.
 * @param activeLineId - joined line to activate, or omitted.
 * @returns the same secrets with the requested active line.
 */
export function storedUserWithActiveLine(
  user: StoredLocalUser,
  activeLineId: string | undefined,
): StoredLocalUser {
  const next: StoredLocalUser = {
    id: user.id,
    name: user.name,
    salt: user.salt,
    hash: user.hash,
    n: user.n,
    role: user.role,
    memberships: user.memberships,
  }
  if (activeLineId === undefined) return next
  return { ...next, activeLineId }
}

/**
 * Normalize a parsed grant user so omitted `activeLineId` is not present as `undefined`.
 * @param row - zod output.
 * @returns a stored user.
 */
export function toStoredUser(row: {
  id: string
  name: string
  salt: string
  hash: string
  n: number
  role: 'admin' | 'member'
  memberships: readonly { readonly lineId: string; readonly modelIds: readonly string[] }[]
  activeLineId?: string | undefined
}): StoredLocalUser {
  return storedUserWithActiveLine({
    id: row.id,
    name: row.name,
    salt: row.salt,
    hash: row.hash,
    n: row.n,
    role: row.role,
    memberships: row.memberships,
  }, row.activeLineId)
}

/** One stored business line. */
export interface StoredLine {
  readonly id: string
  readonly name: string
}

/**
 * Whether this string is a usable local username and occupant id.
 * @param id - candidate username.
 * @returns true when the id matches the local username pattern.
 */
export function isLocalUsername(id: string): boolean {
  return USERNAME.test(id)
}

/**
 * Trim and accept a display name.
 * @param name - candidate display name.
 * @returns the trimmed name, or `undefined` when empty or too long.
 */
export function parseDisplayName(name: string): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_NAME) return undefined
  return trimmed
}

/**
 * Whether this password meets the local-account length bounds.
 * @param password - candidate secret.
 * @returns true when the secret is 8–128 characters.
 */
export function isLocalPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD
}

/**
 * Read stored local users from a credentials record.
 * @param record - current grant, or `undefined` when none is stored.
 * @returns the user list; empty when nothing is stored.
 */
function parsePayload(record: CredentialRecord | undefined): {
  users: StoredLocalUser[]
  lines: StoredLine[]
} {
  if (record === undefined) return { users: [], lines: [] }
  if (record.kind !== 'grant') {
    throw new Error('identity local-users record is not a grant')
  }
  const parsed = payloadSchema.safeParse(record.payload)
  if (!parsed.success) {
    throw new Error('identity local-users payload is invalid')
  }
  return {
    users: parsed.data.users.map(toStoredUser),
    lines: parsed.data.lines,
  }
}

/**
 * Read stored local users from a credentials record.
 * @param record - current grant, or `undefined` when none is stored.
 * @returns the user list; empty when nothing is stored.
 */
export function parseStoredUsers(record: CredentialRecord | undefined): StoredLocalUser[] {
  return parsePayload(record).users
}

/**
 * Read stored business lines from a credentials record.
 * @param record - current grant, or `undefined` when none is stored.
 * @returns the line list; empty when nothing is stored.
 */
export function parseStoredLines(record: CredentialRecord | undefined): StoredLine[] {
  return parsePayload(record).lines
}

/**
 * Hash a password with a new or supplied salt.
 * @param password - plaintext password.
 * @param saltHex - existing salt when verifying; omitted when registering.
 * @returns hex salt, hex hash, and the scrypt N used.
 */
export async function hashLocalPassword(
  password: string,
  saltHex?: string,
): Promise<{ salt: string; hash: string; n: number }> {
  const salt = saltHex === undefined ? randomBytes(SALT_BYTES) : Buffer.from(saltHex, 'hex')
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, HASH_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, key) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
  return { salt: salt.toString('hex'), hash: derived.toString('hex'), n: SCRYPT_N }
}

/**
 * Compare a plaintext password to one stored hash.
 * @param password - candidate secret.
 * @param user - stored hash row.
 * @returns true when the secret matches the stored hash.
 */
export async function verifyLocalPassword(
  password: string,
  user: StoredLocalUser,
): Promise<boolean> {
  const hashed = await hashLocalPassword(password, user.salt)
  const left = Buffer.from(hashed.hash, 'hex')
  const right = Buffer.from(user.hash, 'hex')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
