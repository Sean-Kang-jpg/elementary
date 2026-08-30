#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const INPUT = path.join(BASE, "local_outputs_20260320", "p1_schoolzone_batch1.csv");
const OUTPUT_DIR = path.join(BASE, "local_outputs_20260320", "p1_b_browser_captures_final");
const REVIEW_HTML = path.join(BASE, "local_outputs_20260320", "p1_b_browser_review_final.html");
const REVIEW_PDF = path.join(BASE, "local_outputs_20260320", "p1_b_browser_review_final.pdf");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlyNumbers = onlyArg
  ? new Set(onlyArg.split("=")[1].split(",").map((value) => Number(value.trim())))
  : null;
const zoomArg = process.argv.find((arg) => arg.startsWith("--zoom="));
const zoomLevel = zoomArg ? Number(zoomArg.split("=")[1]) : 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.replace(/^\uFEFF/, ""), values[index] ?? ""]))
  );
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result ?? {});
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function waitForDebug(port) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = tabs.find((tab) => tab.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge remote debugging endpoint did not start.");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let items = parseCsv(fs.readFileSync(INPUT, "utf8")).filter((row) => row.review_category === "B_multi_large");
  if (limit) items = items.slice(0, limit);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "p1-schoolzone-edge-"));
  const port = 9337;
  const edge = spawn(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,1000",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  let cdp;
  try {
    cdp = new Cdp(await waitForDebug(port));
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Network.setCookie", { name: "popNotice", value: "hidden", domain: "schoolzone.emac.kr", path: "/" });
    await cdp.send("Network.setCookie", { name: "todayPopup", value: "hidden", domain: "schoolzone.emac.kr", path: "/" });
    await cdp.send("Network.setCookie", { name: "popname", value: "done", domain: "schoolzone.emac.kr", path: "/" });

    const pages = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const filename = `${String(index + 1).padStart(2, "0")}_${item.apt_cd}.png`;
      pages.push({ item, filename });
      if (onlyNumbers && !onlyNumbers.has(index + 1)) continue;

      const longitude = Number(item.longitude), latitude = Number(item.latitude);
      const mercatorX = longitude * 20037508.34 / 180;
      const mercatorY = Math.log(Math.tan((90 + latitude) * Math.PI / 360)) * 20037508.34 / Math.PI;
      const url = "https://schoolzone.emac.kr/gis/gis.do";
      await cdp.send("Page.navigate", { url });
      await sleep(6500);
      const label = `${index + 1}. ${item.apt_nm} | ${item.road_address} | 대표점: ${item.browser_hakgudo_nm} | 후보: ${item.candidate_hakgudo_names}`;
      const expression = `(() => {
        document.cookie = 'popNotice=hidden; path=/';
        document.cookie = 'todayPopup=hidden; path=/';
        document.cookie = 'popname=done; path=/';
        const removeGuidePopups = () => {
          document.querySelectorAll('#popupNotice,#popupUserGuide,.dimmed').forEach((node) => node.remove());
        };
        removeGuidePopups();
        window.__codexPopupCleanup = window.setInterval(removeGuidePopups, 250);
        try { fn_getSchoolArea(${longitude}, ${latitude}, 'elementSchoolArea', 'vworld'); } catch (e) {}
        let label = document.getElementById('codex-review-label');
        if (!label) { label = document.createElement('div'); label.id = 'codex-review-label'; document.body.appendChild(label); }
        label.textContent = ${JSON.stringify(label)};
        Object.assign(label.style, {position:'fixed',left:'74px',right:'72px',bottom:'18px',zIndex:'99999',padding:'12px 16px',background:'rgba(255,255,255,.94)',border:'2px solid #17324d',font:'600 16px sans-serif',color:'#111',boxShadow:'0 2px 10px rgba(0,0,0,.25)'});
      })()`;
      await cdp.send("Runtime.evaluate", { expression });
      await sleep(5000);
      await cdp.send("Runtime.evaluate", { expression: `(() => {
        document.querySelectorAll('#popupNotice,#popupUserGuide,.dimmed').forEach((node) => node.remove());
        try {
          map.onListener((innerMap) => innerMap.centerAndZoom(
            new esri.geometry.Point(${mercatorX}, ${mercatorY}, new esri.SpatialReference({wkid: 102100})),
            ${zoomLevel}
          ));
        } catch (e) {}
      })()` });
      await sleep(6500);
      const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), Buffer.from(capture.data, "base64"));
      process.stdout.write(`${index + 1}/${items.length} ${item.apt_nm}\n`);
    }

    const reviewHtml = `<!doctype html><meta charset="utf-8"><title>P1 B군 학구도 수기 검토</title><style>
      @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic",sans-serif;color:#17202a}.page{page-break-after:always;height:190mm;display:flex;flex-direction:column}.page:last-child{page-break-after:auto}h1{font-size:18px;margin:0 0 4px}.meta{font-size:11px;margin:0 0 6px;color:#46515c}.shot{width:100%;height:165mm;object-fit:contain;border:1px solid #9ba6b2}.note{font-size:11px;margin-top:4px}.boxes{letter-spacing:0}</style>
      ${pages.map(({ item, filename }, index) => `<section class="page"><h1>${index + 1}. ${esc(item.apt_nm)}</h1><p class="meta">${esc(item.road_address)} · ${esc(item.households)}세대 · 대표점 ${esc(item.browser_hakgudo_nm)}</p><img class="shot" src="${pathToFileURL(path.join(OUTPUT_DIR, filename)).href}"><p class="note boxes">판정: □ 단일 학구 확정　□ 동별 분리　□ 추가 확인　 메모: ________________________________________________</p></section>`).join("")}`;
    fs.writeFileSync(REVIEW_HTML, reviewHtml, "utf8");
    await cdp.send("Page.navigate", { url: pathToFileURL(REVIEW_HTML).href });
    await sleep(2500);
    const pdf = await cdp.send("Page.printToPDF", { printBackground: true, landscape: true, paperWidth: 11.69, paperHeight: 8.27, marginTop: 0.25, marginBottom: 0.25, marginLeft: 0.25, marginRight: 0.25 });
    fs.writeFileSync(REVIEW_PDF, Buffer.from(pdf.data, "base64"));
    process.stdout.write(`PDF: ${REVIEW_PDF}\n`);
  } finally {
    try { if (cdp) await cdp.send("Browser.close"); } catch {}
    edge.kill();
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
