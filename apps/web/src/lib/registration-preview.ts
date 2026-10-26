// Server-side only. No production/public collection switch exists in T40.
export function registrationPreview(
  env: NodeJS.ProcessEnv = process.env,
  host = "",
) {
  if (
    env.NODE_ENV !== "development" ||
    env.T40_DEVELOPMENT_PREVIEW !== "true" ||
    !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  )
    return null;
  try {
    const api = new URL(env.NEXT_PUBLIC_API_URL ?? "");
    if (
      api.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(api.hostname) ||
      api.pathname !== "/api/v1" ||
      api.search ||
      api.hash ||
      api.username ||
      api.password
    )
      return null;
    return {
      apiBase: api.href.replace(/\/$/, ""),
      fixtureSubmissions: env.T40_LOCAL_FIXTURE_SUBMISSIONS === "true",
    };
  } catch {
    return null;
  }
}
