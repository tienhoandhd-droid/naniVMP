export interface RootScopeOption {
  id: string;
  code: string;
  label: string;
}

export interface ScopeOption extends RootScopeOption {
  parentId: string;
}

export interface ScopeCatalog {
  departments: RootScopeOption[];
  factories: ScopeOption[];
  areas: ScopeOption[];
  lines: ScopeOption[];
}

export interface ScopeSelection {
  departments: string[];
  factories: string[];
  areas: string[];
  lines: string[];
}

export function filterScopeCatalog(
  catalog: ScopeCatalog,
  selection: ScopeSelection,
): ScopeCatalog {
  const departments = new Set(selection.departments);
  const factories = catalog.factories.filter((item) => departments.has(item.parentId));
  const selectedFactories = new Set(selection.factories);
  const areas = catalog.areas.filter((item) => selectedFactories.has(item.parentId));
  const selectedAreas = new Set(selection.areas);
  const lines = catalog.lines.filter((item) => selectedAreas.has(item.parentId));

  return { departments: catalog.departments, factories, areas, lines };
}

export function pruneInvalidScope(
  catalog: ScopeCatalog,
  selection: ScopeSelection,
): ScopeSelection {
  const departmentIds = new Set(catalog.departments.map((item) => item.id));
  const departments = selection.departments.filter((id) => departmentIds.has(id));
  const selectedDepartments = new Set(departments);
  const factories = selection.factories.filter((id) => catalog.factories.some(
    (item) => item.id === id && selectedDepartments.has(item.parentId),
  ));
  const selectedFactories = new Set(factories);
  const areas = selection.areas.filter((id) => catalog.areas.some(
    (item) => item.id === id && selectedFactories.has(item.parentId),
  ));
  const selectedAreas = new Set(areas);
  const lines = selection.lines.filter((id) => catalog.lines.some(
    (item) => item.id === id && selectedAreas.has(item.parentId),
  ));

  return { departments, factories, areas, lines };
}

export type ScopeResolution =
  | { ok: true; selection: ScopeSelection }
  | { ok: false; error: string };

function idsForCodes<T extends Pick<RootScopeOption, "id" | "code"> & { parentId?: string }>(
  options: T[],
  codes: string[],
  allowedParentIds?: Set<string>,
): string[] {
  const result: string[] = [];
  for (const code of codes) {
    const normalized = code.trim().toLocaleLowerCase("vi");
    const codeMatches = options.filter(
      (item) => item.code.trim().toLocaleLowerCase("vi") === normalized,
    );
    const pathMatches = allowedParentIds
      ? codeMatches.filter((item) => item.parentId !== undefined && allowedParentIds.has(item.parentId))
      : codeMatches;
    // Giữ phân biệt giữa mã lạ và mã có thật nhưng nằm sai nhánh để thông
    // báo quan hệ không hợp lệ ở bước prune bên dưới.
    const matches = pathMatches.length ? pathMatches : codeMatches.slice(0, 1);
    if (!matches.length) {
      if (!result.includes("")) result.push("");
      continue;
    }
    for (const match of matches) {
      if (!result.includes(match.id)) result.push(match.id);
    }
  }
  return result;
}

export function resolveScopeCodes(
  catalog: ScopeCatalog,
  codes: ScopeSelection,
): ScopeResolution {
  const departments = idsForCodes(catalog.departments, codes.departments);
  const factories = idsForCodes(catalog.factories, codes.factories, new Set(departments));
  const areas = idsForCodes(catalog.areas, codes.areas, new Set(factories));
  const lines = idsForCodes(catalog.lines, codes.lines, new Set(areas));
  const selection = { departments, factories, areas, lines };
  if (Object.values(selection).some((values) => values.includes(""))) {
    return { ok: false, error: "Mã phạm vi không tồn tại" };
  }
  const pruned = pruneInvalidScope(catalog, selection);
  if (JSON.stringify(pruned) !== JSON.stringify(selection)) {
    return { ok: false, error: "Quan hệ phạm vi không hợp lệ" };
  }
  return { ok: true, selection };
}
