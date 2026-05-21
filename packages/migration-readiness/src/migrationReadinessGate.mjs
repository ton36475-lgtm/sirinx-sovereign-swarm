import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inspectDbEnv } from "../../lead-core/src/dbEnvGate.mjs";
import { validateMigrationFiles } from "../../../scripts/validate-migrations.mjs";

const DEFAULT_MIGRATIONS_DIR = new URL("../../../infra/supabase/migrations", import.meta.url);
const DEFAULT_ROLLBACK_DIR = new URL("../../../infra/supabase/rollback", import.meta.url);
const ALLOWED_DRY_RUN_MODES = ["validate-only", "local", "staging"];

export function buildMigrationReadinessReport({
  env = process.env,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  rollbackDir = DEFAULT_ROLLBACK_DIR
} = {}) {
  const db = inspectDbEnv(env);
  const dryRun = inspectMigrationDryRunEnv(env);
  const migrationValidation = validateMigrationFiles();
  const plan = inspectMigrationPlan({ migrationsDir, rollbackDir });
  const productionReady = db.productionReady
    && dryRun.mode !== "validate-only"
    && dryRun.mutationExplicitlyAllowed
    && migrationValidation.ok
    && plan.ok;

  return {
    status: productionReady ? "ready" : "blocked",
    productionReady,
    db,
    dryRun,
    migrations: migrationValidation,
    plan,
    commandPlan: buildCommandPlan({ dryRun }),
    guardrail: "no database connection attempted; no database URL, password, or secret printed"
  };
}

export function inspectMigrationDryRunEnv(env = process.env) {
  const mode = String(env.SIRINX_DB_DRY_RUN_MODE || "validate-only").trim().toLowerCase();
  const modeAllowed = ALLOWED_DRY_RUN_MODES.includes(mode);
  const mutationExplicitlyAllowed = String(env.SIRINX_ALLOW_DB_MUTATION || "").trim().toLowerCase() === "true";
  const missing = [];

  if (!modeAllowed) {
    missing.push("SIRINX_DB_DRY_RUN_MODE");
  }
  if (mode === "validate-only") {
    missing.push("SIRINX_DB_DRY_RUN_MODE=local_or_staging");
  }
  if (mode !== "validate-only" && !mutationExplicitlyAllowed) {
    missing.push("SIRINX_ALLOW_DB_MUTATION=true");
  }

  return {
    mode,
    modeAllowed,
    mutationExplicitlyAllowed,
    wouldRunDatabaseMutation: mode !== "validate-only" && mutationExplicitlyAllowed,
    allowedModes: ALLOWED_DRY_RUN_MODES,
    missing,
    valuePrinted: false
  };
}

export function inspectMigrationPlan({
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  rollbackDir = DEFAULT_ROLLBACK_DIR
} = {}) {
  const migrations = listSqlFiles(migrationsDir);
  const rollbacks = listSqlFiles(rollbackDir);
  const findings = [];
  const previous = { number: 0 };
  const rows = migrations.map((file) => {
    const parsed = parseMigrationFileName(file);
    if (!parsed) {
      findings.push(`${file}: migration filename must start with a three digit sequence`);
      return {
        file,
        number: null,
        rollbackFile: null,
        rollbackPresent: false,
        baseMigration: false
      };
    }

    if (parsed.number !== previous.number + 1) {
      findings.push(`${file}: migration sequence gap or duplicate after ${String(previous.number).padStart(3, "0")}`);
    }
    previous.number = parsed.number;

    const rollbackFile = `${String(parsed.number).padStart(3, "0")}_${parsed.slug}.rollback.sql`;
    const baseMigration = parsed.number === 1;
    const rollbackPresent = rollbacks.includes(rollbackFile);
    if (!baseMigration && !rollbackPresent) {
      findings.push(`${file}: rollback file missing (${rollbackFile})`);
    }

    const sql = readFileSync(join(migrationsDir.pathname, file), "utf8");
    if (/drop\s+database|truncate\s+table|delete\s+from\s+leads/i.test(sql)) {
      findings.push(`${file}: destructive SQL must not appear in forward migrations`);
    }
    if (/grant\s+.*\s+to\s+(anon|authenticated)/i.test(sql)) {
      findings.push(`${file}: direct anon/authenticated grant requires explicit review`);
    }

    return {
      file,
      number: parsed.number,
      slug: parsed.slug,
      rollbackFile: rollbackPresent ? rollbackFile : null,
      rollbackPresent,
      baseMigration
    };
  });

  return {
    ok: findings.length === 0,
    latest: rows.at(-1)?.file || null,
    migrationCount: rows.length,
    rollbackCount: rollbacks.length,
    rows,
    findings
  };
}

export function buildCommandPlan({ dryRun }) {
  const commands = [
    "npm run db:preflight",
    "npm run migration:readiness"
  ];

  if (dryRun.mode === "local") {
    commands.push("supabase migration list --local");
    commands.push("supabase db reset --local");
  }

  if (dryRun.mode === "staging") {
    commands.push("supabase migration list --linked");
    commands.push("supabase db push --dry-run");
  }

  return {
    commands,
    valuesPrinted: false,
    executed: false,
    note: "Commands are advisory until explicit database mutation is enabled in a local/staging target."
  };
}

function listSqlFiles(dirUrl) {
  return readdirSync(dirUrl)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function parseMigrationFileName(file) {
  const match = file.match(/^(\d{3})_(.+)\.sql$/);
  if (!match) {
    return null;
  }
  return {
    number: Number(match[1]),
    slug: match[2]
  };
}
