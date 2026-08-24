import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function makeFakeBin({ statusDbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vmp-five-role-harness-"));
  const fakeBin = join(root, "bin");
  const psqlMarker = join(root, "psql-args.txt");
  const dockerMarker = join(root, "docker-args.txt");
  const psql = join(fakeBin, "psql");
  const docker = join(fakeBin, "docker");
  const pgDump = join(fakeBin, "pg_dump");
  const supabase = join(fakeBin, "supabase");

  mkdirSync(fakeBin);
  writeFileSync(psql, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" >> \"$PSQL_MARKER\"\nprintf 'PGHOST=%s\\nPGPORT=%s\\nPGUSER=%s\\nPGDATABASE=%s\\nPGSERVICE=%s\\nPGSERVICEFILE=%s\\nPGHOSTADDR=%s\\nPGOPTIONS=%s\\n' \"${PGHOST:-}\" \"${PGPORT:-}\" \"${PGUSER:-}\" \"${PGDATABASE:-}\" \"${PGSERVICE:-}\" \"${PGSERVICEFILE:-}\" \"${PGHOSTADDR:-}\" \"${PGOPTIONS:-}\" >> \"$PSQL_MARKER\"\nprintf '%s\\n' 'PSQL_NOISE'\nfor ((i = 1; i <= $#; i++)); do\n  if [[ \"${!i}\" == -f ]]; then\n    next=$((i + 1))\n    if [[ -f \"${!next}\" ]]; then\n      printf 'FILE_CONTENT\\n' >> \"$PSQL_MARKER\"\n      cat \"${!next}\" >> \"$PSQL_MARKER\"\n    fi\n  fi\ndone\n");
  writeFileSync(docker, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$DOCKER_MARKER\"\nfor ((i = 1; i <= $#; i++)); do\n  if [[ \"${!i}\" == -v ]]; then\n    next=$((i + 1))\n    mount=\"${!next}\"\n    printf '%s\\n' 'ALTER DEFAULT PRIVILEGES FOR ROLE production_owner GRANT ALL ON TABLES TO authenticated;' > \"${mount%:/out}/schema.sql\"\n  fi\ndone\n");
  writeFileSync(pgDump, "#!/usr/bin/env bash\nexit 0\n");
  writeFileSync(supabase, `#!/usr/bin/env bash\nif [[ \"$1\" == start ]]; then\n  printf '%s\\n' 'SECRET_KEY=must-not-reach-stdout'\nelif [[ \"$1\" == status ]]; then\n  printf '%s\\n' 'SUPABASE_NOISE' >&2\n  printf '%s\\n' ${JSON.stringify(`DB_URL=${statusDbUrl}`)}\nfi\n`);
  chmodSync(psql, 0o755);
  chmodSync(docker, 0o755);
  chmodSync(pgDump, 0o755);
  chmodSync(supabase, 0o755);

  return { dockerMarker, fakeBin, psqlMarker, root };
}

test("prepare script rejects a missing production database URL", () => {
  const missing = spawnSync("bash", ["scripts/prepare-five-role-test-db.sh"], {
    env: { ...process.env, SUPABASE_DB_URL: "" },
    encoding: "utf8",
  });

  assert.equal(missing.status, 2);
});

test("prepare script clones only with the pinned PostgreSQL 17 container client", () => {
  const { dockerMarker, fakeBin, psqlMarker, root } = makeFakeBin();

  try {
    const prepared = spawnSync("bash", ["scripts/prepare-five-role-test-db.sh"], {
      env: {
        ...process.env,
        SUPABASE_DB_URL: "postgresql://u:p@source.example/prod",
        PATH: `${fakeBin}:${process.env.PATH}`,
        DOCKER_MARKER: dockerMarker,
        PSQL_MARKER: psqlMarker,
        PGSERVICE: "production",
        PGSERVICEFILE: "/tmp/production-service.conf",
        PGHOSTADDR: "203.0.113.10",
        PGOPTIONS: "-c search_path=unsafe",
      },
      encoding: "utf8",
    });

    assert.equal(prepared.status, 0);
    assert.doesNotMatch(prepared.stdout, /SECRET_KEY|must-not-reach-stdout/);
    assert.doesNotMatch(prepared.stdout, /PSQL_NOISE/);
    assert.doesNotMatch(`${prepared.stdout}${prepared.stderr}`, /SUPABASE_NOISE/);
    const dockerArgs = readFileSync(dockerMarker, "utf8");
    const psqlArgs = readFileSync(psqlMarker, "utf8");
    assert.match(dockerArgs, /postgres:17/);
    assert.match(dockerArgs, /--schema-only/);
    assert.doesNotMatch(dockerArgs, /SOURCE_DB_URL/);
    assert.match(psqlArgs, /drop schema public cascade/i);
    assert.doesNotMatch(psqlArgs, /create schema public/i);
    assert.match(psqlArgs, /create extension if not exists vector with schema extensions/i);
    assert.match(psqlArgs, /create extension if not exists unaccent with schema extensions/i);
    assert.match(psqlArgs, /create extension if not exists pg_trgm with schema extensions/i);
    assert.doesNotMatch(psqlArgs, /ALTER DEFAULT PRIVILEGES/);
    assert.doesNotMatch(psqlArgs, /postgresql:\/\//);
    assert.match(psqlArgs, /PGHOST=127\.0\.0\.1/);
    assert.match(psqlArgs, /PGPORT=54322/);
    assert.match(psqlArgs, /PGUSER=postgres/);
    assert.match(psqlArgs, /PGDATABASE=postgres/);
    assert.match(psqlArgs, /PGSERVICE=$/m);
    assert.match(psqlArgs, /PGSERVICEFILE=$/m);
    assert.match(psqlArgs, /PGHOSTADDR=$/m);
    assert.match(psqlArgs, /PGOPTIONS=$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepare script refuses non-local and query-override status targets before destructive psql", () => {
  const unsafeTargets = [
    "postgresql://postgres:postgres@source.example/prod",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=production.example",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=203.0.113.10",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?port=6543",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?dbname=production",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres?service=production",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres#production",
  ];

  for (const statusDbUrl of unsafeTargets) {
    const { fakeBin, psqlMarker, root } = makeFakeBin({ statusDbUrl });

    try {
      const unsafe = spawnSync("bash", ["scripts/prepare-five-role-test-db.sh"], {
        env: {
          ...process.env,
          SUPABASE_DB_URL: "postgresql://u:p@source.example/prod",
          PATH: `${fakeBin}:${process.env.PATH}`,
          PSQL_MARKER: psqlMarker,
        },
        encoding: "utf8",
      });

      assert.equal(unsafe.status, 3, statusDbUrl);
      assert.equal(existsSync(psqlMarker), false, statusDbUrl);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("runner refuses unsafe targets before psql", () => {
  const unsafeTargets = [
    "postgresql://u:p@prod.example/prod",
    "postgresql://u:p@remote.example:54322/postgres",
    "postgresql://u:p@127.0.0.1/postgres",
    "postgresql://u:p@127.0.0.1:54323/postgres",
    "postgresql://u:p@127.0.0.1:54322/not-postgres",
    "postgresql://u:p@127.0.0.1:54322/postgres?host=production.example",
    "postgresql://u:p@127.0.0.1:54322/postgres?hostaddr=203.0.113.10",
    "postgresql://u:p@127.0.0.1:54322/postgres?port=6543",
    "postgresql://u:p@127.0.0.1:54322/postgres?dbname=production",
    "postgresql://u:p@127.0.0.1:54322/postgres?service=production",
    "postgresql://u:p@127.0.0.1:54322/postgres#production",
  ];

  for (const VMP_TEST_DB_URL of unsafeTargets) {
    const { fakeBin, psqlMarker, root } = makeFakeBin();

    try {
      const unsafe = spawnSync("bash", ["scripts/run-five-role-db-tests.sh"], {
        env: {
          ...process.env,
          SUPABASE_DB_URL: "postgresql://u:p@prod.example/prod",
          VMP_TEST_DB_URL,
          PATH: `${fakeBin}:${process.env.PATH}`,
          PSQL_MARKER: psqlMarker,
        },
        encoding: "utf8",
      });

      assert.equal(unsafe.status, 3, VMP_TEST_DB_URL);
      assert.equal(existsSync(psqlMarker), false, VMP_TEST_DB_URL);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("runner invokes psql with the five-role SQL suite for an isolated target", () => {
  const { fakeBin, psqlMarker, root } = makeFakeBin();

  try {
    const isolated = spawnSync("bash", ["scripts/run-five-role-db-tests.sh"], {
      env: {
        ...process.env,
        SUPABASE_DB_URL: "postgresql://u:p@prod.example/prod",
        VMP_TEST_DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        PATH: `${fakeBin}:${process.env.PATH}`,
        PSQL_MARKER: psqlMarker,
        PGSERVICE: "production",
        PGSERVICEFILE: "/tmp/production-service.conf",
        PGHOSTADDR: "203.0.113.10",
        PGOPTIONS: "-c search_path=unsafe",
      },
      encoding: "utf8",
    });

    assert.equal(isolated.status, 0);
    const psqlArgs = readFileSync(psqlMarker, "utf8");
    assert.match(psqlArgs, /tests\/sql\/five-role-hardening\.sql/);
    assert.doesNotMatch(psqlArgs, /postgresql:\/\//);
    assert.match(psqlArgs, /PGHOST=127\.0\.0\.1/);
    assert.match(psqlArgs, /PGPORT=54322/);
    assert.match(psqlArgs, /PGUSER=postgres/);
    assert.match(psqlArgs, /PGDATABASE=postgres/);
    assert.match(psqlArgs, /PGSERVICE=$/m);
    assert.match(psqlArgs, /PGSERVICEFILE=$/m);
    assert.match(psqlArgs, /PGHOSTADDR=$/m);
    assert.match(psqlArgs, /PGOPTIONS=$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
