// La película del molino: visita guiada por el G90. El viento abre la góndola, letras el tren de
// potencia, sube hasta la nominal y cierra en el panel de España. Una sola línea de tiempo:
// el rotor es la integral de las rpm del viento; película, página y sonido la comparten.
import {runSim} from 'teardown-kit/runtime.js';
import {estadoAt, rpmAt, ss} from './aero.js';
import {createConsole} from './console.js';
import {createMolinoStage} from './stage.js';

export const SCRIPT = [
  {t: 0, view: 'cine'},
  {t: 3.4, iso: 1, view: 'gondola'},
  {t: 11.0, wind: [6, 13.5, 2.2]},
  {t: 12.8, view: 'perfil'},
  {t: 15.6, iso: 0, view: 'frente'},
  {t: 19.2, view: 'cenital'},
  {t: 22.6, view: 'cine', es: 1},
];
export const DURATION = 28;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'molino', subtitle: ''}, director: {enabled: false}, watermark: ''};
const WIND_EV = SCRIPT.find((e) => e.wind);
export const windAt = (t) => {
  const [w0, w1, dur] = WIND_EV.wind;
  const t0 = WIND_EV.t;
  return w0 + (w1 - w0) * ss(t0, t0 + dur, t) + 0.3 * Math.sin(t * 0.9) * ss(0.5, 2, t);
};
const rpsAt = (v) => rpmAt(v) / 60;
const DT = 1 / 240;
const NTAB = Math.ceil((DURATION + 2 + 16) / DT);
const TH = new Float64Array(NTAB + 1);
{
  let th = 0;
  for (let n = 0; n <= NTAB; n++) {
    TH[n] = th;
    th += rpsAt(windAt(-16 + n * DT)) * Math.PI * 2 * DT;
  }
}
export const thetaAt = (t) => {
  const i = Math.max(0, Math.min(NTAB, Math.floor((t + 16) / DT)));
  const f = (t + 16) / DT - i;
  return TH[i] + (TH[Math.min(NTAB, i + 1)] - TH[i]) * f;
};

// ------------------------------------------------------------ estado del operador
const evAt = (key, t, init = 0) => {
  let v = init;
  for (const e of SCRIPT) if (key in e && e.t <= t) v = e[key];
  return v;
};
export const isoAt = (t) => evAt('iso', t, 0);
export const esAt = (t) => {
  const e = SCRIPT.find((x) => x.es);
  return ss(e.t, e.t + 0.6, t) * (1 - ss(e.t + 2.4, e.t + 3.0, t));
};
const VIEWS_LIST = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
export const scriptView = (t) => VIEWS_LIST.filter(([t0]) => t0 <= t).pop();

// ------------------------------------------------------------ vistas
export const VIEW_FN = {
  cine: (u) => ({tx: -0.2, ty: 6.3, tz: 0, az: (-128 + 1.2 * u) * (Math.PI / 180), el: 6 * (Math.PI / 180), d: 46, sx: 40, sy: -30}),
  gondola: (u) => ({tx: 0.2, ty: 8.05, tz: 0, az: (-54 - 0.8 * u) * (Math.PI / 180), el: 21 * (Math.PI / 180), d: 6.6, sx: 30, sy: -20}),
  frente: (u) => ({tx: -0.4, ty: 7.4, tz: 0, az: (182 + 0.8 * u) * (Math.PI / 180), el: 5 * (Math.PI / 180), d: 28, sx: 40, sy: -20}),
  perfil: (u) => ({tx: 0.1, ty: 8.0, tz: 0, az: (-96 - 0.9 * u) * (Math.PI / 180), el: 12 * (Math.PI / 180), d: 8.2, sx: 30, sy: -36}),
  cenital: (u) => ({tx: 0.1, ty: 8.0, tz: 0, az: (60 + 1.4 * u) * (Math.PI / 180), el: 62 * (Math.PI / 180), d: 9.5, sx: 30, sy: -30}),
};
export const viewAt = (t) => {
  const [t0, v] = scriptView(t);
  return VIEW_FN[v](t - t0);
};

