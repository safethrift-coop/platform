import { ForbiddenException } from '@nestjs/common';
export const DEVELOPMENT_CONTENT_VERSION = 't40-development-placeholder-v1';
export const DEVELOPMENT_DECLARATIONS = [
  'Development declaration placeholder 1 — not approved',
  'Development declaration placeholder 2 — not approved',
  'Development declaration placeholder 3 — not approved',
  'Development declaration placeholder 4 — not approved',
] as const;
export function validateRegistrationEnvironment(
  env: Record<string, unknown>,
): void {
  if (
    !['false', 'true'].includes(
      typeof env.T40_FIXTURE_MODE === 'string'
        ? env.T40_FIXTURE_MODE
        : env.T40_FIXTURE_MODE === undefined
          ? 'false'
          : '',
    )
  )
    throw new Error('Invalid T40 fixture flag');
  if (
    env.T40_APPLICATIONS_ENABLED !== undefined &&
    env.T40_APPLICATIONS_ENABLED !== 'false'
  )
    throw new Error('T40 real application collection is not approved');
  if (env.T40_FIXTURE_MODE !== 'true') return;
  if (env.NODE_ENV !== 'test')
    throw new Error('T40 fixture mode requires NODE_ENV=test');
  let url: URL;
  try {
    url = new URL(String(env.DATABASE_URL));
  } catch {
    throw new Error('T40 requires an explicit local test database');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/safethrift_[a-z0-9_]*test$/.test(url.pathname)
  )
    throw new Error('T40 requires an explicit local test database');
}
export function requireRegistrationFixture(email?: string): void {
  try {
    validateRegistrationEnvironment(process.env);
  } catch {
    throw new ForbiddenException(
      'Registration is closed pending approved privacy and declaration content',
    );
  }
  if (
    process.env.T40_FIXTURE_MODE !== 'true' ||
    (email !== undefined && !/^[^\s@]+@[^\s@]+\.invalid$/i.test(email))
  )
    throw new ForbiddenException(
      'Registration is closed. Local synthetic test accounts only',
    );
}
