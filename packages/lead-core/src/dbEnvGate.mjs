export const REQUIRED_DB_ENV = [
  "SIRINX_DATABASE_URL",
  "SIRINX_DB_SSL_MODE"
];

export function inspectDbEnv(env = process.env) {
  const present = {};
  const missing = [];

  for (const name of REQUIRED_DB_ENV) {
    const value = env[name];
    present[name] = typeof value === "string" && value.length > 0;
    if (!present[name]) {
      missing.push(name);
    }
  }

  const sslMode = env.SIRINX_DB_SSL_MODE;
  const sslModeAllowed = !sslMode || ["require", "verify-full"].includes(sslMode);

  return {
    ok: missing.length === 0 && sslModeAllowed,
    productionReady: missing.length === 0 && sslModeAllowed,
    missing,
    present,
    checks: {
      databaseUrlPresent: present.SIRINX_DATABASE_URL,
      sslModePresent: present.SIRINX_DB_SSL_MODE,
      sslModeAllowed
    },
    redaction: "values_not_printed"
  };
}

export function assertDbEnvReady(env = process.env) {
  const result = inspectDbEnv(env);
  if (!result.ok) {
    throw new Error(`Database environment is not ready: missing=${result.missing.join(",") || "none"} sslModeAllowed=${result.checks.sslModeAllowed}`);
  }
  return result;
}
