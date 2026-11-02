#!/usr/bin/env node
// Abre la página en vivo en el Chrome del sistema (GPU real), recoge errores de consola, pulsa
// vistas y «abrir góndola», mueve el viento, espera a la visita automática, y guarda capturas
// a 1440 y 390 px de ancho. Uso: node molino-shared/qa.mjs <url> [out-dir]
import fs from 'node:fs';
import path from 'node:path';
import {CHROMIUM, CHROMIUM_ARGS, playwright} from '/Users/pedri77/.agents/skills/teardown/paths.mjs';

const url = process.argv[2];
const out = process.argv[3] || 'teardown-out/qa';
fs.mkdirSync(out, {recursive: true});
const {chromium} = playwright();
const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
const errors = [];
const run = async (w, h, tag) => {
  const page = await browser.newPage({viewport: {width: w, height: h}});
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] console.${m.type()} ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`[${tag}] requestfailed ${r.url()}`));
  const res = await page.goto(url, {waitUntil: 'load'});
  console.log(tag, 'HTTP', res.status());
  await page.waitForFunction(() => window.SIM_SHOWN === true, null, {timeout: 60000});
  await page.waitForTimeout(2500);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?';
  });
  console.log(tag, 'gpu', gpu, 'tier', await page.evaluate(() => window.LIVE?.tier));
  await page.screenshot({path: path.join(out, `${tag}-tour.png`)});
  const data = await page.evaluate(() => window.MOLINO_DATA && window.MOLINO_DATA.descargado);
  console.log(tag, 'datos cargados:', data);
  if (w >= 1000) {
    const click = async (sel) => {
      await page.locator(sel).click();
      await page.waitForTimeout(1600);
    };
    await click('text=ABRIR GÓNDOLA');
    await page.screenshot({path: path.join(out, `${tag}-gondola.png`)});
    await click('text=FRENTE');
    await page.screenshot({path: path.join(out, `${tag}-frente.png`)});
    await click('text=CENITAL');
    await click('.vb:has-text("PAUSA")');
    await page.keyboard.press('ArrowRight');
    await click('text=CINE');
    await page.screenshot({path: path.join(out, `${tag}-cine.png`)});
    const chip = await page.locator('.tourchip').textContent();
    console.log(tag, 'chip tras interacción:', chip.trim());
  }
  await page.close();
};
await run(1440, 900, 'escritorio-1440');
await run(390, 844, 'movil-390');
await browser.close();
console.log(errors.length ? `ERRORES (${errors.length}):\n` + errors.join('\n') : 'consola limpia');
process.exit(errors.length ? 1 : 0);
