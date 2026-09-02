import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

import { CHROME, CHROME_GL_ARGS } from "./chrome-path.mjs";
import { caiGiaLap, nhetPhien } from "./gia-lap-supabase.mjs";

const APP_URL = process.env.VMP_E2E_URL || "http://127.0.0.1:5199/";
const supabaseUrl = process.env.VMP_E2E_SUPABASE_URL || (() => {
  try {
    const env = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
    return env.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
  } catch {
    const assets = new URL("../../dist/assets/", import.meta.url);
    for (const name of readdirSync(fileURLToPath(assets))) {
      if (!name.endsWith(".js")) continue;
      const url = readFileSync(fileURLToPath(new URL(name, assets)), "utf8")
        .match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
      if (url) return url;
    }
    return undefined;
  }
})();

if (!supabaseUrl) throw new Error("Không tìm thấy Supabase URL công khai cho Overview E2E");

function suaKhoThemKhuVuc(kho) {
  const objects = kho.rpc_get_vmp_dashboard.objects;
  kho.rpc_get_vmp_dashboard.activities.forEach((activity, index) => {
    const area = index % 2 === 0 ? "Khu A" : "Khu B";
    activity.area = area;
    activity._raw.area = area;
    const sourceObject = objects.find((object) => object.code === activity.obj) || {};
    objects.push({ ...sourceObject, code: activity.code, area });
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", ...CHROME_GL_ARGS],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__REACT_GRAB_DISABLED__ = true;
  });
  const { chanNgoai } = await caiGiaLap(page, {
    supabaseUrl,
    kichBan: "day",
    suaKho: suaKhoThemKhuVuc,
    mangNghiemNgat: true,
    previewOrigin: APP_URL,
  });
  await nhetPhien(page, { supabaseUrl });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}#v=overview`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("[data-global-filter]", { timeout: 15_000 });

  const filter = await page.$eval("[data-global-filter]", (root) => ({
    text: root.textContent || "",
    panels: root.querySelectorAll("#vmp-global-filter-panel").length,
    expanded: root.querySelector("#vmp-global-filter-trigger")?.getAttribute("aria-expanded"),
  }));
  assert.doesNotMatch(filter.text, /Chép liên kết|\/\s*\d+\s*hạng mục/);
  assert.equal(filter.panels, 0);
  assert.equal(filter.expanded, "false");

  const compactInitial = await page.$eval("[data-global-filter]", (root) => {
    const command = root.querySelector(".vmp-global-filter__command");
    return {
      ariaLabel: root.getAttribute("aria-label"),
      summary: root.querySelector(".vmp-global-filter__summary")?.textContent?.trim(),
      trigger: root.querySelector("#vmp-global-filter-trigger")?.textContent?.trim(),
      rootWidth: root.getBoundingClientRect().width,
      commandWidth: command?.getBoundingClientRect().width ?? 0,
    };
  });
  assert.equal(compactInitial.ariaLabel, "Bộ lọc dữ liệu: đang xem tất cả");
  assert.equal(compactInitial.summary, "Tất cả dữ liệu");
  assert.equal(compactInitial.trigger, "Thay đổi");
  assert.ok(compactInitial.commandWidth < compactInitial.rootWidth * 0.7);

  const annualClock = await page.$eval(".vmp-vongnam-svg", (svg) => {
    const maxRadius = Number(svg.getAttribute("data-vongnam-max-radius"));
    const labelRadii = [...svg.querySelectorAll("[data-vongnam-label]")]
      .map((label) => Number(label.getAttribute("data-radius")));
    return {
      accessibleName: svg.getAttribute("aria-label"),
      months: svg.querySelectorAll("[data-vongnam-month]").length,
      tracks: svg.querySelectorAll("[data-vongnam-track]").length,
      bars: svg.querySelectorAll("[data-vongnam-bar]").length,
      labels: labelRadii.length,
      minimumLabelGap: Math.min(...labelRadii.map((radius) => radius - maxRadius)),
      petals: svg.querySelectorAll("[data-vongnam-petal]").length,
      today: svg.querySelectorAll("[data-vongnam-today]").length,
    };
  });
  assert.match(annualClock.accessibleName || "", /^Vòng năm \d{4}:/);
  assert.equal(annualClock.months, 12);
  assert.equal(annualClock.tracks, 12);
  assert.equal(annualClock.labels, 12);
  assert.ok(annualClock.bars > 0);
  assert.ok(annualClock.minimumLabelGap >= 16);
  assert.equal(annualClock.petals, 0);
  assert.equal(annualClock.today, 1);

  const annualLayout = await page.$eval(".vmp-vongnam-than", (root) => {
    const [clock, report] = root.children;
    const rootStyle = getComputedStyle(root);
    const reportStyle = getComputedStyle(report);
    return {
      columns: rootStyle.gridTemplateColumns.split(" ").filter(Boolean).length,
      topDelta: Math.abs(clock.getBoundingClientRect().top - report.getBoundingClientRect().top),
      reportPadding: Number.parseFloat(reportStyle.paddingTop),
      reportHasBackground: reportStyle.backgroundImage !== "none",
    };
  });
  assert.equal(annualLayout.columns, 2);
  assert.ok(annualLayout.topDelta < 2);
  assert.ok(annualLayout.reportPadding >= 18);
  assert.equal(annualLayout.reportHasBackground, true);

  const annualEditorial = await page.$eval(".vmp-vongnam", (root) => ({
    conclusionInReport: Boolean(root.querySelector(".vmp-vongnam-ben > .vmp-vongnam-ketluan")),
    detachedConclusion: Boolean(root.querySelector(":scope > .vmp-vongnam-ketluan")),
  }));
  assert.equal(annualEditorial.conclusionInReport, true);
  assert.equal(annualEditorial.detachedConclusion, false);

  const valiBrief = await page.$eval(".b-vali", (root) => {
    const brief = root.querySelector("[data-vmp-vali-brief]");
    const image = brief?.querySelector("img[data-vmp-vali-chibi]");
    return {
      present: Boolean(brief),
      mood: image?.getAttribute("data-vmp-vali-chibi"),
      src: image?.getAttribute("src") || "",
      ariaLabel: image?.getAttribute("aria-label"),
      tag: image?.tagName,
      metrics: brief?.querySelectorAll("[data-vmp-vali-metric]").length ?? 0,
      observations: brief?.querySelectorAll("[data-vmp-vali-observation]").length ?? 0,
      action: brief?.querySelector("[data-vmp-vali-action]")?.textContent || "",
      oldPortrait: Boolean(brief?.querySelector("[data-vmp-vali-web]")),
    };
  });
  assert.equal(valiBrief.present, true);
  assert.equal(valiBrief.mood, "concern");
  assert.match(valiBrief.src, /vali-chibi-concern[^/]*\.webp(?:$|\?)/);
  assert.equal(valiBrief.ariaLabel, "Công chúa Vali đang lo");
  assert.equal(valiBrief.tag, "IMG");
  assert.equal(valiBrief.metrics, 4);
  assert.equal(valiBrief.observations, 2);
  assert.match(valiBrief.action, /quá hạn/i);
  assert.equal(valiBrief.oldPortrait, false);

  const duplicatedUrgentCards = await page.$$eval(".card", (cards) => cards
    .filter((card) => card.textContent?.includes("Việc gấp nhất")).length);
  assert.equal(duplicatedUrgentCards, 0,
    "Overview không lặp lại danh sách Việc gấp nhất đã có ở KPI, Vali và màn Việc hôm nay");

  const analysis = await page.$eval("[data-overview-analysis-studio]", (root) => ({
    disclosure: [...root.querySelectorAll("button")]
      .some((button) => /Phân tích chi tiết/i.test(button.textContent || "")),
    stages: root.querySelectorAll("[data-analysis-stage]").length,
    gaps: root.querySelectorAll("[data-analysis-gap]").length,
    statusBreakdowns: root.querySelectorAll("[data-analysis-status-breakdown]").length,
    comparisonPanels: root.querySelectorAll("[data-analysis-comparison-panel]").length,
    layerOrder: [...root.querySelectorAll("[data-analysis-layer]")]
      .map((layer) => layer.getAttribute("data-analysis-layer")),
    flowDisplay: getComputedStyle(root.querySelector("[data-analysis-flow]")).display,
    flowColumns: getComputedStyle(root.querySelector("[data-analysis-flow]")).gridTemplateColumns
      .split(" ").filter(Boolean).length,
  }));
  assert.deepEqual(analysis, {
    disclosure: false,
    stages: 4,
    gaps: 3,
    statusBreakdowns: 0,
    comparisonPanels: 1,
    layerOrder: ["flow", "matrix", "comparison"],
    flowDisplay: "grid",
    flowColumns: 4,
  });

  const matrix = await page.$eval("[data-analysis-matrix]", (root) => ({
    qualityBadges: root.querySelectorAll("[data-analysis-quality-badge]").length,
    standaloneQualityCards: [...root.querySelectorAll(".card")]
      .filter((card) => card.querySelector("[data-analysis-quality-badge]")
        && !card.querySelector("[data-analysis-matrix-table]")).length,
    rowGroups: root.querySelectorAll('[role="group"][aria-label="Xem theo"]').length,
    columnGroups: root.querySelectorAll('[role="group"][aria-label="Cột"]').length,
    selectedRows: root.querySelectorAll('[role="group"][aria-label="Xem theo"] button[aria-pressed="true"]').length,
    selectedColumns: root.querySelectorAll('[role="group"][aria-label="Cột"] button[aria-pressed="true"]').length,
  }));
  assert.deepEqual(matrix, {
    qualityBadges: 1,
    standaloneQualityCards: 0,
    rowGroups: 1,
    columnGroups: 1,
    selectedRows: 1,
    selectedColumns: 1,
  });

  const matrixVisual = await page.$eval("[data-analysis-matrix]", (root) => {
    const legends = [...root.querySelectorAll("[data-matrix-legend-status]")];
    const cell = root.querySelector("[data-matrix-primary-status]");
    const mix = cell?.querySelector(".analysis-matrix-cell__mix");
    const head = root.querySelector(".analysis-matrix-table__head");
    const rowHead = root.querySelector(".analysis-matrix-row-head");
    return {
      legendStatuses: legends.map((item) => item.getAttribute("data-matrix-legend-status")),
      legendAccents: legends.map((item) => getComputedStyle(item).getPropertyValue("--matrix-accent").trim()),
      cellStatus: cell?.getAttribute("data-matrix-primary-status"),
      cellName: cell?.getAttribute("aria-label"),
      mixHeight: mix?.getBoundingClientRect().height,
      segments: cell?.querySelectorAll("[data-matrix-segment]").length,
      headPosition: head ? getComputedStyle(head).position : "",
      rowHeadPosition: rowHead ? getComputedStyle(rowHead).position : "",
    };
  });
  assert.deepEqual(matrixVisual.legendStatuses.sort(), ["chua", "thieu", "tre", "xong"]);
  assert.equal(new Set(matrixVisual.legendAccents).size, 4);
  assert.ok(matrixVisual.cellStatus);
  assert.match(matrixVisual.cellName || "", /Đã xong|Trễ hạn|Thiếu dữ liệu|Chưa tới hạn/);
  assert.equal(matrixVisual.mixHeight, 12);
  assert.ok((matrixVisual.segments ?? 0) >= 1);
  assert.equal(matrixVisual.headPosition, "sticky");
  assert.equal(matrixVisual.rowHeadPosition, "sticky");

  const clickPressedOption = async (groupLabel, optionLabel) => {
    const clicked = await page.$$eval(`[role="group"][aria-label="${groupLabel}"] button`,
      (buttons, label) => {
        const button = buttons.find((item) => item.textContent?.trim() === label);
        button?.click();
        return Boolean(button);
      }, optionLabel);
    assert.equal(clicked, true, `Không tìm thấy ${groupLabel}: ${optionLabel}`);
    await page.waitForFunction((expectedGroup, expectedOption) => [...document.querySelectorAll(
      `[role="group"][aria-label="${expectedGroup}"] button[aria-pressed="true"]`,
    )].some((button) => button.textContent?.trim() === expectedOption), {}, groupLabel, optionLabel);
  };

  await clickPressedOption("Xem theo", "Khu vực");
  await clickPressedOption("Cột", "12 tháng");
  await clickPressedOption("Xem theo", "Bộ phận");
  await clickPressedOption("Cột", "Bốn giai đoạn");

  await page.click("[data-analysis-matrix-cell]");
  await page.waitForSelector('[role="dialog"][aria-modal="true"]');
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-modal="true"]'));

  await clickPressedOption("Chọn chiều so sánh", "Bộ phận quản lý");
  assert.equal(await page.$$eval("[data-analysis-comparison-panel]", (panels) => panels.length), 1);
  assert.equal(await page.$eval("[data-analysis-comparison-panel]", (panel) => panel.getAttribute("data-analysis-comparison-panel")), "department");
  await clickPressedOption("Chọn chiều so sánh", "Loại thẩm định");

  const annualTableButton = await page.$$eval(".vmp-vongnam button", (buttons) => {
    const matches = buttons.filter((button) => button.textContent?.includes("Xem bảng số 12 tháng"));
    matches[0]?.click();
    return matches.length;
  });
  assert.equal(annualTableButton, 1);
  await page.waitForFunction(() => document.querySelectorAll(".vmp-vongnam .vmp-ctrl-bang tbody tr").length === 12);
  assert.equal(await page.$$eval(".vmp-vongnam .vmp-ctrl-bang tbody tr", (rows) => rows.length), 12);

  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  const openContract = await page.$eval("[data-global-filter]", (root) => ({
    expanded: root.querySelector("#vmp-global-filter-trigger")?.getAttribute("aria-expanded"),
    labelledBy: root.querySelector("#vmp-global-filter-panel")?.getAttribute("aria-labelledby"),
    legends: [...root.querySelectorAll("#vmp-global-filter-panel legend")].map((legend) => legend.textContent?.trim()),
  }));
  assert.equal(openContract.expanded, "true");
  assert.equal(openContract.labelledBy, "vmp-global-filter-trigger");
  assert.deepEqual(openContract.legends, ["Khoảng thời gian", "Bộ phận", "Khu vực"]);

  const clickOption = async (legend, label) => {
    const result = await page.$$eval("#vmp-global-filter-panel fieldset", (groups, expectedLegend, expectedLabel) => {
      const group = groups.find((fieldset) => fieldset.querySelector("legend")?.textContent?.trim() === expectedLegend);
      const option = [...(group?.querySelectorAll("button") || [])]
        .find((button) => button.textContent?.includes(expectedLabel));
      option?.click();
      return {
        clicked: Boolean(option),
        groups: groups.map((fieldset) => fieldset.textContent?.replace(/\s+/g, " ").trim()),
      };
    }, legend, label);
    assert.equal(result.clicked, true,
      `Không tìm thấy lựa chọn ${legend}: ${label}; fieldsets=${JSON.stringify(result.groups)}`);
  };

  await clickOption("Bộ phận", "Xưởng sản xuất");
  await page.waitForFunction(() =>
    document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
      === "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
  await clickOption("Khu vực", "Khu A");
  await page.waitForFunction(() =>
    document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
      === "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng");

  const selected = await page.$eval("[data-global-filter]", (root) => ({
    trigger: root.querySelector("#vmp-global-filter-trigger")?.textContent?.trim(),
    summary: root.querySelector(".vmp-global-filter__summary")?.textContent?.trim(),
    ariaLabel: root.getAttribute("aria-label"),
    chips: [...root.querySelectorAll(".vmp-global-filter__chips > span")]
      .map((chip) => chip.textContent?.trim()),
    hash: window.location.hash,
  }));
  assert.equal(selected.trigger, "Thay đổi");
  assert.equal(selected.summary, "XSX · Khu vực Khu A");
  assert.equal(selected.ariaLabel, "Bộ lọc dữ liệu: 2 điều kiện đang áp dụng");
  assert.deepEqual(selected.chips, ["XSX×", "Khu vực: Khu A×"]);
  assert.match(selected.hash, /dept=xsx/);
  assert.match(selected.hash, /area=Khu\+A/);

  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#vmp-global-filter-panel"));
  await page.click('button[aria-label="Bỏ XSX"]');
  await page.waitForFunction(() =>
    document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
      === "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
  const afterOneChip = await page.$eval("[data-global-filter]", (root) => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return {
      summary: root.querySelector(".vmp-global-filter__summary")?.textContent?.trim(),
      ariaLabel: root.getAttribute("aria-label"),
      chips: [...root.querySelectorAll(".vmp-global-filter__chips > span")]
        .map((chip) => chip.textContent?.trim()),
      dept: params.get("dept"),
      area: params.get("area"),
    };
  });
  assert.equal(afterOneChip.summary, "Khu vực Khu A");
  assert.equal(afterOneChip.ariaLabel, "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
  assert.deepEqual(afterOneChip.chips, ["Khu vực: Khu A×"]);
  assert.equal(afterOneChip.dept, null);
  assert.equal(afterOneChip.area, "Khu A");

  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("#vmp-global-filter-panel"));
  assert.equal(await page.evaluate(() => document.activeElement?.id), "vmp-global-filter-trigger");

  await page.setViewport({ width: 390, height: 844 });
  const mobileActive = await page.$eval("[data-global-filter]", (root) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    resetHeight: root.querySelector("[data-global-filter-reset]")?.getBoundingClientRect().height,
  }));
  assert.ok(mobileActive.overflow <= 1,
    `Overview mobile có filter active không được tràn ngang: ${JSON.stringify(mobileActive)}`);
  assert.ok((mobileActive.resetHeight ?? 0) >= 43.5,
    `Xóa tất cả mobile phải cao tối thiểu 43.5px khi filter active: ${JSON.stringify(mobileActive)}`);
  await page.setViewport({ width: 1440, height: 900 });

  await page.click("[data-global-filter-reset]");
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-global-filter]");
    return root?.getAttribute("aria-label") === "Bộ lọc dữ liệu: đang xem tất cả"
      && root.querySelector(".vmp-global-filter__summary")?.textContent?.trim() === "Tất cả dữ liệu"
      && !root.querySelector(".vmp-global-filter__chips");
  });
  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  const reset = await page.$eval("[data-global-filter]", (root) => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return {
      pressed: root.querySelectorAll('#vmp-global-filter-panel button[aria-pressed="true"]').length,
      from: root.querySelector('input[aria-label="Từ ngày"]')?.value,
      to: root.querySelector('input[aria-label="Đến ngày"]')?.value,
      dept: params.get("dept"),
      area: params.get("area"),
      period: params.get("period"),
    };
  });
  assert.deepEqual(reset, { pressed: 0, from: "", to: "", dept: null, area: null, period: null });
  await page.click(".vmp-global-filter__done");

  await page.setViewport({ width: 390, height: 844 });
  const mobileCompact = await page.$eval("[data-global-filter]", (root) => {
    const command = root.querySelector(".vmp-global-filter__command");
    const segments = [...command.querySelectorAll(":scope > *")];
    const tops = segments.map((segment) => segment.getBoundingClientRect().top);
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      commandOverflow: command.scrollWidth - command.clientWidth,
      commandHeight: command.getBoundingClientRect().height,
      rowDelta: Math.max(...tops) - Math.min(...tops),
    };
  });
  assert.ok(mobileCompact.pageOverflow <= 1);
  assert.ok(mobileCompact.commandOverflow <= 1);
  assert.ok(mobileCompact.commandHeight >= 43.5);
  assert.ok(mobileCompact.rowDelta < 2);

  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  const mobilePanel = await page.$eval("#vmp-global-filter-panel", (panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  assert.ok(mobilePanel.left >= -1,
    `Panel bộ lọc mobile phải nằm trong biên trái viewport: ${JSON.stringify(mobilePanel)}`);
  assert.ok(mobilePanel.right <= mobilePanel.viewportWidth + 1,
    `Panel bộ lọc mobile phải nằm trong biên phải viewport: ${JSON.stringify(mobilePanel)}`);

  const mobileOptions = await page.$$(".vmp-global-filter__option");
  let mobileDepartmentOption;
  for (const option of mobileOptions) {
    if ((await option.evaluate((button) => button.textContent || "")).includes("Xưởng sản xuất")) {
      mobileDepartmentOption = option;
      break;
    }
  }
  assert.ok(mobileDepartmentOption, "Panel mobile phải có option Xưởng sản xuất để thao tác");
  await mobileDepartmentOption.click();
  await page.waitForFunction(() =>
    document.querySelector("[data-global-filter]")?.getAttribute("aria-label")
      === "Bộ lọc dữ liệu: 1 điều kiện đang áp dụng");
  const mobileSelected = await page.$eval("[data-global-filter]", (root) => ({
    summary: root.querySelector(".vmp-global-filter__summary")?.textContent?.trim(),
    chips: [...root.querySelectorAll(".vmp-global-filter__chips > span")]
      .map((chip) => chip.textContent?.trim()),
  }));
  assert.deepEqual(mobileSelected, { summary: "XSX", chips: ["XSX×"] });

  await page.click(".vmp-global-filter__done");
  await page.waitForFunction(() => !document.querySelector("#vmp-global-filter-panel"));
  await page.waitForFunction(() => document.activeElement?.id === "vmp-global-filter-trigger");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "vmp-global-filter-trigger");

  await page.click("[data-global-filter-reset]");
  await page.waitForFunction(() => {
    const root = document.querySelector("[data-global-filter]");
    return root?.getAttribute("aria-label") === "Bộ lọc dữ liệu: đang xem tất cả"
      && root.querySelector(".vmp-global-filter__summary")?.textContent?.trim() === "Tất cả dữ liệu"
      && !root.querySelector(".vmp-global-filter__chips");
  });
  await page.click("#vmp-global-filter-trigger");
  await page.waitForSelector("#vmp-global-filter-panel");
  await page.click(".vmp-global-filter__done");
  await page.waitForFunction(() => !document.querySelector("#vmp-global-filter-panel"));
  await page.waitForFunction(() => document.activeElement?.id === "vmp-global-filter-trigger");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "vmp-global-filter-trigger");

  const mobile = await page.$eval("[data-global-filter]", (root) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controls: [...root.querySelectorAll("button, select, input")]
      .filter((control) => {
        const rect = control.getBoundingClientRect();
        const style = getComputedStyle(control);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .map((control) => ({ label: control.getAttribute("aria-label") || control.textContent?.trim(), height: control.getBoundingClientRect().height })),
  }));
  assert.ok(mobile.overflow <= 1, `Overview mobile không được tràn ngang: ${JSON.stringify(mobile)}`);
  assert.ok(mobile.controls.length > 0 && mobile.controls.every((control) => control.height >= 43.5),
    `Điều khiển bộ lọc mobile phải cao tối thiểu 43.5px: ${JSON.stringify(mobile)}`);
  const valiMobile = await page.$eval("[data-vmp-vali-brief]", (root) => {
    const content = root.querySelector(".vmp-vali-brief__content");
    const chibi = root.querySelector(".vmp-vali-brief__chibi");
    return {
      overflow: root.scrollWidth - root.clientWidth,
      contentWidth: content?.getBoundingClientRect().width ?? 0,
      chibiWidth: chibi?.getBoundingClientRect().width ?? 0,
      chibiBeforeContent: content && chibi
        ? Boolean(chibi.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)
        : false,
    };
  });
  assert.ok(valiMobile.overflow <= 1, `Báo cáo nhanh Vali không được tràn ngang: ${JSON.stringify(valiMobile)}`);
  assert.ok(valiMobile.contentWidth >= 180, `Nội dung Vali mobile phải còn đủ bề rộng đọc: ${JSON.stringify(valiMobile)}`);
  assert.ok(valiMobile.chibiWidth >= 72, `Chibi Vali mobile không được biến mất: ${JSON.stringify(valiMobile)}`);
  assert.equal(valiMobile.chibiBeforeContent, true);

  const analysisMobile = await page.$eval("[data-overview-analysis-studio]", (root) => {
    const flow = root.querySelector("[data-analysis-flow]");
    const scroller = root.querySelector("[data-analysis-matrix-table]");
    const controls = [...root.querySelectorAll([
      ".analysis-filter-bar select",
      ".analysis-filter-bar button",
      ".analysis-comparison-switch button",
      ".analysis-matrix__choice button",
    ].join(", "))].filter((control) => {
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      flowDisplay: flow ? getComputedStyle(flow).display : "",
      flowColumns: flow ? getComputedStyle(flow).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
      matrixLocalOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      minimumControlHeight: Math.min(...controls.map((control) => control.getBoundingClientRect().height)),
      controls: controls.length,
    };
  });
  assert.ok(analysisMobile.documentOverflow <= 1 && analysisMobile.rootOverflow <= 1,
    `Phân tích chuyên sâu mobile không được làm trang tràn ngang: ${JSON.stringify(analysisMobile)}`);
  assert.equal(analysisMobile.flowDisplay, "grid");
  assert.equal(analysisMobile.flowColumns, 1);
  assert.ok(analysisMobile.matrixLocalOverflow > 0,
    `Chỉ vùng ma trận được cuộn ngang cục bộ: ${JSON.stringify(analysisMobile)}`);
  assert.ok(analysisMobile.controls > 0 && analysisMobile.minimumControlHeight >= 43.5,
    `Điều khiển phân tích mobile phải cao tối thiểu 43.5px: ${JSON.stringify(analysisMobile)}`);
  assert.deepEqual(chanNgoai, [], "E2E Overview không được gọi mạng ngoài Supabase giả lập");

  console.log("overview executive dashboard E2E: pass");
} finally {
  await browser.close();
}
