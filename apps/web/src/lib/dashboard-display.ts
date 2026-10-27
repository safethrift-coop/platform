const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
// Decimal(12,2) is bounded to 9999999999.99. Pass exact decimal text to Intl;
// the runtime supports decimal-string formatting, despite older TS declarations.
export function gbp(amount: string): string {
  if (!/^-?\d{1,10}\.\d{2}$/.test(amount)) return "Amount unavailable";
  return (pounds.format as unknown as (value: string) => string)(amount);
}
export function riskLabel(value: string): string {
  return (
    (
      {
        low_risk: "Low",
        moderate_risk: "Moderate",
        high_risk: "High",
        unscored: "Not yet scored",
      } as Record<string, string>
    )[value] ?? "Unavailable"
  );
}
export function accountLabel(value: string): string {
  return (
    (
      {
        savings_fsa: "Flexible savings (FSA)",
        savings_rsa: "Regular savings (RSA)",
        savings_gsa: "Goal savings (GSA)",
      } as Record<string, string>
    )[value] ?? "Savings account"
  );
}
export function provenanceLabel(value: string): string {
  return value === "simulation"
    ? "Simulation — no external settlement"
    : value === "historical_unknown"
      ? "Historical transaction — unknown provenance; settlement unverified"
      : "No independent settlement evidence — settlement unverified";
}
// Mutation authorization additionally requires the API's T25 capability.
export function dashboardConfig(env: NodeJS.ProcessEnv, host: string) {
  const loopback = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const raw = env.NEXT_PUBLIC_API_URL;
  if (!raw) return null;
  try {
    const api = new URL(raw);
    if (
      api.pathname !== "/api/v1" ||
      api.search ||
      api.hash ||
      api.username ||
      api.password
    )
      return null;
    const localApi =
      api.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(api.hostname);
    if (!localApi && api.protocol !== "https:") return null;
    if (env.NODE_ENV === "production" && localApi) return null;
    return {
      apiBase: api.href.replace(/\/$/, ""),
      localSimulation:
        env.NODE_ENV === "development" &&
        loopback &&
        localApi &&
        env.T41_LOCAL_SIMULATION_PREVIEW === "true",
    };
  } catch {
    return null;
  }
}
