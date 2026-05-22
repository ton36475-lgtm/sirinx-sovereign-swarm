import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { buildWorkflowPipelineReport } from "../../workflow-pipeline/src/workflowPipelineMap.mjs";
import { buildStagingNetworkSmokePlan } from "./stagingNetworkSmoke.mjs";

const DEFAULT_ROOT = new URL("../../../", import.meta.url);
const DEFAULT_WRANGLER_PATH = new URL("../../../wrangler.jsonc", import.meta.url);
const DEFAULT_PROXY_PATH = new URL("../../../functions/api/[[path]].js", import.meta.url);
const DEFAULT_ROUTES_PATH = new URL("../../../apps/www/static/_routes.json", import.meta.url);
const SECRET_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|DATABASE_URL|API_KEY)$/i;
const REQUIRED_PUBLIC_VARS = [
  "SIRINX_API_HOSTING_STRATEGY",
  "SIRINX_API_ORIGIN",
  "SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED",
  "SIRINX_EXTERNAL_SENDS_ENABLED"
];

export function buildDeployReadinessReport({
  env = process.env,
  rootDir = DEFAULT_ROOT,
  wranglerPath = DEFAULT_WRANGLER_PATH,
  proxyPath = DEFAULT_PROXY_PATH,
  routesPath = DEFAULT_ROUTES_PATH
} = {}) {
  const wrangler = inspectWranglerConfig({
    rootDir,
    wranglerPath
  });
  const apiProxy = inspectApiProxy({
    proxyPath
  });
  const pagesRoutes = inspectPagesRoutes({
    routesPath
  });
  const networkSmoke = buildStagingNetworkSmokePlan({ env });
  const workflow = buildWorkflowPipelineReport({ env });
  const configReady = wrangler.ok && apiProxy.ok && pagesRoutes.ok;
  const productionReady = configReady
    && networkSmoke.ready
    && workflow.productionReady;
  const blockers = [
    ...wrangler.findings,
    ...apiProxy.findings,
    ...pagesRoutes.findings,
    ...networkSmoke.missing,
    ...workflow.blockedComponents.map((component) => `workflow_blocked:${component}`)
  ];
  const report = {
    system: "SIRINX Sovereign Agentic Swarm v2.1",
    report_version: "deploy-readiness-1",
    status: productionReady ? "ready" : "blocked",
    productionReady,
    configReady,
    hostingStrategy: wrangler.hostingStrategy,
    wrangler,
    apiProxy,
    pagesRoutes,
    networkSmoke,
    workflow: {
      status: workflow.status,
      productionReady: workflow.productionReady,
      blockedComponents: workflow.blockedComponents,
      invariants: workflow.invariants
    },
    blockers,
    guardrail: "read-only deploy readiness; no deploy, no external write, no secret values printed"
  };
  return {
    ...report,
    validation: validateDeployReadinessReport(report)
  };
}

