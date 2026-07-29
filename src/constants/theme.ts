/* =====================================================================
 *  constants/theme.js — Design Token System · VMP Monitor
 *  Pastel fairy-tale theme with GMP-grade contrast
 * ===================================================================== */

export const C = {
  bg1: "#FFF5FA", bg2: "#FBEFFB",
  pink: "#EE7BA9", pinkDeep: "#D85F92", pinkText: "#B43A6E",
  pinkSoft: "#FCE3EF", pinkMist: "#FDEEF6",
  lav: "#8E6FD0", lavText: "#6B4DB3", lavSoft: "#EDE7FC",
  mint: "#2FA98A", mintText: "#1A7058", mintSoft: "#DBF3EA",
  sky: "#4FA3D9", skyText: "#256F9F", skySoft: "#E2F1FA",
  rasp: "#DB4F73", raspText: "#BE3357", raspSoft: "#FCE2E9",
  marigold: "#E69A2E", marigoldText: "#985E0E", marigoldSoft: "#FBEFD6",
  gold: "#F4B838", silver: "#AEB7C4", bronze: "#C98A55",
  plum: "#4E2A4E", plumSoft: "#6E4869",
  white: "#FFFFFF", line: "rgba(78,42,78,.13)",
};

export const TEXT = "'Quicksand', system-ui, -apple-system, sans-serif";
export const NUM = "'Baloo 2', 'Quicksand', system-ui, sans-serif";
export const GRAD = "linear-gradient(135deg, #C2497A, #6E54C0)";
export const GRAD_SOFT = "linear-gradient(135deg, #EE7BA9, #8E6FD0)";

export const cardDefault = {
  background: "#fff", border: `1.5px solid ${C.pinkSoft}`,
  borderRadius: 24,
  // Shadow phân lớp: viền gần sắc nét + tỏa xa mềm → chiều sâu tinh tế hơn.
  boxShadow: "0 1px 2px rgba(78,42,78,.04), 0 12px 32px rgba(238,123,169,.11)",
};
export const cardStrong = {
  background: "#fff", border: `1.5px solid ${C.pink}3a`,
  borderRadius: 26,
  boxShadow: "0 1px 2px rgba(78,42,78,.05), 0 16px 40px rgba(238,123,169,.17)",
};
export const cardSoft = {
  background: C.pinkMist, border: `1px solid ${C.pinkSoft}`,
  borderRadius: 22, boxShadow: "none",
};
export const glass = {
  background: "rgba(255,255,255,0.86)", backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)", border: `1.5px solid ${C.pinkSoft}`,
  borderRadius: 16, boxShadow: "0 4px 16px rgba(238,123,169,.10)",
};
export const btnPrimary = {
  background: GRAD, color: "#fff", border: "none", cursor: "pointer",
  fontFamily: TEXT, fontWeight: 800, fontSize: 13.5,
  boxShadow: "0 6px 16px rgba(190,69,116,.3)",
};
export const INP = {
  width: "100%", padding: "11px 14px", borderRadius: 12,
  border: `1.5px solid ${C.pinkSoft}`, background: "#fff",
  fontFamily: TEXT, fontSize: 13.5, color: C.plum, fontWeight: 600, outline: "none",
};
export const FIELD = { display: "flex", flexDirection: "column", gap: 5 };
export const LBL = { fontSize: 11.5, fontWeight: 800, color: C.plumSoft };
