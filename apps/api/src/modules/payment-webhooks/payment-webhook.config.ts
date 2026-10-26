export type PaymentProvider = 'stripe' | 'gocardless';
export const STRIPE_API_VERSION = '2026-09-30.endive' as const;
export const MAX_WEBHOOK_BYTES = 512 * 1024;
export function paymentConfig(
  provider?: PaymentProvider,
  env: NodeJS.ProcessEnv = process.env,
) {
  const enabled = env.T38_WEBHOOKS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled))
    throw new Error('Invalid T38 enable flag');
  if (enabled === 'false') return undefined;
  if (!['development', 'test'].includes(env.NODE_ENV ?? 'development'))
    throw new Error('T38 intake is restricted to development/test');
  if (env.T38_ENVIRONMENT !== 'test')
    throw new Error('T38 live intake is disabled');
  const config = (name: PaymentProvider) => {
    const prefix =
      name === 'stripe' ? 'T38_STRIPE_TEST' : 'T38_GOCARDLESS_TEST';
    const secret = env[`${prefix}_WEBHOOK_SECRET`];
    const accountScope = env[`${prefix}_ACCOUNT_ID`];
    if (
      !secret ||
      secret.trim() !== secret ||
      secret.length < 16 ||
      !accountScope ||
      !(name === 'stripe' ? /^acct_[A-Za-z0-9]+$/ : /^OR[A-Za-z0-9]+$/).test(
        accountScope,
      ) ||
      (name === 'stripe' && !secret.startsWith('whsec_'))
    )
      throw new Error('Invalid T38 endpoint configuration');
    return { provider: name, environment: 'test', secret, accountScope };
  };
  // Validate both configured endpoints before starting any payment worker.
  const stripe = config('stripe');
  const gocardless = config('gocardless');
  return provider === 'gocardless' ? gocardless : stripe;
}
