import type { SourceObjectRow } from "../../types/domain.ts";

export type CatalogValidationFilter = "all" | "validated" | "outside";
export type CatalogFirstMonthFilter = "all" | "missing" | "present";
export type CatalogOwnerFilter = "all" | "assigned" | "unassigned" | `owner:${string}`;
export type CatalogFrequencyFilter = "all" | "lte12" | "gt12";

export interface CatalogObjectFilters {
  text: string;
  department: string;
  area: string;
  validation: CatalogValidationFilter;
  firstMonth: CatalogFirstMonthFilter;
  owner: CatalogOwnerFilter;
  frequency: CatalogFrequencyFilter;
}

export const CATALOG_OBJECT_FILTERS_ALL: CatalogObjectFilters = {
  text: "",
  department: "all",
  area: "all",
  validation: "all",
  firstMonth: "all",
  owner: "all",
  frequency: "all",
};

export interface CatalogFilterOption { value: string; label: string }

export interface CatalogObjectFilterOptions {
  departments: CatalogFilterOption[];
  areas: CatalogFilterOption[];
  owners: CatalogFilterOption[];
}

export interface CatalogObjectFilterChip {
  key: keyof CatalogObjectFilters;
  label: string;
}

const SEARCH_FIELDS = [
  "object_code", "object_name", "department", "area_code", "line", "owner_name",
  "report_class", "work_group", "note",
] as const;

const VALIDATION_LABEL: Record<CatalogValidationFilter, string> = {
  all: "",
  validated: "Có thẩm định",
  outside: "Ngoài kế hoạch thẩm định",
};
const FIRST_MONTH_LABEL: Record<CatalogFirstMonthFilter, string> = {
  all: "",
  missing: "Thiếu tháng đầu tiên",
  present: "Có tháng đầu tiên",
};
const FREQUENCY_LABEL: Record<CatalogFrequencyFilter, string> = {
  all: "",
  lte12: "Tần suất ≤ 12 tháng",
  gt12: "Tần suất > 12 tháng",
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("vi");
}

function visible(value: unknown): string {
  return String(value ?? "").trim();
}

function hasValue(value: unknown): boolean {
  return visible(value).length > 0;
}

function numeric(value: unknown): number | null {
  const valueNumber = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(valueNumber) ? valueNumber : null;
}

function exactFacet(value: unknown, filter: string): boolean {
  return filter === "all" || normalized(value) === filter;
}

function matchesOwner(value: unknown, filter: CatalogOwnerFilter): boolean {
  if (filter === "all") return true;
  if (filter === "assigned") return hasValue(value);
  if (filter === "unassigned") return !hasValue(value);
  return normalized(value) === filter.slice("owner:".length);
}

function matchesFrequency(value: unknown, filter: CatalogFrequencyFilter): boolean {
  if (filter === "all") return true;
  const months = numeric(value);
  if (months === null) return false;
  return filter === "lte12" ? months <= 12 : months > 12;
}

export function filterCatalogObjects(
  rows: readonly SourceObjectRow[],
  filters: CatalogObjectFilters,
): SourceObjectRow[] {
  const text = normalized(filters.text);
  return rows.filter((row) => {
    const record = row as unknown as Record<string, unknown>;
    if (text && !SEARCH_FIELDS.some((key) => normalized(record[key]).includes(text))) return false;
    if (!exactFacet(row.department, filters.department)) return false;
    if (!exactFacet(row.area_code, filters.area)) return false;
    if (filters.validation === "validated" && row.validate_flag !== "y") return false;
    if (filters.validation === "outside" && row.validate_flag === "y") return false;
    if (filters.firstMonth === "missing" && hasValue(row.first_month)) return false;
    if (filters.firstMonth === "present" && !hasValue(row.first_month)) return false;
    if (!matchesOwner(row.owner_name, filters.owner)) return false;
    return matchesFrequency(row.frequency_months, filters.frequency);
  });
}

function facetOptions(rows: readonly SourceObjectRow[], field: "department" | "area_code"): CatalogFilterOption[] {
  const values = new Map<string, string>();
  rows.forEach((row) => {
    const label = visible(row[field]);
    const value = normalized(label);
    if (value && !values.has(value)) values.set(value, label);
  });
  return [...values].map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

export function catalogObjectFilterOptions(rows: readonly SourceObjectRow[]): CatalogObjectFilterOptions {
  const owners = new Map<string, string>();
  rows.forEach((row) => {
    const label = visible(row.owner_name);
    const owner = normalized(label);
    if (owner && !owners.has(owner)) owners.set(owner, label);
  });
  return {
    departments: facetOptions(rows, "department"),
    areas: facetOptions(rows, "area_code"),
    owners: [...owners].map(([value, label]) => ({ value: `owner:${value}`, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi")),
  };
}

export function activeCatalogObjectFilterChips(filters: CatalogObjectFilters): CatalogObjectFilterChip[] {
  const chips: CatalogObjectFilterChip[] = [];
  if (normalized(filters.text)) chips.push({ key: "text", label: `Từ khóa: ${filters.text.trim()}` });
  if (filters.department !== "all") chips.push({ key: "department", label: `Bộ phận: ${filters.department}` });
  if (filters.area !== "all") chips.push({ key: "area", label: `Khu vực: ${filters.area}` });
  if (filters.validation !== "all") chips.push({ key: "validation", label: VALIDATION_LABEL[filters.validation] });
  if (filters.firstMonth !== "all") chips.push({ key: "firstMonth", label: FIRST_MONTH_LABEL[filters.firstMonth] });
  if (filters.owner !== "all") {
    const label = filters.owner === "assigned" ? "Đã phân công"
      : filters.owner === "unassigned" ? "Chưa phân công"
        : `Người phụ trách: ${filters.owner.slice("owner:".length)}`;
    chips.push({ key: "owner", label });
  }
  if (filters.frequency !== "all") chips.push({ key: "frequency", label: FREQUENCY_LABEL[filters.frequency] });
  return chips;
}

export function catalogObjectActiveFilterCount(filters: CatalogObjectFilters): number {
  return activeCatalogObjectFilterChips(filters).length;
}

export function clearCatalogObjectFilter(
  filters: CatalogObjectFilters,
  key: keyof CatalogObjectFilters,
): CatalogObjectFilters {
  return { ...filters, [key]: CATALOG_OBJECT_FILTERS_ALL[key] };
}
