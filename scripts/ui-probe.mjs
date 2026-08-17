#!/usr/bin/env node
// Headless-Chrome probe for the running dev server: screenshots a given
// viewport and measures the real layout, so UI claims can be verified instead
// of guessed. See CLAUDE.md → "自验：量出来，别看图猜".
//
//   node scripts/ui-probe.mjs --size 1512x744
//   node scripts/ui-probe.mjs --size 1366x620 --lang en --out work/ui/en.png
//   node scripts/ui-probe.mjs --eval 'document.querySelectorAll(".result-card").length'
//
// Requires a dev server on --url (default http://localhost:3000).

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9422;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const url = arg("url", "http://localhost:3000/");
const [width, height] = arg("size", "1512x744").split("x").map(Number);
const language = arg("lang", "zh-CN");
const out = arg("out", `work/ui/probe-${width}x${height}.png`);
const wait = Number(arg("wait", "3200"));
const custom = arg("eval", null);

// Default probe: horizontal overflow is the failure this catches most often.
const defaultExpression = `(() => {
  const vw = document.documentElement.clientWidth;
  const overflowing = [...document.querySelectorAll("*")]
    .filter((el) => el.getBoundingClientRect().right > vw + 1)
    .map((el) => el.className || el.tagName);
  const list = document.querySelector(".result-list");
  return {
    viewport: vw + "x" + window.innerHeight,
    lang: document.documentElement.lang,
    docScrollWidth: document.documentElement.scrollWidth,
    overflowing: overflowing.slice(0, 8),
    tiles: list ? list.querySelectorAll(".result-card").length : 0,
    tileSize: list && list.querySelector(".result-card")
      ? Math.round(list.querySelector(".result-card").getBoundingClientRect().width) + "x" +
        Math.round(list.querySelector(".result-card").getBoundingClientRect().height)
      : null,
  };
})()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${DEBUG_PORT}`,
  // Fresh profile per run: a reused one keeps localStorage, and the stored
  // language would silently outrank the --lang header you are testing.
  `--user-data-dir=/tmp/symbol-flow-ui-probe-${process.pid}`,
  "about:blank",
], { stdio: "ignore" });

async function main() {
  let target;
  for (let attempt = 0; attempt < 40 && !target; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      target = list.find((entry) => entry.type === "page");
    } catch {
      // Chrome is still booting.
    }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error("Chrome did not expose a debugging target");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let messageId = 0;

  await new Promise((resolve) => { socket.onopen = resolve; });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++messageId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setExtraHTTPHeaders", { headers: { "Accept-Language": language } });
  // --window-size is unreliable headless (Chrome clamps to ~500px wide);
  // device metrics override is the one that actually applies.
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send("Page.navigate", { url });
  await sleep(wait);

  const evaluated = await send("Runtime.evaluate", {
    expression: custom ? `JSON.stringify(${custom})` : `JSON.stringify(${defaultExpression})`,
    returnByValue: true,
  });
  console.log(evaluated.result?.result?.value ?? JSON.stringify(evaluated.result));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(shot.result.data, "base64"));
  console.log(`saved ${out}`);

  socket.close();
  chrome.kill();
}

main().catch((error) => {
  console.error(error);
  chrome.kill();
  process.exit(1);
});
