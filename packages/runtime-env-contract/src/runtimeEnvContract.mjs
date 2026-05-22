import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_ROOT = new URL("../../../", import.meta.url);
const DEFAULT_WRANGLER_PATH = new URL("../../../wrangler.jsonc", import.meta.url);
const DEFAULT_ENV_EXAMPLE_PATH = new URL("../../../.env.example", import.meta.url);
const DEFAULT_STATIC_ROOT = new URL("../../../apps/www/static", import.meta.url);
const DEFAULT_FUNCTIONS_ROOT = new URL("../../../functions", import.meta.url);

export const PUBLIC_WRANGLER_VARS = [
  "SIRINX_API_HOSTING_STRATEGY",
  "SIRINX_API_ORIGIN",
  "SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED",
  "SIRINX_EXTERNAL_SENDS_ENABLED"
];

export const PRIVATE_RUNTIME_ENVS = [
  "SIRINX_DATABASE_URL",
  "SIRINX_ADMIN_API_TOKEN",
  "SIRINX_LINE_CHANNEL_ACCESS_TOKEN",
  "SIRINX_LINE_CHANNEL_SECRET",
  "SIRINX_META_APP_SECRET"
];

export const RUNTIME_CONFIG_ENVS = [
  "SIRINX_DB_SSL_MODE",
  "SIRINX_LINE_ALLOWED_RECIPIENTS",
  "SIRINX_ADMIN_LOCAL_DEV_BYPASS",
  "SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS",
  "SIRINX_DB_DRY_RUN_MODE",
  "SIRINX_ALLOW_DB_MUTATION"
];

export const STAGING_SMOKE_ENVS = [
  "SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED",
  "SIRINX_STAGING_ORIGIN"
];

const SECRET_LIKE_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE_URL|API_KEY)$/i;
const SECRET_LIKE_VALUE_PATTERN = /(postgres(?:ql)?:\/\/|supabase\.co.*(?:anon|service|secret|token)|sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{20,})/i;
const PUBLIC_STATIC_EXTENSIONS = new Set([".html", ".js", ".css", ".json"]);
const FUNCTION_ALLOWED_ENV_KEYS = new Set([
  "SIRINX_API_ORIGIN",
  "SIRINX_ALLOW_LOCAL_API_ORIGIN"
]);

export function buildRuntimeEnvContractReport({
  env = process.env,
  rootDir = DEFAULT_ROOT,
  wranglerPath = DEFAULT_WRANGLER_PATH,
  envExamplePath = DEFAULT_ENV_EXAMPLE_PATH,
  staticRoot = DEFAULT_STATIC_ROOT,
  functionsRoot = DEFAULT_FUNCTIONS_ROOT
} = {}) {
  const wrangler = inspectWranglerRuntimeContract({ wranglerPath });
  const envExample = inspectEnvExampleContract({ envExamplePath });
  const publicStatic = inspectPublicStaticForRuntimeSecrets({ rootDir, staticRoot });
  const functions = inspectFunctionsRuntimeContract({ rootDir, functionsRoot });
  const runtime = inspectRuntimeEnvPresence({ env });

  const contractReady = wrangler.ok && envExample.ok && publicStatic.ok && functions.ok;
  const runtimeReady = runtime.ok;
  const productionReady = contractReady && runtimeReady;
  const blockers = [
    ...wrangler.findings,
    ...envExample.findings,
    ...publicStatic.findings,
    ...functions.findings,
    ...runtime.missing.map((name) => `runtime_env_missing:${name}`),
    ...runtime.findings
  ];
  const report = {
    system: "SIRINX Sovereign Agentic Swarm v2.1",
    report_version: "runtime-env-contract-1",
    status: productionReady ? "ready" : "blocked",
    contractReady,
    runtimeReady,
    productionReady,
    wrangler,
    envExample,
    publicStatic,
    functions,
    runtime,
    blockers,
    guardrail: "runtime-env-contract is read-only; secret values are never printed; public vars and private runtime env are separated"
  };

  return {
    ...report,
    validation: validateRuntimeEnvContractReport(report)
  };
}

