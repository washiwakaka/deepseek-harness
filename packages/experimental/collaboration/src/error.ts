/** Typed collaboration-room failures. */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Stable failure raised by the collaboration-room domain. */
export class CollaborationError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'CollaborationError'
  }
}
