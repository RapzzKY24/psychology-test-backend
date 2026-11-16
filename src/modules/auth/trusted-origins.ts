/** Read the deployment's allowed browser origins, rejecting malformed entries at boot. */
export function trustedAuthOrigins(env: NodeJS.ProcessEnv): string[] {
  const entries = [
    env.BETTER_AUTH_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','),
    ...(env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:4000', 'http://localhost:3000']),
  ];
  const origins = entries
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      const url = new URL(value);
      if (url.pathname !== '/' || url.search || url.hash || !/^https?:$/.test(url.protocol)) {
        throw new Error(`Invalid auth origin: ${value}`);
      }
      return url.origin;
    });
  if (env.NODE_ENV === 'production' && origins.length === 0) {
    throw new Error('BETTER_AUTH_URL or BETTER_AUTH_TRUSTED_ORIGINS is required');
  }
  return [...new Set(origins)];
}
