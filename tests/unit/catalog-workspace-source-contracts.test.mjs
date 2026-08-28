import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeCatalogSourceFacetsResponse,
  collectCatalogSourceExportPages,
} from "../../src/features/catalogWorkspace/contracts.ts";

const PERSON_ID = "aaaaaaaa-1111-4111-8111-111111111111";

test("Source facet decoder accepts the exact counted server vocabulary", () => {
  const result = decodeCatalogSourceFacetsResponse({
    ok: true,
    departments: [{ value: "QA", count: 3 }],
    areas: [{ value: "A1", count: 2 }],
    owners: [{ value: "owner:nguyễn an", person_id: PERSON_ID, name: "Nguyễn An", count: 1 }],
    validation: [{ value: "outside", count: 1 }, { value: "validated", count: 2 }],
    first_month: [{ value: "missing", count: 1 }, { value: "present", count: 2 }],
    ownership: [{ value: "assigned", count: 2 }, { value: "unassigned", count: 1 }],
    frequency: [{ value: "gt12", count: 1 }, { value: "lte12", count: 2 }],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.owners[0], {
    value: "owner:nguyễn an", personId: PERSON_ID, name: "Nguyễn An", count: 1,
  });
  assert.equal(result.validation.find((item) => item.value === "validated")?.count, 2);
});

test("Source facet decoder rejects extra keys, invalid enums and malformed counts", () => {
  const base = {
    ok: true,
    departments: [], areas: [], owners: [],
    validation: [{ value: "outside", count: 0 }, { value: "validated", count: 0 }],
    first_month: [{ value: "missing", count: 0 }, { value: "present", count: 0 }],
    ownership: [{ value: "assigned", count: 0 }, { value: "unassigned", count: 0 }],
    frequency: [{ value: "gt12", count: 0 }, { value: "lte12", count: 0 }],
  };
  assert.throws(() => decodeCatalogSourceFacetsResponse({ ...base, leaked: [] }), /exact/i);
  assert.throws(() => decodeCatalogSourceFacetsResponse({
    ...base, validation: [{ value: "all", count: 0 }],
  }), /validation/i);
  assert.throws(() => decodeCatalogSourceFacetsResponse({
    ...base, departments: [{ value: "QA", count: -1 }],
  }), /count/i);
  assert.deepEqual(decodeCatalogSourceFacetsResponse({
    ok: false, error_code: "INVALID_FILTERS", error: "Bộ lọc sai",
  }), { ok: false, errorCode: "INVALID_FILTERS", error: "Bộ lọc sai" });
});

test("paged Source export aggregates every authorized page once and stops at null cursor", async () => {
  const calls = [];
  const rows = await collectCatalogSourceExportPages(async (cursor) => {
    calls.push(cursor);
    if (cursor === null) return {
      ok: true,
      rows: [{ objectCode: "TB-001" }, { objectCode: "TB-002" }],
      authorizedTotal: 3,
      nextCursor: { objectCode: "TB-002", id: "bbbbbbbb-2222-4222-8222-222222222222" },
    };
    return {
      ok: true,
      rows: [{ objectCode: "TB-003" }],
      authorizedTotal: 3,
      nextCursor: null,
    };
  });
  assert.deepEqual(rows.map((row) => row.objectCode), ["TB-001", "TB-002", "TB-003"]);
  assert.equal(calls.length, 2);
});

test("paged Source export fails closed on repeated cursor or inconsistent total", async () => {
  const cursor = { objectCode: "TB-001", id: "cccccccc-3333-4333-8333-333333333333" };
  await assert.rejects(() => collectCatalogSourceExportPages(async () => ({
    ok: true, rows: [{ objectCode: "TB-001" }], authorizedTotal: 2, nextCursor: cursor,
  })), /cursor/i);

  let page = 0;
  await assert.rejects(() => collectCatalogSourceExportPages(async () => {
    page += 1;
    return page === 1
      ? { ok: true, rows: [{ objectCode: "TB-001" }], authorizedTotal: 2, nextCursor: cursor }
      : { ok: true, rows: [{ objectCode: "TB-002" }], authorizedTotal: 3, nextCursor: null };
  }), /total/i);
});