// ------------------------------------------------------------ llamadas sobre la máquina
const S1 = 0.1; // la escala del turbine.js
const HY = 7.99; // altura del eje principal en el mundo (torre 7,8 + eje a 1,9 m)
export const CALLS = [
  {name: 'PALAS × 3', sub: '44 m · PASO −5° A 87°', at: (th) => [-0.36, HY - Math.cos(th) * 2.6, -Math.sin(th) * 2.6], when: 'out', dy: -50},
  {name: 'BUJE', sub: 'FUNDICIÓN NODULAR · CONO', at: [-0.36, HY + 0.05, 0.06], when: 'both', dy: -78},
  {name: 'EJE PRINCIPAL', sub: 'FORJADO · 9–19 rpm', at: [-0.2, HY + 0.04, 0], when: 'in', dy: -118},
  {name: 'MULTIPLICADORA', sub: '1 PLANETARIA + 2 PARALELAS · 1:100,5', at: [0.145, HY + 0.1, 0.05], when: 'in', dy: -140},
  {name: 'FRENO DE DISCO', sub: 'EN EL EJE RÁPIDO', at: [0.345, HY + 0.03, 0], when: 'in', dy: 64},
  {name: 'GENERADOR', sub: 'DOBLEMENTE ALIMENTADO · 690 V', at: [0.465, HY + 0.06, 0.04], when: 'in', dy: -60},
  {name: 'TRANSFORMADOR', sub: 'SECO · 6,6 A 35 kV', at: [0.47, HY - 0.07, 0.06], when: 'in', dy: 70},
  {name: 'SISTEMA DE ORIENTACIÓN', sub: 'CORONA + 4 MOTORES', at: [0, 7.84, 0.14], when: 'both', dy: 70},
  {name: 'ANEMÓMETRO', sub: 'ULTRASÓNICO 2D + CAZOLETAS', at: [0.44, 8.25, 0], when: 'out', dy: -50},
  {name: 'TORRE', sub: 'TRONCO-CÓNICA · 78 m · 200 t', at: [0, 4.2, 0.2], when: 'out', dy: -40},
];
const CALL_VIEWS = {cine: 1, frente: 0.5, perfil: 1, gondola: 1, cenital: 0.3};

// ------------------------------------------------------------ el cursor del operador
const REST = [[820, 430], [700, 480], [900, 380], [760, 520], [640, 420]];
export function makeCursor(ui) {
  const HOPS = SCRIPT.map((e) => e.t);
  return (t) => {
    let i = 0;
    while (i < HOPS.length - 1 && HOPS[i + 1] <= t) i++;
    const a = REST[i % REST.length];
    const b = REST[(i + 1) % REST.length];
    const t0 = HOPS[i];
    const t1 = HOPS[Math.min(HOPS.length - 1, i + 1)];
    let k = 0.12 + 0.1 * Math.sin(t * 1.7);
    const seg = ss(t0 + 0.2, t1 - 0.4, t);
    k = seg;
    return {
      x: a[0] + (b[0] - a[0]) * k + 14 * Math.sin(t * 0.9),
      y: a[1] + (b[1] - a[1]) * k + 9 * Math.sin(t * 1.35 + 2),
      press: Math.abs(Math.sin(t * 0.75)) > 0.985,
      drag: false,
      ring: 0,
      ringX: -99,
      ringY: -99,
    };
  };
}

// ------------------------------------------------------------ un fotograma de consola
export function makeConsoleFrame(ui, st) {
  const cursorAt = makeCursor(ui);
  return (t, ops) => {
    const est = ops.est ?? estadoAt(windAt(t));
    const theta = ops.theta ?? thetaAt(t);
    const view = ops.view;
    const iso = ops.iso ?? isoAt(t);
    const vw = (CALL_VIEWS[view] ?? 0) * ss(0.9, 1.8, ops.since ?? 0);
    const callouts = [];
    for (const c of CALLS) {
      const gate = c.when === 'in' ? iso : c.when === 'out' ? 1 - iso : 1;
      const o = vw * gate;
      if (o < 0.02) continue;
      const p = typeof c.at === 'function' ? c.at(theta) : c.at;
      const at = st.project(p[0], p[1], p[2]);
      if (!at || at[0] < 60 || at[0] > 1540 || at[1] < 60 || at[1] > 700 || ui.covered(at[0], at[1])) continue;
      const dx = at[0] < 790 ? -70 : 70;
      if (ui.covered(at[0] + dx + (dx < 0 ? -170 : 170), at[1] + c.dy)) continue;
      callouts.push({...c, at, dx, o});
    }
    ui.update({
      est,
      theta,
      viewOn: Object.fromEntries(ops.viewKeys.map((k) => [k, k === view ? 1 : 0])),
      iso,
      esGlow: ops.esGlow ?? esAt(t),
      drag: false,
      callouts,
      cursor: ops.cursor ?? cursorAt(t),
    });
  };
}

// ------------------------------------------------------------ la película
export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createMolinoStage({canvas, ink: 0.55});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const frame = makeConsoleFrame(ui, st);
    window.MOLINO = st;
    return {
      resize,
      render(t) {
        const cam = viewAt(t);
        st.frame(estadoAt(windAt(t)), t, cam, {theta: thetaAt(t), iso: isoAt(t), flow: t * windAt(t) * 0.35});
        const [t0, view] = scriptView(t);
        frame(t, {view, since: t - t0, iso: isoAt(t), viewKeys: Object.keys(VIEW_FN), esGlow: esAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
export {S1};
