import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("release scripts expose the Source DB and browser gates", async () => {
  const pkg = JSON.parse(await read("package.json"));

  assert.equal(pkg.scripts["test:db:source-access"],
    "bash scripts/run-source-qa-workshop-access-db-tests.sh");
  assert.equal(pkg.scripts["e2e:source-access"],
    "node tests/e2e/source-qa-workshop-access.mjs");
});

test("GitHub release verifies sealed PG17 evidence and Source E2E before build", async () => {
  const workflow = await read(".github/workflows/deploy.yml");

  assert.match(workflow, /^  source-access-db-contract:\n/m);
  assert.match(workflow, /node scripts\/verify-source-access-db-evidence\.mjs/);
  assert.match(workflow, /npm run e2e:source-access/);
  assert.match(workflow,
    /production-build:[\s\S]*?needs:[\s\S]*?- source-access-db-contract/);
});

test("sealed DB verifier pins every executable Source authorization input", async () => {
  const { verifySourceAccessDbEvidence } = await import(
    "../../scripts/verify-source-access-db-evidence.mjs"
  );
  const result = await verifySourceAccessDbEvidence();

  assert.equal(result.engine, "PostgreSQL 17");
  assert.equal(result.status, "passed");
  assert.equal(result.protectedFileCount, 17);
  assert.equal(result.coreDbFileCount, 14);
  assert.equal(result.releaseArtifactFileCount, 3);
  assert.equal(result.outputSha256,
    "df2fec3fda4c20e3885f2090b7b778de4e542dc8f8c901a3eeba6810229e8657");
});

test("GitHub production build checks out the event SHA explicitly", async () => {
  const workflow = await read(".github/workflows/deploy.yml");

  assert.match(workflow, /production-build:[\s\S]*?uses: actions\/checkout@v4\n\s+with:\n\s+ref: \$\{\{ github\.sha \}\}/);
});

async function makeEvidenceFixture() {
  const { verifySourceAccessDbEvidence } = await import(
    "../../scripts/verify-source-access-db-evidence.mjs"
  );
  const root = await mkdtemp(join(tmpdir(), "vmp-source-access-evidence-"));
  const evidence = JSON.parse(await read("tests/evidence/source-access-db-pg17.json"));

  for (const relativePath of [
    ...Object.keys(evidence.files),
    ...Object.keys(evidence.releaseArtifactFiles),
  ]) {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(new URL(`../../${relativePath}`, import.meta.url), target);
  }

  const evidencePath = "evidence.json";
  await writeFile(join(root, evidencePath), JSON.stringify(evidence));
  return {
    root,
    evidence,
    verify: () => verifySourceAccessDbEvidence({ repoDir: root, evidencePath }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("sealed DB verifier rejects stale protected inputs", async () => {
  const fixture = await makeEvidenceFixture();
  try {
    const protectedPath = Object.keys(fixture.evidence.files)[0];
    await writeFile(join(fixture.root, protectedPath), "tampered\n");
    await assert.rejects(fixture.verify(), /stale Source access DB evidence/);
  } finally {
    await fixture.cleanup();
  }
});

test("sealed release integrity rejects stale checker and recovery artifacts", async () => {
  const evidence = JSON.parse(await read("tests/evidence/source-access-db-pg17.json"));

  for (const relativePath of Object.keys(evidence.releaseArtifactFiles)) {
    const fixture = await makeEvidenceFixture();
    try {
      await writeFile(join(fixture.root, relativePath), "tampered release artifact\n");
      await assert.rejects(
        fixture.verify(),
        new RegExp(`stale Source access release-artifact integrity: ${relativePath.replaceAll(".", "\\.")}`),
      );
    } finally {
      await fixture.cleanup();
    }
  }
});

test("sealed DB verifier rejects malformed evidence and incomplete phases", async () => {
  const malformed = await makeEvidenceFixture();
  try {
    await writeFile(join(malformed.root, "evidence.json"), "not-json");
    await assert.rejects(malformed.verify(), /invalid JSON|Unexpected token/);
  } finally {
    await malformed.cleanup();
  }

  const incomplete = await makeEvidenceFixture();
  try {
    incomplete.evidence.phases = ["expand"];
    await writeFile(join(incomplete.root, "evidence.json"), JSON.stringify(incomplete.evidence));
    await assert.rejects(incomplete.verify(), /incomplete Source access DB phase evidence/);
  } finally {
    await incomplete.cleanup();
  }
});

test("sealed DB verifier rejects receipt metadata outside the reviewed contract", async () => {
  const mutations = [
    ["postgresVersion", "17.5"],
    ["completedAt", "not-an-iso-timestamp"],
    ["topLevelAssertions", 74],
    ["cloneSurvivors", 1],
    ["outputSha256", "A".repeat(64)],
  ];

  for (const [field, value] of mutations) {
    const fixture = await makeEvidenceFixture();
    try {
      fixture.evidence[field] = value;
      await writeFile(join(fixture.root, "evidence.json"), JSON.stringify(fixture.evidence));
      await assert.rejects(fixture.verify(), /invalid Source access DB(?: evidence contract| output digest)/);
    } finally {
      await fixture.cleanup();
    }
  }
});

test("sealed DB verifier rejects an evidence symlink", async () => {
  const fixture = await makeEvidenceFixture();
  try {
    const realEvidence = join(fixture.root, "real-evidence.json");
    await writeFile(realEvidence, JSON.stringify(fixture.evidence));
    await rm(join(fixture.root, "evidence.json"));
    await symlink("real-evidence.json", join(fixture.root, "evidence.json"));
    assert.equal(await readlink(join(fixture.root, "evidence.json")), "real-evidence.json");
    await assert.rejects(fixture.verify(), /unsafe evidence file/);
  } finally {
    await fixture.cleanup();
  }
});
