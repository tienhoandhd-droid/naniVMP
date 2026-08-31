import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let dialogs;

async function loadDialogs() {
  if (!vite) vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  if (!dialogs) {
    const alerts = await vite.ssrLoadModule("/src/pages/AlertsPage.tsx");
    const workload = await vite.ssrLoadModule("/src/pages/WorkloadPage.tsx");
    const matrix = await vite.ssrLoadModule("/src/components/dashboard/MaTranTienDo.tsx");
    const progress = await vite.ssrLoadModule("/src/components/dashboard/ProgressEditModal.tsx");
    const period = await vite.ssrLoadModule("/src/components/dashboard/ChiTietKyModal.tsx");
    const aiMail = await vite.ssrLoadModule("/src/components/ai/AiMailModal.tsx");
    dialogs = {
      AlertDetailModal: alerts.AlertDetailModal,
      WorkloadDetailModal: workload.WorkloadDetailModal,
      MatrixDetailDialog: matrix.MatrixDetailDialog,
      ProgressEditModal: progress.default,
      ChiTietKyModal: period.default,
      AiMailModal: aiMail.default,
    };
  }
  return dialogs;
}

test.after(async () => { await vite?.close(); });

const activity = {
  id: "PQ-001",
  code: "PQ-001",
  obj: "OBJ-001",
  name: "Nồi hấp thử nghiệm",
  type: "PQ",
  vtype: "PQ",
  dept: "QA",
  owner: "Nguyễn QA",
  st: "todo",
  target: "2026-10-20",
  _raw: {
    dl_de_cuong: "2026-08-20",
    dl_tham_dinh: "2026-09-20",
    dl_bao_cao: "2026-10-10",
    dl_vmp: "2026-10-20",
    tt_de_cuong: "planned",
    tt_tham_dinh: "planned",
    tt_bao_cao: "planned",
    tt_vmp: "planned",
  },
};

function assertSharedDialog(html) {
  assert.match(html, /class="lp-dialog"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-labelledby="lp-dialog-title-/);
  assert.match(html, /class="lp-dialog__footer"/);
}

test("exported non-Timeline dialogs render the shared labelled dialog and footer", async () => {
  const {
    AlertDetailModal, WorkloadDetailModal, MatrixDetailDialog,
    ProgressEditModal, ChiTietKyModal, AiMailModal,
  } = await loadDialogs();
  const dialogs = [
    React.createElement(AlertDetailModal, {
      r: { a: activity, kind: "soon", stage: "Thẩm định", date: new Date("2026-09-20T00:00:00"), dleft: 20 },
      onClose: () => {},
    }),
    React.createElement(WorkloadDetailModal, {
      detail: { title: "Tải tháng 9", tasks: [activity] },
      onClose: () => {},
    }),
    React.createElement(MatrixDetailDialog, {
      detail: { ten: "QA · Thẩm định", ds: [activity] },
      onClose: () => {},
    }),
    React.createElement(ProgressEditModal, {
      act: activity,
      onClose: () => {},
      onSave: () => ({ ok: true }),
      editableFields: [],
      permissionMode: "preview",
    }),
    React.createElement(ChiTietKyModal, {
      title: "Danh sách cần xem",
      rows: [activity],
      onClose: () => {},
    }),
    React.createElement(AiMailModal, {
      loai: "canh_bao",
      phamVi: "all",
      phamViLabel: "Toàn nhà máy",
      onClose: () => {},
    }),
  ];

  dialogs.forEach((dialog) => assertSharedDialog(renderToStaticMarkup(dialog)));
});