export function inspectWranglerRuntimeContract({ wranglerPath = DEFAULT_WRANGLER_PATH } = {}) {
  const findings = [];
  if (!existsSync(wranglerPath)) {
    return {
      ok: false,
      present: false,
      findings: ["wrangler_jsonc_missing"],
      secretValuePrinted: false
    };
  }

  let config;
  try {
    config = parseJsonc(readFileSync(wranglerPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      present: true,
      findings: [`wrangler_jsonc_parse_failed:${error.message}`],
      secretValuePrinted: false
    };
  }

  const vars = config.vars && typeof config.vars === "object" ? config.vars : {};
  for (const key of PUBLIC_WRANGLER_VARS) {
    if (!hasNonEmpty(vars[key])) {
      findings.push(`public_var_missing:${key}`);
    }
  }

  for (const key of Object.keys(vars)) {
    if (!PUBLIC_WRANGLER_VARS.includes(key)) {
      findings.push(`public_var_not_in_contract:${key}`);
    }
    if (SECRET_LIKE_KEY_PATTERN.test(key)) {
      findings.push(`secret_like_key_forbidden_in_wrangler_vars:${key}`);
    }
    if (SECRET_LIKE_VALUE_PATTERN.test(String(vars[key] || ""))) {
      findings.push(`secret_like_value_forbidden_in_wrangler_vars:${key}`);
    }
  }

  if (vars.SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED !== "false") {
    findings.push("public_social_webhook_processing_must_default_false");
  }
  if (vars.SIRINX_EXTERNAL_SENDS_ENABLED !== "false") {
    findings.push("public_external_sends_must_default_false");
  }

  return {
    ok: findings.length === 0,
    present: true,
    allowedPublicVars: PUBLIC_WRANGLER_VARS,
    publicVars: Object.fromEntries(
      Object.entries(vars).map(([key, value]) => [
        key,
        {
          present: hasNonEmpty(value),
          valuePrinted: false
        }
      ])
    ),
    findings,
    secretValuePrinted: false
  };
}

export function inspectEnvExampleContract({ envExamplePath = DEFAULT_ENV_EXAMPLE_PATH } = {}) {
  const findings = [];
  if (!existsSync(envExamplePath)) {
    return {
      ok: false,
      present: false,
      findings: ["env_example_missing"],
      secretValuePrinted: false
    };
  }

  const entries = parseEnvExample(readFileSync(envExamplePath, "utf8"));
  const required = [
    ...PUBLIC_WRANGLER_VARS,
    ...PRIVATE_RUNTIME_ENVS,
    ...RUNTIME_CONFIG_ENVS,
    ...STAGING_SMOKE_ENVS
  ];
  const names = new Set(entries.map((entry) => entry.name));

  for (const name of required) {
    if (!names.has(name)) {
      findings.push(`env_example_missing:${name}`);
    }
  }

  for (const entry of entries) {
    if (PRIVATE_RUNTIME_ENVS.includes(entry.name) && hasNonEmpty(entry.value)) {
      findings.push(`private_env_example_must_be_blank:${entry.name}`);
    }
    if (SECRET_LIKE_KEY_PATTERN.test(entry.name) && hasNonEmpty(entry.value)) {
      findings.push(`secret_like_env_example_must_be_blank:${entry.name}`);
    }
    if (SECRET_LIKE_VALUE_PATTERN.test(entry.value)) {
      findings.push(`secret_like_env_example_value_forbidden:${entry.name}`);
    }
  }

  const expectedDefaults = {
    SIRINX_EXTERNAL_SENDS_ENABLED: "false",
    SIRINX_ADMIN_LOCAL_DEV_BYPASS: "false",
    SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: "false",
    SIRINX_DB_DRY_RUN_MODE: "validate-only",
    SIRINX_ALLOW_DB_MUTATION: "false",
    SIRINX_DEPLOY_NETWORK_SMOKE_ALLOWED: "false"
  };
  for (const [name, value] of Object.entries(expectedDefaults)) {
    const entry = entries.find((item) => item.name === name);
    if (!entry || entry.value !== value) {
      findings.push(`env_example_default_must_be:${name}=${value}`);
    }
  }

  return {
    ok: findings.length === 0,
    present: true,
    requiredCount: required.length,
    entryCount: entries.length,
    privateRuntimeEnvNames: PRIVATE_RUNTIME_ENVS,
    findings,
    secretValuePrinted: false
  };
}

export function inspectPublicStaticForRuntimeSecrets({
  rootDir = DEFAULT_ROOT,
  staticRoot = DEFAULT_STATIC_ROOT
} = {}) {
  const findings = [];
  const files = listFiles(staticRoot).filter((filePath) => PUBLIC_STATIC_EXTENSIONS.has(extensionOf(filePath)));

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    const rel = relative(rootDir.pathname, filePath);
    for (const name of [...PRIVATE_RUNTIME_ENVS, ...RUNTIME_CONFIG_ENVS]) {
      if (source.includes(name)) {
        findings.push(`public_static_must_not_reference_private_env:${rel}:${name}`);
      }
    }
    if (SECRET_LIKE_VALUE_PATTERN.test(source)) {
      findings.push(`public_static_contains_secret_like_value:${rel}`);
    }
  }

  return {
    ok: findings.length === 0,
    scannedFileCount: files.length,
    findings,
    secretValuePrinted: false
  };
}

