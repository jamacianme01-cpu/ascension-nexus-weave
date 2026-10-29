import { createMiddleware } from '@tanstack/react-start'

// Guest path does not require external auth attachment.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => next({ headers: {} }),
)
