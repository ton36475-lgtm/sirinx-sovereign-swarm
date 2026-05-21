import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = new URL("../infra/supabase/migrations", import.meta.url);

export function validateMigrationFiles() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const findings = [];

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR.pathname, file), "utf8");
    if (/service_role|anon|authenticated/i.test(sql) && !/enable row level security/i.test(sql)) {
      findings.push(`${file}: grants/policies mention API roles without enabling RLS`);
    }
    if (/create\s+view/i.test(sql) && !/security_invoker\s*=\s*true/i.test(sql)) {
      findings.push(`${file}: views must use security_invoker=true or stay outside exposed schema`);
    }
    if (/security\s+definer/i.test(sql) && /schema\s+public|public\./i.test(sql)) {
      findings.push(`${file}: security definer functions must not be in exposed public schema`);
    }
  }

  const hasRlsMigration = files.some((file) => /rls|policy/i.test(file));
  if (!hasRlsMigration) {
    findings.push("missing RLS/policy migration");
  }

  return {
    ok: findings.length === 0,
    files,
    findings
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateMigrationFiles();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}