export function inspectFunctionsRuntimeContract({
  rootDir = DEFAULT_ROOT,
  functionsRoot = DEFAULT_FUNCTIONS_ROOT
} = {}) {
  const findings = [];
  const files = listFiles(functionsRoot).filter((filePath) => extensionOf(filePath) === ".js");
  const envKeyPattern = /SIRINX_[A-Z0-9_]+/g;

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    const rel = relative(rootDir.pathname, filePath);
    const matches = new Set(source.match(envKeyPattern) || []);
    for (const key of matches) {
      if (!FUNCTION_ALLOWED_ENV_KEYS.has(key)) {
        findings.push(`pages_function_env_key_not_allowed:${rel}:${key}`);
      }
      if (SECRET_LIKE_KEY_PATTERN.test(key)) {
        findings.push(`pages_function_must_not_reference_secret_like_env:${rel}:${key}`);
      }
    }
    if (SECRET_LIKE_VALUE_PATTERN.test(source)) {
      findings.push(`pages_function_contains_secret_like_value:${rel}`);
    }
  }

  return {
    ok: findings.length === 0,
    scannedFileCount: files.length,
    allowedEnvKeys: [...FUNCTION_ALLOWED_ENV_KEYS],
    findings,
    secretValuePrinted: false
  };
}