export function inspectWranglerConfig({
  rootDir = DEFAULT_ROOT,
  wranglerPath = DEFAULT_WRANGLER_PATH
} = {}) {
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

  const projectName = config.name || null;
  if (!/^[a-z0-9-]+$/.test(String(projectName || ""))) {
    findings.push("wrangler_name_invalid");
  }

  const outputDir = config.pages_build_output_dir || null;
  const outputDirPath = outputDir ? resolve(rootDir.pathname, outputDir) : null;
  if (!outputDir) {
    findings.push("pages_build_output_dir_missing");
  } else if (!existsSync(outputDirPath) || !statSync(outputDirPath).isDirectory()) {
    findings.push("pages_build_output_dir_not_found");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(config.compatibility_date || ""))) {
    findings.push("compatibility_date_missing_or_invalid");
  }

  const vars = config.vars && typeof config.vars === "object" ? config.vars : {};
  for (const key of REQUIRED_PUBLIC_VARS) {
    if (!hasNonEmpty(vars[key])) {
      findings.push(`wrangler_var_missing:${key}`);
    }
  }

  const secretVarKeys = Object.keys(vars).filter((key) => SECRET_KEY_PATTERN.test(key));
  for (const key of secretVarKeys) {
    findings.push(`secret_like_key_must_not_be_in_vars:${key}`);
  }

  const originDecision = validatePublicApiOrigin(vars.SIRINX_API_ORIGIN);
  if (!originDecision.ok) {
    findings.push(`api_origin_invalid:${originDecision.reason}`);
  }

  const strategy = vars.SIRINX_API_HOSTING_STRATEGY || null;
  if (strategy !== "node-backend-origin") {
    findings.push("api_hosting_strategy_must_be_node_backend_origin");
  }

  if (vars.SIRINX_SOCIAL_WEBHOOK_PROCESSING_ENABLED !== "false") {
    findings.push("social_webhook_processing_must_remain_false_in_config");
  }
  if (vars.SIRINX_EXTERNAL_SENDS_ENABLED !== "false") {
    findings.push("external_sends_must_remain_false_in_config");
  }

  return {
    ok: findings.length === 0,
    present: true,
    name: projectName,
    pagesBuildOutputDir: outputDir,
    pagesBuildOutputDirExists: Boolean(outputDirPath && existsSync(outputDirPath)),
    compatibilityDate: config.compatibility_date || null,
    hostingStrategy: strategy,
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

export function inspectApiProxy({ proxyPath = DEFAULT_PROXY_PATH } = {}) {
  const findings = [];
  if (!existsSync(proxyPath)) {
    return {
      ok: false,
      present: false,
      findings: ["pages_api_proxy_missing"],
      secretValuePrinted: false
    };
  }

  const source = readFileSync(proxyPath, "utf8");
  for (const expected of [
    "SIRINX_API_ORIGIN",
    "validateApiOrigin",
    "buildApiProxyTargetUrl",
    "fetch(proxiedRequest)"
  ]) {
    if (!source.includes(expected)) {
      findings.push(`api_proxy_missing:${expected}`);
    }
  }
  if (/SIRINX_(LINE|META|ADMIN).*SECRET|SIRINX_DATABASE_URL|SERVICE_ROLE/i.test(source)) {
    findings.push("api_proxy_must_not_reference_private_secret_env");
  }

  return {
    ok: findings.length === 0,
    present: true,
    path: "functions/api/[[path]].js",
    findings,
    secretValuePrinted: false
  };
}

export function inspectPagesRoutes({ routesPath = DEFAULT_ROUTES_PATH } = {}) {
  const findings = [];
  if (!existsSync(routesPath)) {
    return {
      ok: false,
      present: false,
      path: "apps/www/static/_routes.json",
      findings: ["pages_routes_json_missing"],
      secretValuePrinted: false
    };
  }

  let config;
  try {
    config = JSON.parse(readFileSync(routesPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      present: true,
      path: "apps/www/static/_routes.json",
      findings: [`pages_routes_json_parse_failed:${error.message}`],
      secretValuePrinted: false
    };
  }

  const include = Array.isArray(config.include) ? config.include : [];
  const exclude = Array.isArray(config.exclude) ? config.exclude : [];
  if (config.version !== 1) {
    findings.push("pages_routes_version_must_be_1");
  }
  if (!include.includes("/api/*")) {
    findings.push("pages_routes_must_include_api_wildcard");
  }
  if (include.includes("/*")) {
    findings.push("pages_routes_must_not_invoke_all_routes");
  }
  if (exclude.includes("/api/*") || exclude.includes("/*")) {
    findings.push("pages_routes_must_not_exclude_api_wildcard");
  }

  return {
    ok: findings.length === 0,
    present: true,
    path: "apps/www/static/_routes.json",
    version: config.version,
    include,
    exclude,
    findings,
    secretValuePrinted: false
  };
}

export function validateDeployReadinessReport(report) {
  const findings = [];
  if (report.guardrail.includes("secret values printed") && !report.guardrail.includes("no secret values printed")) {
    findings.push("secret_guardrail_text_invalid");
  }
  if (report.workflow.invariants.externalWritesPerformedByReport !== false) {
    findings.push("workflow_report_external_write_regressed");
  }
  if (
    report.wrangler.secretValuePrinted !== false
    || report.apiProxy.secretValuePrinted !== false
    || report.pagesRoutes.secretValuePrinted !== false
  ) {
    findings.push("secret_value_print_regressed");
  }
  if (report.configReady !== (report.wrangler.ok && report.apiProxy.ok && report.pagesRoutes.ok)) {
    findings.push("config_ready_mismatch");
  }
  return {
    ok: findings.length === 0,
    findings
  };
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

function validatePublicApiOrigin(value) {
  if (!hasNonEmpty(value)) {
    return {
      ok: false,
      reason: "missing"
    };
  }
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return {
      ok: false,
      reason: "invalid_url"
    };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "must_be_https"
    };
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return {
      ok: false,
      reason: "must_be_origin_only_without_credentials"
    };
  }
  return {
    ok: true,
    reason: "valid"
  };
}

function hasNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
