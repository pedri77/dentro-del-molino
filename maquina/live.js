// La página en vivo del molino: la consola sobre el estudio, en tiempo real. El deslizador del
// viento es la única entrada: rpm, paso, par y potencia salen del mismo modelo que posa las piezas.
// Vistas 1-5, G abre la góndola, ESPACIO pausa; órbita con arrastre y zoom con la rueda. Sin tocar,
// la página se enseña sola con el guion de la película y un cursor; cualquier gesto cede el control,
// y 25 s de calma lo devuelven. Los datos de España se cargan de data/espana.json con respaldo propio.
import {createVertical} from 'teardown-kit/vertical.js';
import {warmComposer} from 'teardown-kit/warm.js';
import {estadoAt, clamp} from './aero.js';
import {createConsole, VIEW_KEYS, WIND_MAX} from './console.js';
import {DURATION, VIEW_FN, isoAt, makeConsoleFrame, makeCursor, scriptView, windAt} from './film.js';
import {createMolinoStage} from './stage.js';
import {FALLBACK_ES} from './console.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

const CSS = (top) => `
html,body{background:#dfe6ea;overflow:hidden}
#app{position:fixed!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.vb{pointer-events:auto;cursor:pointer}
.vb:hover{filter:brightness(.94)}
.windhit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:48px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid rgba(110,98,78,.55);background:rgba(243,238,227,.92);color:#3a342b;font:700 8.5px Inter,sans-serif;letter-spacing:1.4px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d0592a}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8a7f6c;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
.portada{position:fixed;left:0;right:0;top:0;padding:18px 20px 14px;background:rgba(243,238,227,.96);border-bottom:1px solid rgba(110,98,78,.55);color:#2f2a22;font-family:Inter,system-ui,sans-serif;display:none;z-index:60}
.portada h1{margin:0 0 4px;font:500 22px/1.1 Inter,system-ui,sans-serif}
.portada h1 b{color:#d0592a;font-weight:500}
.portada .n{font:700 26px/1.1 'JetBrains Mono',monospace;color:#d0592a;margin:10px 0 2px}
.portada .s{font:600 11px/1.5 Inter,system-ui,sans-serif;letter-spacing:.6px;color:#3a342b;text-transform:uppercase}
.portada .f{font:500 11px/1.5 Inter,system-ui,sans-serif;color:#8a7f6c;margin-top:8px}
.portada a{color:#8a7f6c}
@media (orientation:portrait) and (max-width:820px){.portada{display:block}}
.vrot{position:fixed;left:0;right:0;bottom:0;padding:14px 20px 44px;background:linear-gradient(rgba(223,230,234,0),rgba(243,238,227,.94) 30%);color:#3a342b;font:500 13px/1.45 Inter,system-ui,sans-serif;z-index:50;pointer-events:none}
.vrot b{display:block;font:700 22px/1.15 'JetBrains Mono',monospace;color:#d0592a;margin-bottom:2px}
`;

async function loadData() {
  try {
    const r = await fetch('data/espana.json');
    if (r.ok) {
      const j = await r.json();
      if (j && j.anual && j.anual.mix && j.anual.mix['Eólica'] && j.descargado) {
        window.MOLINO_DATA = j;
        return;
      }
    }
  } catch (e) {
    /* sin red o fichero ausente: queda el respaldo */
  }
  window.MOLINO_DATA = FALLBACK_ES;
}

