import assert from "node:assert/strict";
import test from "node:test";

import { dungDongHoNam, dungVongNam } from "../../src/components/dashboard/VongNam.tsx";

test("vòng năm marks the Bangkok current month supplied by its parent calculation", () => {
  const bands = dungVongNam([], 2099, "2099-01-01");

  assert.equal(bands[0].dangChay, true);
  assert.equal(bands[0].daQua, false);
  assert.equal(bands[11].dangChay, false);
});

test("annual clock keeps twelve fixed months and honest completion ratios", () => {
  const result = dungDongHoNam([
    { thang: 0, tong: 4, xong: 1, daQua: true, dangChay: false },
    { thang: 1, tong: 0, xong: 0, daQua: false, dangChay: true },
  ]);

  assert.equal(result.length, 12);
  assert.deepEqual(result.slice(0, 2).map(({ tiLeXong, trangThai }) => ({ tiLeXong, trangThai })), [
    { tiLeXong: 0.25, trangThai: "past" },
    { tiLeXong: 0, trangThai: "current" },
  ]);
});

test("annual clock clamps completion ratios and preserves future empty months", () => {
  const result = dungDongHoNam([
    { thang: 4, tong: 2, xong: 3, daQua: false, dangChay: false },
    { thang: 7, tong: -1, xong: 1, daQua: true, dangChay: false },
  ]);

  assert.equal(result[4].tiLeXong, 1);
  assert.equal(result[4].trangThai, "future");
  assert.deepEqual(result[7], {
    thang: 7,
    tong: -1,
    xong: 1,
    daQua: true,
    dangChay: false,
    tiLeXong: 0,
    tiLeKhoiLuong: 0,
    trangThai: "past",
  });
  assert.deepEqual(result[11], {
    thang: 11,
    tong: 0,
    xong: 0,
    daQua: false,
    dangChay: false,
    tiLeXong: 0,
    tiLeKhoiLuong: 0,
    trangThai: "future",
  });
});

test("annual clock normalizes every blade against the heaviest live month", () => {
  const first = dungDongHoNam([
    { thang: 0, tong: 2, xong: 0, daQua: true, dangChay: false },
    { thang: 1, tong: 8, xong: 0, daQua: true, dangChay: false },
    { thang: 2, tong: 0, xong: 0, daQua: true, dangChay: false },
  ]);
  const changed = dungDongHoNam([
    { thang: 0, tong: 2, xong: 0, daQua: true, dangChay: false },
    { thang: 1, tong: 4, xong: 0, daQua: true, dangChay: false },
  ]);

  assert.deepEqual(first.slice(0, 3).map((month) => month.tiLeKhoiLuong), [0.25, 1, 0]);
  assert.equal(changed[0].tiLeKhoiLuong, 0.5);
  assert.equal(changed[1].tiLeKhoiLuong, 1);
});
