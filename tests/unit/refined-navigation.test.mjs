import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(`../../${file}`, import.meta.url), "utf8");

const tokenHex = (css, name) => {
  const value = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  assert.ok(value, `${name} must be a concrete, measurable colour`);
  return value;
};

const luminance = (hex) => {
  const channels = hex.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16) / 255);
  return channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
};

const contrast = (foreground, background) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

test("navigation has dedicated calm tokens in both themes", async () => {
  const tokens = await read("src/styles/lotus-tokens.css");
  const darkStart = tokens.indexOf(':root[data-visual="lotus-pearl"][data-theme="dark"]');
  const light = tokens.slice(tokens.indexOf(':root[data-visual="lotus-pearl"]'), darkStart);
  const dark = tokens.slice(darkStart);

  for (const name of ["--lp-nav-surface", "--lp-nav-hover", "--lp-nav-current", "--lp-on-nav-current", "--lp-nav-hairline"]) {
    assert.match(tokens, new RegExp(`${name}:`), `light ${name}`);
    assert.match(dark, new RegExp(`${name}:`), `dark ${name}`);
  }

  for (const theme of [light, dark]) {
    assert.ok(
      contrast(tokenHex(theme, "--lp-on-nav-current"), tokenHex(theme, "--lp-nav-current")) >= 4.5,
      "selected navigation text must meet AA contrast",
    );
    assert.ok(
      contrast(tokenHex(theme, "--lp-text-secondary"), tokenHex(theme, "--lp-nav-surface")) >= 4.5,
      "unselected navigation text must meet AA contrast",
    );
    assert.ok(
      contrast(tokenHex(theme, "--lp-text-primary"), tokenHex(theme, "--lp-nav-hover")) >= 4.5,
      "hover navigation text must meet AA contrast",
    );
  }
});

// Computed sidebar contrast and focus are exercised by qualification-shell-navigation.mjs.
test("background artwork stays subdued behind the content", async () => {
  const shell = await read("src/styles/lotus-shell.css");
  assert.match(shell, /\.vmp-main-nen::before[\s\S]*?opacity:\s*0\.17;/);
  assert.match(shell, /\.vmp-main-nen::after[\s\S]*?opacity:\s*0\.08;/);
});
