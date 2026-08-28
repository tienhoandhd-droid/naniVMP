import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOG_OBJECT_FILTERS_ALL,
  activeCatalogObjectFilterChips,
  catalogWorkspaceRegionIds,
  catalogObjectFilterOptions,
  encodeCatalogObjectServerFilters,
  filterCatalogObjects,
  initialCatalogSourceCursorStack,
  moveCatalogSourceCursorBack,
  moveCatalogSourceCursorForward,
  resolveCatalogSourceCursorPage,
} from "../../src/features/catalogWorkspace/catalogWorkspaceFilterModel.ts";

const rows = [
  {
    id: "obj-1", object_code: "TB-100", object_name: "  Máy Dập  ",
    department: " QA ", area_code: " A1 ", line: "L1", owner_name: " Nguyễn An ",
    report_class: "A", work_group: "Đóng gói", note: "Theo dõi nhiệt độ", validate_flag: "y",
    first_month: 3, frequency_months: 12, object_kind: "Thiết bị", is_active: true,
  },
  {
    id: "obj-2", object_code: "TB-200", object_name: "Nồi hấp", department: "qa", area_code: "A2",
    line: null, owner_name: null, report_class: "B", work_group: "Tiệt trùng", note: "Không có owner",
    validate_flag: "n", first_month: null, frequency_months: 24, object_kind: "Thiết bị", is_active: true,
  },
  {
    id: "obj-3", object_code: "QT-300", object_name: "Quy trình vệ sinh", department: "XSX", area_code: "A1",
    line: "L2", owner_name: "Trần Bình", report_class: null, work_group: null, note: "Ghi chú đặc biệt",
    validate_flag: "Y", first_month: 1, frequency_months: 6, object_kind: "Quy trình", is_active: true,
  },
];

test("filter conjunction normalizes text and includes owner_name plus note", () => {
  const result = filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL,
    text: "  nguyỄn an ",
    department: "qa",
    area: "a1",
    validation: "validated",
    firstMonth: "present",
    owner: "assigned",
    frequency: "lte12",
  });
  assert.deepEqual(result.map((row) => row.object_code), ["TB-100"]);

  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, text: "ghi chú ĐẶC biệt",
  }).map((row) => row.object_code), ["QT-300"]);
});

test("validation, first month, owner and frequency categories use their exact boundaries", () => {
  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, validation: "validated",
  }).map((row) => row.object_code), ["TB-100", "QT-300"], "Y hoa vẫn là đã thẩm định");
  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, validation: "outside",
  }).map((row) => row.object_code), ["TB-200"], "chỉ giá trị khác y mới ngoài kế hoạch");
  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, firstMonth: "missing", owner: "unassigned", frequency: "gt12",
  }).map((row) => row.object_code), ["TB-200"]);
  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, frequency: "lte12",
  }).map((row) => row.object_code), ["TB-100", "QT-300"], "12 nằm ở nhóm 12 tháng hoặc ít hơn");
});

test("missing or blank frequency never becomes zero months", () => {
  const missingFrequencyRows = [
    { ...rows[0], id: "obj-null", object_code: "NULL", frequency_months: null },
    { ...rows[0], id: "obj-blank", object_code: "BLANK", frequency_months: "   " },
  ];
  for (const frequency of ["lte12", "gt12"]) {
    assert.deepEqual(filterCatalogObjects(missingFrequencyRows, {
      ...CATALOG_OBJECT_FILTERS_ALL,
      frequency,
    }).map((row) => row.object_code), []);
  }
});

test("visible owner option is normalized and matches exactly one owner", () => {
  const options = catalogObjectFilterOptions(rows);
  assert.deepEqual(options.departments, [{ value: "qa", label: "QA" }, { value: "xsx", label: "XSX" }]);
  assert.deepEqual(options.owners, [
    { value: "owner:nguyễn an", label: "Nguyễn An" },
    { value: "owner:trần bình", label: "Trần Bình" },
  ]);
  assert.deepEqual(filterCatalogObjects(rows, {
    ...CATALOG_OBJECT_FILTERS_ALL, owner: "owner:trần bình",
  }).map((row) => row.object_code), ["QT-300"]);
});

test("active chips describe every active filter and filtering never mutates source rows", () => {
  const before = structuredClone(rows);
  const filters = {
    ...CATALOG_OBJECT_FILTERS_ALL,
    text: "TB", department: "qa", validation: "validated", firstMonth: "present",
    owner: "assigned", frequency: "lte12",
  };
  filterCatalogObjects(rows, filters);
  assert.deepEqual(rows, before);
  assert.deepEqual(activeCatalogObjectFilterChips(filters).map((chip) => chip.key), [
    "text", "department", "validation", "firstMonth", "owner", "frequency",
  ]);
  assert.equal(activeCatalogObjectFilterChips(CATALOG_OBJECT_FILTERS_ALL).length, 0);
});

test("server filter encoder emits only the seven frozen keys and keeps search separate", () => {
  assert.deepEqual(encodeCatalogObjectServerFilters({
    text: "  máy dập  ",
    department: "qa",
    area: "a1",
    validation: "validated",
    firstMonth: "missing",
    owner: "owner:nguyễn an",
    frequency: "lte12",
  }), {
    search: "máy dập",
    filters: {
      department: "qa",
      area_code: "a1",
      validation: "validated",
      first_month: "missing",
      owner: "owner:nguyễn an",
      frequency: "lte12",
    },
  });

  assert.deepEqual(encodeCatalogObjectServerFilters(CATALOG_OBJECT_FILTERS_ALL), {
    search: "",
    filters: {
      validation: "all",
      first_month: "all",
      owner: "all",
      frequency: "all",
    },
  });
});

test("keyset cursor stack moves forward/back and reset never reuses a stale filter cursor", () => {
  const first = initialCatalogSourceCursorStack();
  assert.deepEqual(first, { page: 0, cursors: [null], nextCursor: null });

  const resolved = resolveCatalogSourceCursorPage(first, { objectCode: "TB-025", id: "aaaaaaaa-1111-4111-8111-111111111111" });
  const second = moveCatalogSourceCursorForward(resolved);
  assert.equal(second.page, 1);
  assert.deepEqual(second.cursors[1], resolved.nextCursor);
  assert.equal(moveCatalogSourceCursorBack(second).page, 0);
  assert.deepEqual(initialCatalogSourceCursorStack(), first, "query/kind/filter change gets a fresh stack");
});

test("lower Source roles get objects only while managers receive only capability-backed regions", () => {
  for (const businessRole of ["qa_staff", "workshop_manager", "workshop_staff", null]) {
    assert.deepEqual(catalogWorkspaceRegionIds({
      businessRole,
      canEdit: true,
      canGenerateTimeline: true,
      canManageWorkshopScope: true,
    }), ["objects"]);
  }

  assert.deepEqual(catalogWorkspaceRegionIds({
    businessRole: "qa_manager",
    canEdit: true,
    canGenerateTimeline: true,
    canManageWorkshopScope: true,
  }), ["objects", "coverage", "products", "alerts", "import", "pending", "history"]);
  assert.deepEqual(catalogWorkspaceRegionIds({
    businessRole: "admin",
    canEdit: false,
    canGenerateTimeline: false,
    canManageWorkshopScope: false,
  }), ["objects", "products", "alerts", "history"]);
});