export function inspectRuntimeEnvPresence({ env = process.env } = {}) {
  const findings = [];
  const required = [
    ...PRIVATE_RUNTIME_ENVS,
    "SIRINX_DB_SSL_MODE",
    "SIRINX_LINE_ALLOWED_RECIPIENTS",
    "SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS"
  ];
  const missing = required.filter((name) => !hasNonEmpty(env[name]));
  const flags = {
    SIRINX_EXTERNAL_SENDS_ENABLED: normalizeLower(env.SIRINX_EXTERNAL_SENDS_ENABLED || "false"),
    SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED: normalizeLower(env.SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED || "false"),
    SIRINX_ADMIN_LOCAL_DEV_BYPASS: normalizeLower(env.SIRINX_ADMIN_LOCAL_DEV_BYPASS || "false"),
    SIRINX_ALLOW_DB_MUTATION: normalizeLower(env.SIRINX_ALLOW_DB_MUTATION || "false")
  };

  if (!["require", "verify-full"].includes(String(env.SIRINX_DB_SSL_MODE || ""))) {
    findings.push("runtime_db_ssl_mode_must_be_require_or_verify_full");
  }
  if (!/^[1-9]\d{1,5}$/.test(String(env.SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS || ""))) {
    findings.push("runtime_webhook_replay_window_seconds_invalid");
  }
  for (const [name, value] of Object.entries(flags)) {
    if (value !== "false") {
      findings.push(`runtime_safe_default_must_remain_false:${name}`);
    }
  }

  return {
    ok: missing.length === 0 && findings.length === 0,
    missing,
    findings,
    privateRuntimeEnv: Object.fromEntries(
      PRIVATE_RUNTIME_ENVS.map((name) => [
        name,
        {
          present: hasNonEmpty(env[name]),
          valuePrinted: false
        }
      ])
    ),
    runtimeConfig: {
      SIRINX_DB_SSL_MODE: {
        present: hasNonEmpty(env.SIRINX_DB_SSL_MODE),
        allowed: ["require", "verify-full"].includes(String(env.SIRINX_DB_SSL_MODE || "")),
        valuePrinted: false
      },
      SIRINX_LINE_ALLOWED_RECIPIENTS: {
        present: hasNonEmpty(env.SIRINX_LINE_ALLOWED_RECIPIENTS),
        valuePrinted: false
      },
      SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS: {
        present: hasNonEmpty(env.SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS),
        valid: /^[1-9]\d{1,5}$/.test(String(env.SIRINX_WEBHOOK_REPLAY_WINDOW_SECONDS || "")),
        valuePrinted: false
      }
    },
    safeDefaultFlags: Object.fromEntries(
      Object.entries(flags).map(([name, value]) => [
        name,
        {
          present: hasNonEmpty(env[name]),
          requiredValue: "false",
          compliant: value === "false",
          valuePrinted: false
        }
      ])
    ),
    secretValuePrinted: false
  };
}

export function validateRuntimeEnvContractReport(report) {
  const findings = [];
  const serialized = JSON.stringify(report);

  if (!report.guardrail.includes("secret values are never printed")) {
    findings.push("secret_value_print_guardrail_regressed");
  }
  if (
    report.wrangler.secretValuePrinted !== false
    || report.envExample.secretValuePrinted !== false
    || report.publicStatic.secretValuePrinted !== false
    || report.functions.secretValuePrinted !== false
    || report.runtime.secretValuePrinted !== false
  ) {
    findings.push("secret_value_print_flag_regressed");
  }
  for (const forbidden of ["very-secret-password", "admin-secret-token", "line-secret-that-must-not-print", "meta-secret-that-must-not-print"]) {
    if (serialized.includes(forbidden)) {
      findings.push(`secret_value_leaked:${forbidden}`);
    }
  }
  if (report.contractReady !== (report.wrangler.ok && report.envExample.ok && report.publicStatic.ok && report.functions.ok)) {
    findings.push("contract_ready_mismatch");
  }
  if (report.runtimeReady !== report.runtime.ok) {
    findings.push("runtime_ready_mismatch");
  }
  if (report.productionReady !== (report.contractReady && report.runtimeReady)) {
    findings.push("production_ready_mismatch");
  }

  return {
    ok: findings.length === 0,
    findings
  };
}

function listFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const current = typeof root === "string" ? root : root.pathname;
  const result = [];
  for (const entry of readdirSync(current)) {
    const filePath = join(current, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      result.push(...listFiles(filePath));
    } else if (stat.isFile()) {
      result.push(filePath);
    }
  }
  return result;
}

function extensionOf(filePath) {
  const match = String(filePath).match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function parseEnvExample(source) {
  return String(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      if (index === -1) {
        return {
          name: line,
          value: ""
        };
      }
      return {
        name: line.slice(0, index).trim(),
        value: line.slice(index + 1).trim()
      };
    });
}

function parseJsonc(source) {
  return JSON.parse(stripJsonc(source));
}

function stripJsonc(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,\s*([}\]])/g, "$1");
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