// en vertical (móvil) la consola queda pequeña: la cifra principal va en una portada legible
function portada() {
  const d = window.MOLINO_DATA;
  const eol = d.anual.mix['Eólica'];
  const nf = (x) => x.toLocaleString('es-ES');
  const el = document.createElement('div');
  el.className = 'portada';
  el.innerHTML = `<h1>Dentro del molino · <b>G90-2.0 MW</b></h1>
    <div class="s">El viento, primera fuente de electricidad de España</div>
    <div class="n">${nf(eol.mwh)} MWh</div>
    <div class="s">eólica en 2025 · ${eol.cuota_pct.toLocaleString('es-ES')} % del sistema eléctrico</div>
    <div class="f">Último día (${d.ultimo_dato.fecha}): ${nf(d.ultimo_dato.mwh)} MWh · ${d.ultimo_dato.cuota_pct.toLocaleString('es-ES')} %<br>
    Fuente: <a href="${d.fuente.url_web}" target="_blank" rel="noopener">Red Eléctrica (REData)</a> · actualizado ${d.descargado}</div>`;
  document.body.appendChild(el);
}

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS(top);
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);

  const st = createMolinoStage({canvas, ink: 0.55});
  const ui = createConsole(app);
  const tourCursorAt = makeCursor(ui);
  loadData().then(() => {
    portada();
    ui.renderEspana();
    dispatchEvent(new Event('resize'));
  });

  const TIERS = [
    {samples: 8, shadow: 4096, blur: 20, radius: 7, ao: 16, pcf: false, streaks: 2600, pr: 2},
    {samples: 4, shadow: 2048, blur: 10, radius: 5, ao: 8, pcf: false, streaks: 1800, pr: 1.5},
    {samples: 0, shadow: 1024, blur: 6, radius: 2, ao: 0, pcf: true, streaks: 1000, pr: 1.1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let fitReady = false;
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    if (fitReady) fit();
  };
  applyTier();

  const vert = createVertical({app, canvas, st, W, H, top: () => document.querySelector('.portada')?.offsetHeight ?? 0, pr: () => TIERS[tier].pr});
  let scale = 1;
  const fit = () => {
    if (vert.place()) {
      scale = 1;
      return;
    }
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  addEventListener('resize', fit);
  fit();
  fitReady = true;
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const turnNote = document.createElement('div');
  turnNote.className = 'turn';
  turnNote.textContent = 'Gira el móvil para ver la consola completa';
  document.body.appendChild(turnNote);
  const [kx0, ky] = ui.knobAt(0);
  const [kx1] = ui.knobAt(WIND_MAX);
  const windHit = document.createElement('div');
  windHit.className = 'windhit';
  Object.assign(windHit.style, {left: `${kx0 - 12}px`, top: `${ky - 13}px`, width: `${kx1 - kx0 + 24}px`, height: '26px'});
  ui.root.appendChild(windHit);

  // ------------------------------------------------------------ estado
  let T = 0;
  let theta = 0;
  let flow = 0;
  let paused = false;
  let wind = 6;
  let windTarget = 6;
  let iso = 0;
  let isoTarget = 0;
  let view = 'cine';
  let viewAt0 = 0;
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.cine(0)};
  let ring = {t: -9, x: 0, y: 0};
  const frameConsole = makeConsoleFrame(ui, st);
  const pulse = (key) => {
    const r = ui.btn[key].getBoundingClientRect();
    const [x, y] = toStage(r.left + r.width / 2, r.top + r.height / 2);
    ring = {t: T, x, y};
  };
  const setView = (v) => {
    if (v === view) return;
    view = v;
    viewAt0 = T;
  };
  const setPaused = (p) => {
    paused = p;
    ui.btn.pause.textContent = p ? '▶ SEGUIR' : '❚❚ PAUSA';
  };

  // ------------------------------------------------------------ visita automática
  const AP = {on: true, t0: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    if (paused) setPaused(false);
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    windTarget = wind;
    isoTarget = iso > 0.5 ? 1 : 0;
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', takeOver);
  for (const k of VIEW_KEYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      setView(k);
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  ui.btn.iso.addEventListener('click', () => {
    takeOver();
    pulse('iso');
    isoTarget = isoTarget > 0.5 ? 0 : 1;
    if (isoTarget) setView('gondola');
  });
  ui.btn.pause.addEventListener('click', () => {
    takeOver();
    pulse('pause');
    setPaused(!paused);
  });
  {
    const onMove = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      windTarget = clamp(((x - kx0) / (kx1 - kx0)) * WIND_MAX, 0, WIND_MAX);
      lastInput = T;
    };
    windHit.addEventListener('pointerdown', (e) => {
      takeOver();
      windHit.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', up);
      onMove(e);
    });
  }
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'cine', 2: 'gondola', 3: 'frente', 4: 'perfil', 5: 'cenital'}[key];
    if (v) ui.btn[v].click();
    else if (key === 'g') ui.btn.iso.click();
    else if (key === ' ') ui.btn.pause.click();
    else if (key === 'arrowright' || key === 'arrowleft') {
      takeOver();
      windTarget = clamp(windTarget + (key === 'arrowright' ? 0.5 : -0.5), 0, WIND_MAX);
    } else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    drag = {x: e.clientX, y: e.clientY};
    off.az -= dx * 0.3;
    off.el = clamp(off.el + dy * 0.2, -5, 80);
    lastInput = T;
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.45, 2.4);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ el fotograma
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  let odd = false;
  const smoother = (x) => {
    const u = clamp(x, 0, 1);
    return u * u * u * (u * (u * 6 - 15) + 10);
  };
  const ssw = (a, b, t) => smoother((t - a) / (b - a));
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.4) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let cyc = 0;
    let since = T - viewAt0;
    let cursor;
    let esGlow = 0;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      cyc = c - loop * DURATION;
      const [t0, v] = scriptView(cyc);
      view = v;
      since = cyc - t0;
      viewAt0 = T - since;
      windTarget = windAt(cyc);
      isoTarget = isoAt(cyc);
      esGlow = ssw(22.6, 23.2, cyc) * (1 - ssw(25.0, 25.6, cyc));
      cursor = tourCursorAt(cyc);
      if (loop > 0 && cyc < 0.8) {
        const end = tourCursorAt(DURATION - 0.01);
        const k = ssw(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE) startTour();
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, drag: !!drag, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    wind += (windTarget - wind) * (1 - Math.exp(-dt / 0.35));
    iso += (isoTarget - iso) * (1 - Math.exp(-dt / 0.25));
    const est = estadoAt(wind);
    if (!paused) {
      theta += (est.rpm / 60) * Math.PI * 2 * dt;
      flow += wind * dt * 0.35;
    }

    const tgt = VIEW_FN[view](since);
    tgt.az += off.az * (Math.PI / 180);
    tgt.el = clamp(tgt.el + off.el * (Math.PI / 180), 0.02, 1.45);
    tgt.d *= off.k;
    const k = 1 - Math.exp(-dt / 0.55);
    const dAz = wrapDeg((tgt.az - cam.az) * (180 / Math.PI)) * (Math.PI / 180);
    cam.az += dAz * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    st.frame(est, T, vert.cam(cam), {theta, iso, flow});
    if (vert.on) {
      const nf = (x, d = 0) => x.toLocaleString('es-ES', {maximumFractionDigits: d, minimumFractionDigits: d});
      vert.caption(`<b>${nf(est.potencia)} kW</b>viento ${nf(est.viento, 1)} m/s · rotor ${nf(est.rpm, 1)} rpm · paso ${nf(est.paso, 1)}°`);
    }

    odd = !odd;
    if (tier > 0 && odd) ui.pointer(cursor);
    else frameConsole(T, {view, since, iso, est, theta, viewKeys: VIEW_KEYS, esGlow, cursor: {...cursor, drag: !!drag}});

    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>VISITA AUTOMÁTICA · TOCA PARA TOMAR EL CONTROL' : '▶ REANUDAR VISITA';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {st, cam, startTour, takeOver, get tier() {
    return tier;
  }};
}
