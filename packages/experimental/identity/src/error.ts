/** Typed local-identity failures. */

/** Stable failure raised by local identity. Route on `code`, never by parsing `message`. */
export class IdentityError extends Error {
  /** Stable machine-readable failure code; route on this, never on `message`. */
  readonly code: string

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = 'IdentityError'
  }
}
