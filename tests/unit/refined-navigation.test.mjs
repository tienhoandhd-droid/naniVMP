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

test("strong plum sidebar keeps readable selected and hover states while artwork stays subdued", async () => {
  const shell = await read("src/styles/lotus-shell.css");
  const selected = shell.match(/\.vmp-sidebar \.vmp-nav\[aria-current="page"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const hover = shell.match(/\.vmp-sidebar \.vmp-nav:not\(\[aria-current="page"\]\):hover\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(selected, /box-shadow:\s*inset 4px/);
  assert.match(selected, /color:\s*#fff/);
  const overlay=(rule,background)=>{
    const [,r,g,b,a]=rule.match(/background:\s*rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/)||[];
    assert.ok(a,'navigation overlay must have a measurable opacity');
    const base=background.slice(1).match(/.{2}/g).map(v=>parseInt(v,16));
    return '#'+[r,g,b].map((v,i)=>Math.round(Number(v)*Number(a)+base[i]*(1-Number(a))).toString(16).padStart(2,'0')).join('');
  };
  for(const base of ['#3b153d','#511e4d','#2f1237']){
    assert.ok(shell.includes(base),'strong sidebar surface is present');
    assert.ok(contrast('#fff6ed',base)>=4.5,'normal sidebar text contrast');
    assert.ok(contrast('#ffffff',overlay(selected,base))>=4.5,'selected text contrast');
    assert.ok(contrast('#ffffff',overlay(hover,base))>=4.5,'hover text contrast');
  }
  assert.match(shell, /\.vmp-main-nen::before[\s\S]*?opacity:\s*0\.17;/);
  assert.match(shell, /\.vmp-main-nen::after[\s\S]*?opacity:\s*0\.08;/);
});
