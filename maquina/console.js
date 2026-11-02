// La consola del molino: hoja de ingeniería en castellano sobre el estudio. 1600 × 900 fijo.
// update(state) redibuja cada parte viva: lecturas del aerogenerador, curva de potencia con el punto
// actual, el esquema del tren de transmisión y el panel de España con los datos de Red Eléctrica
// (pasados por window.MOLINO_DATA; el panel muestra la fecha de descarga y el enlace a la fuente).
import {G90, CURVA} from './aero.js';
import {FALLBACK_ES} from './espana-fallback.js';

export const C = {ink: '#2f2a22', mute: '#8a7f6c', faint: '#b9ae99', line: 'rgba(110,98,78,.55)', paper: 'rgba(243,238,227,.88)', accent: '#d0592a', red: '#c9342a', dark: '#3a342b'};
export const VIEW_KEYS = ['cine', 'gondola', 'frente', 'perfil', 'cenital'];
export const VIEW_NAMES = {cine: 'CINE', gondola: 'GÓNDOLA', frente: 'FRENTE', perfil: 'PERFIL', cenital: 'CENITAL'};
export const TOGGLES = ['iso'];
export const WIND_MAX = 25;

export {FALLBACK_ES};

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.paper};border:1px solid ${C.line};backdrop-filter:blur(3px)}
.hd{font-size:9px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;white-space:nowrap}
.hd i{font-style:normal;color:${C.accent};margin-right:7px;letter-spacing:0}
.lb{font-size:8px;font-weight:600;letter-spacing:1.3px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.vl{font-size:10.5px;font-weight:600;letter-spacing:.4px;white-space:nowrap}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.vb{position:absolute;height:19px;padding:0 9px;display:flex;align-items:center;font-size:8.5px;font-weight:700;letter-spacing:1.4px;border:1px solid ${C.line};background:rgba(243,238,227,.9);color:${C.dark}}
.call{position:absolute;white-space:nowrap;background:rgba(243,238,227,.86);border:1px solid ${C.line};padding:4px 7px 4px}
.call b{display:block;font-size:8.5px;font-weight:700;letter-spacing:1.4px}
.call span{display:block;font-size:7.5px;letter-spacing:1.1px;color:${C.mute};margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}
.ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:1.6px solid ${C.accent};opacity:0;z-index:49}
a.src{color:${C.mute};text-decoration:none;border-bottom:1px dotted ${C.mute}}
`;

const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

const nf = (x) => (x ?? 0).toLocaleString('es-ES');
const fecha = (iso) => (iso && iso.length === 10 ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : iso || '—');
const fmt = (x, d = 1) => x.toLocaleString('es-ES', {minimumFractionDigits: d, maximumFractionDigits: d});

const SPECS = [
  ['MODELO', 'GAMESA G90-2.0 MW'],
  ['POTENCIA', '2.000 kW (2 MW)'],
  ['ROTOR', 'Ø 90 m · 6.361,7 m²'],
  ['PALAS', '3 × 44 m · paso −5° a 87°'],
  ['BUJE', '78 m de altura'],
  ['VIENTO', 'arranque 3 · nominal 14 · corte 21 m/s'],
  ['GIRO', '9–19 rpm · multiplicadora 1:100,5'],
  ['GENERADOR', 'asíncrono doblemente alimentado · 690 V'],
];

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const ES = () => window.MOLINO_DATA || FALLBACK_ES;

  // ------------------------------------------------------------ barra superior
  add(`<div style="position:absolute;left:12px;right:12px;top:8px;height:24px;border-bottom:1px solid ${C.line}"></div>`);
  add(`<div class="lb" style="left:18px;top:14px;position:absolute;color:${C.dark}">◇ DENTRO DEL MOLINO · LABORATORIO DE MÁQUINAS</div>`);
  const btn = {};
  {
    let x = 1588;
    const right = (key, txt, w) => {
      x -= w;
      btn[key] = add(`<div class="vb" style="left:${x}px;top:10px;width:${w}px;justify-content:center">${txt}</div>`);
      x -= 4;
    };
    right('pause', '❚❚ PAUSA', 84);
    x -= 10;
    right('iso', 'ABRIR GÓNDOLA', 118);
    x -= 10;
    for (const k of [...VIEW_KEYS].reverse()) right(k, VIEW_NAMES[k], VIEW_NAMES[k].length * 8 + 20);
    add(`<div class="lb" style="position:absolute;left:${x - 34}px;top:15px">VISTA</div>`);
  }
  add(`<div class="lb" style="position:absolute;right:16px;top:36px;letter-spacing:1px;font-size:7.5px">ARRASTRA PARA ORBITAR · 1–5 VISTAS · G ABRE · ESPACIO PAUSA</div>`);

  // ------------------------------------------------------------ título y lecturas, arriba a la izquierda
  add(`<div style="position:absolute;left:34px;top:48px;font-size:30px;font-weight:500;letter-spacing:.6px;line-height:1">AEROGENERADOR <span style="color:${C.accent}">G90-2.0 MW</span></div>`);
  add(`<div class="lb" style="position:absolute;left:35px;top:86px;color:${C.dark};font-size:8.5px;letter-spacing:1.6px">DENTRO DEL MOLINO · EL VIENTO, PRIMERA FUENTE DE ELECTRICIDAD DE ESPAÑA</div>`);
  add(`<div style="position:absolute;left:35px;top:106px;display:grid;grid-template-columns:118px auto;row-gap:5px">${SPECS.map(([k, v]) => `<span class="lb">${k}:</span><span class="vl">${v}</span>`).join('')}</div>`);

  // ------------------------------------------------------------ viento: deslizador y lecturas vivas
  const WP = {x: 34, y: 262, w: 300, h: 208};
  add(`<div class="pn" style="left:${WP.x}px;top:${WP.y}px;width:${WP.w}px;height:${WP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${WP.x + 12}px;top:${WP.y + 11}px"><i>›››</i>VIENTO · UNA ENTRADA LO MUEVE TODO</div>`);
  const SL = {x: WP.x + 16, y: WP.y + 52, w: WP.w - 32};
  add(`<div class="lb" style="position:absolute;left:${SL.x}px;top:${SL.y - 18}px">VELOCIDAD DEL VIENTO</div>`);
  const windVal = add(`<div class="vl mono" style="position:absolute;right:${1600 - (SL.x + SL.w)}px;top:${SL.y - 20}px;color:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;width:${SL.w}px;height:3px;background:rgba(110,98,78,.22)"></div>`);
  const fill = add(`<div style="position:absolute;left:${SL.x}px;top:${SL.y}px;height:3px;background:${C.accent}"></div>`);
  const knob = add(`<div style="position:absolute;top:${SL.y - 6.5}px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#f6f1e6;border:1.6px solid ${C.dark}"></div>`);
  add(`<svg style="position:absolute;left:${SL.x}px;top:${SL.y + 8}px" width="${SL.w}" height="14">${[0, 5, 10, 15, 20, 25].map((v) => `<line x1="${(v / WIND_MAX) * SL.w}" x2="${(v / WIND_MAX) * SL.w}" y1="0" y2="4" stroke="${C.dark}" stroke-width=".8"/><text x="${Math.min(SL.w - 10, Math.max(6, (v / WIND_MAX) * SL.w))}" y="12" font-size="6.5" text-anchor="middle" fill="${C.mute}">${v}${v === 25 ? ' m/s' : ''}</text>`).join('')}
    <rect x="${(G90.vArranque / WIND_MAX) * SL.w}" y="-8" width="${((G90.vNominal - G90.vArranque) / WIND_MAX) * SL.w}" height="5" fill="${C.accent}" opacity=".2"/>
    <rect x="${(G90.vCorte / WIND_MAX) * SL.w}" y="-8" width="${((WIND_MAX - G90.vCorte) / WIND_MAX) * SL.w}" height="5" fill="${C.dark}" opacity=".25"/></svg>`);
  add(`<div style="position:absolute;left:${WP.x + 14}px;top:${WP.y + 84}px;width:${WP.w - 28}px;display:grid;grid-template-columns:1fr auto;row-gap:6px">
    <span class="lb">POTENCIA</span><span class="vl mono" data-k="p"></span>
    <span class="lb">RPM ROTOR</span><span class="vl mono" data-k="rpm"></span>
    <span class="lb">RPM GENERADOR</span><span class="vl mono" data-k="rpmg"></span>
    <span class="lb">ÁNGULO DE PASO</span><span class="vl mono" data-k="paso"></span>
    <span class="lb">PAR EN EJE LENTO</span><span class="vl mono" data-k="par"></span>
    <span class="lb">Cp (REAL / BETZ)</span><span class="vl mono" data-k="cp"></span></div>`);

  // ------------------------------------------------------------ España · Red Eléctrica, abajo a la izquierda
  const EP = {x: 34, y: 484, w: 300, h: 348};
  add(`<div class="pn" style="left:${EP.x}px;top:${EP.y}px;width:${EP.w}px;height:${EP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${EP.x + 12}px;top:${EP.y + 11}px"><i>›››</i>ESPAÑA · RED ELÉCTRICA</div>`);
  const esBody = add(`<div style="position:absolute;left:${EP.x + 12}px;top:${EP.y + 26}px;width:${EP.w - 24}px"></div>`);

  // ------------------------------------------------------------ curva de potencia, arriba a la derecha
  const CP = {x: 1298, y: 48, w: 274, h: 300};
  add(`<div class="pn" style="left:${CP.x}px;top:${CP.y}px;width:${CP.w}px;height:${CP.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${CP.x + 12}px;top:${CP.y + 11}px"><i>›››</i>CURVA DE POTENCIA G90</div>`);
  const curve = add(`<svg style="position:absolute;left:${CP.x + 12}px;top:${CP.y + 26}px" width="250" height="230"></svg>`);
  add(`<div class="lb" style="position:absolute;left:${CP.x + 12}px;top:${CP.y + 262}px;font-size:7px">FOLLETO GAMESA · LECTURA DEL GRÁFICO · ρ 1,225 kg/m³</div>`);

  // ------------------------------------------------------------ física, derecha
  const PH = {x: 1298, y: 358, w: 274, h: 176};
  add(`<div class="pn" style="left:${PH.x}px;top:${PH.y}px;width:${PH.w}px;height:${PH.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${PH.x + 12}px;top:${PH.y + 11}px"><i>›››</i>FÍSICA DEL DISCO</div>`);
  add(`<div class="mono" style="position:absolute;left:${PH.x + 12}px;top:${PH.y + 26}px;font-size:11px;color:${C.dark}">P = ½ · ρ · A · v³ · Cp</div>`);
  add(`<div style="position:absolute;left:${PH.x + 14}px;top:${PH.y + 44}px;width:${PH.w - 28}px;display:grid;grid-template-columns:1fr auto;row-gap:5px">
    <span class="lb">ρ (AIRE)</span><span class="vl mono">1,225 kg/m³</span>
    <span class="lb">A (DISCO)</span><span class="vl mono">6.361,7 m²</span>
    <span class="lb">VIENTO EN EL DISCO</span><span class="vl mono" data-k="v3"></span>
    <span class="lb">LÍMITE DE BETZ</span><span class="vl mono">59,3 %</span></div>`);

  // ------------------------------------------------------------ tren de transmisión, abajo al centro
  const TR = {x: 344, y: 730, w: 944, h: 102};
  add(`<div class="pn" style="left:${TR.x}px;top:${TR.y}px;width:${TR.w}px;height:${TR.h}px"></div>`);
  add(`<div class="hd" style="position:absolute;left:${TR.x + 12}px;top:${TR.y + 11}px"><i>›››</i>TREN DE POTENCIA · 9–19 rpm → 900–1.900 rpm (1:100,5)</div>`);
  const train = add(`<svg style="position:absolute;left:${TR.x + 12}px;top:${TR.y + 24}px" width="920" height="70"></svg>`);

  // ------------------------------------------------------------ overlays
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="24" height="24" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#1d1a16" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);

  const K = {};
  for (const n of ui.querySelectorAll('[data-k]')) K[n.dataset.k] = n;
  const knobAt = (w) => [SL.x + (Math.min(WIND_MAX, Math.max(0, w)) / WIND_MAX) * SL.w, SL.y + 1.5];
  const PANELS = [[1298, 48, 1572, 534], [34, 262, 334, 832], [34, 44, 480, 180], [344, 730, 1288, 832], [1000, 6, 1592, 44]];
  const covered = (x, y) => PANELS.some(([a, b, c, d]) => x > a - 8 && x < c + 8 && y > b - 8 && y < d + 8);
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  // la curva, dibujada una vez
  const CX = (v) => 26 + (v / 25) * 218;
  const CY = (p) => 208 - (p / 2200) * 182;
  let pathD = '';
  for (let i = 0; i <= 250; i += 1) {
    const v = (i / 250) * 25;
    let p = 0;
    for (let j = 1; j < CURVA.length; j++) if (CURVA[j][0] >= v) {
      const [a, pa] = CURVA[j - 1];
      const [b, pb] = CURVA[j];
      p = pa + (pb - pa) * ((v - a) / (b - a));
      break;
    }
    if (v > 21) p = 0;
    pathD += `${i ? 'L' : 'M'}${CX(v).toFixed(1)} ${CY(p).toFixed(1)}`;
  }
  const betzD = `M${CX(3)} ${CY(0)} L${CX(14)} ${CY(2323)} L${CX(14)} ${CY(2000)}`;

  const renderEspana = () => {
    const d = ES();
    const mix = d.anual.mix;
    const eol = mix['Eólica'];
    const orden = Object.entries(mix).sort((a, b) => b[1].mwh - a[1].mwh).slice(0, 5);
    const pen = d.eolica_peninsular_2025_mwh;
    const g90 = Math.round((pen * 1000) / (2000 * 8760 * (d.factor_capacidad_pct / 100)));
    esBody.innerHTML = `
      <div class="vl mono" style="font-size:15px;color:${C.accent}">${nf(eol.mwh)} MWh eólicos en 2025</div>
      <div class="lb" style="margin:2px 0 7px">${fmt(eol.cuota_pct)} % del sistema · ${nf(d.anual.total_sistema_mwh)} MWh totales · primera fuente</div>
      ${orden.map(([k, v]) => `<div style="display:grid;grid-template-columns:118px 1fr 52px;gap:6px;align-items:center;margin-bottom:3px">
        <span class="lb" style="font-size:7px">${k.toUpperCase()}</span>
        <span style="height:5px;background:rgba(110,98,78,.14);position:relative"><span style="position:absolute;inset:0 auto 0 0;width:${(v.cuota_pct / 25) * 100}%;background:${k === 'Eólica' ? C.accent : C.faint}"></span></span>
        <span class="mono" style="font-size:8.5px;text-align:right">${fmt(v.cuota_pct)} %</span></div>`).join('')}
      <div style="height:1px;background:${C.line};margin:6px 0"></div>
      <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px">
        <span class="lb">POTENCIA PENINSULAR 31.12.2025</span><span class="vl mono">${nf(d.potencia_eolica_mw)} MW</span>
        <span class="lb">FACTOR DE CAPACIDAD · PENINSULAR</span><span class="vl mono">${fmt(d.factor_capacidad_pct)} %</span>
        <span class="lb">ÚLTIMO DÍA · ${fecha(d.ultimo_dato.fecha)}</span><span class="vl mono">${d.ultimo_dato.mwh ? `${nf(d.ultimo_dato.mwh)} MWh · ${fmt(d.ultimo_dato.cuota_pct)} %` : '—'}</span>
        <span class="lb">RÉCORD · ${fecha(d.record_diario.fecha)}</span><span class="vl mono">${nf(d.record_diario.mwh)} MWh · ${fmt(d.record_diario.cuota_pct)} %</span>
        <span class="lb">MÁS FLOJO · ${fecha(d.minimo_diario.fecha)}</span><span class="vl mono">${nf(d.minimo_diario.mwh)} MWh · ${fmt(d.minimo_diario.cuota_pct)} %</span>
      </div>
      <div style="height:1px;background:${C.line};margin:6px 0"></div>
      <div class="vl mono" style="font-size:12px">≈ ${nf(g90)} G90 como este, todo el año (península)</div>
      <div class="lb" style="font-size:7px;margin-top:2px">${nf(Math.round(pen / 1000))} GWh peninsulares ÷ (2 MW × 8.760 h × ${fmt(d.factor_capacidad_pct)} %)</div>
      <div class="lb" style="font-size:7px;margin-top:8px;color:${C.mute}">Actualizado: ${d.descargado} · Fuente: <a class="src" href="${d.fuente.url_web}" target="_blank" rel="noopener">REData (REE)</a> · <a class="src" href="${d.potencia_fuente.url}" target="_blank" rel="noopener">potencia</a></div>`;
  };
  renderEspana();

  const update = (s) => {
    const e = s.est;
    K.p.textContent = `${nf(Math.round(e.potencia))} kW`;
    K.rpm.textContent = `${fmt(e.rpm)} rpm`;
    K.rpmg.textContent = `${nf(Math.round(e.rpmGen))} rpm`;
    K.paso.textContent = `${fmt(e.paso)}°`;
    K.par.textContent = `${nf(Math.round(e.par / 1000))} kN·m`;
    K.cp.textContent = `${(e.cp * 100).toFixed(1)} % / 59,3 %`;
    K.v3.textContent = `${nf(Math.round(e.disp))} kW`;

    const [kx] = knobAt(e.viento);
    knob.style.left = `${kx.toFixed(1)}px`;
    knob.style.transform = `scale(${s.drag ? 1.18 : 1})`;
    knob.style.borderColor = s.drag ? C.accent : C.dark;
    fill.style.width = `${(kx - SL.x).toFixed(1)}px`;
    windVal.textContent = `${fmt(e.viento)} m/s`;

    // curva con el punto actual
    curve.innerHTML = `
      ${[0, 500, 1000, 1500, 2000].map((p) => `<line x1="26" x2="244" y1="${CY(p)}" y2="${CY(p)}" stroke="${C.faint}" stroke-width=".5" stroke-dasharray="2 3"/><text x="22" y="${CY(p) + 2}" font-size="6" text-anchor="end" fill="${C.mute}" font-family="JetBrains Mono">${p / 1000}M</text>`).join('')}
      ${[3, 14, 21].map((v) => `<line x1="${CX(v)}" x2="${CX(v)}" y1="${CY(0)}" y2="${CY(2200)}" stroke="${v === 14 ? C.dark : C.faint}" stroke-width=".5" stroke-dasharray="2 3"/><text x="${CX(v)}" y="${CY(0) + 9}" font-size="6" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">${v}</text>`).join('')}
      <path d="${pathD}" fill="none" stroke="${C.dark}" stroke-width="1.6"/>
      <path d="${betzD}" fill="none" stroke="${C.accent}" stroke-width=".8" stroke-dasharray="3 2" opacity=".7"/>
      <text x="244" y="${CY(2323) - 3}" font-size="6" text-anchor="end" fill="${C.accent}">BETZ 59,3 %</text>
      <circle cx="${CX(e.viento)}" cy="${CY(e.potencia)}" r="4.5" fill="${C.accent}" stroke="#f6f1e6" stroke-width="1.5"/>
      <text x="${CX(e.viento) + 8}" y="${CY(e.potencia) - 4}" font-size="8" font-weight="700" fill="${C.accent}" font-family="JetBrains Mono">${nf(Math.round(e.potencia))} kW</text>
      <text x="244" y="222" font-size="6" text-anchor="end" fill="${C.mute}">VIENTO m/s</text>`;

    // tren de potencia: bloques girando de verdad (marcas radiales)
    const rpmFrac = e.rpm / 19;
    const spin = (s.theta * 180) / Math.PI;
    const gearTeeth = (cx, cy, r, ang, lit) => {
      let h = '';
      for (let i = 0; i < 8; i++) {
        const a = ((ang * (i % 2 ? 1 : 1) + (i / 8) * 360) * Math.PI) / 180;
        h += `<line x1="${(cx + Math.cos(a) * (r - 3)).toFixed(1)}" y1="${(cy + Math.sin(a) * (r - 3)).toFixed(1)}" x2="${(cx + Math.cos(a) * r).toFixed(1)}" y2="${(cy + Math.sin(a) * r).toFixed(1)}" stroke="${lit ? C.accent : C.dark}" stroke-width="1.4"/>`;
      }
      return h;
    };
    train.innerHTML = `
      <line x1="30" y1="38" x2="890" y2="38" stroke="${C.line}" stroke-width="1"/>
      <rect x="40" y="18" width="26" height="40" rx="4" fill="none" stroke="${C.dark}" stroke-width="1.2"/>
      ${gearTeeth(53, 38, 20, -spin, true)}
      <text x="53" y="66" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">ROTOR ${fmt(e.rpm)} rpm</text>
      <line x1="66" y1="38" x2="180" y2="38" stroke="${C.dark}" stroke-width="2"/>
      <text x="123" y="33" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">EJE LENTO · ${nf(Math.round(e.par / 1000))} kN·m</text>
      <rect x="180" y="14" width="90" height="48" rx="4" fill="none" stroke="${C.dark}" stroke-width="1.2"/>
      ${gearTeeth(210, 38, 16, spin * 1.9, true)}${gearTeeth(245, 38, 11, -spin * 3.2, true)}
      <text x="225" y="10" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">MULTIPLICADORA 1:100,5</text>
      <line x1="270" y1="38" x2="330" y2="38" stroke="${C.dark}" stroke-width="1.2"/>
      <circle cx="340" cy="38" r="14" fill="none" stroke="${C.dark}" stroke-width="1.2"/>${gearTeeth(340, 38, 14, -spin * 3.2, false)}
      <text x="340" y="66" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">FRENO</text>
      <line x1="354" y1="38" x2="420" y2="38" stroke="${C.dark}" stroke-width="1.2"/>
      <rect x="420" y="16" width="70" height="44" rx="4" fill="none" stroke="${C.dark}" stroke-width="1.2"/>
      <rect x="440" y="24" width="30" height="28" fill="none" stroke="${C.accent}" stroke-width="1"/>
      ${gearTeeth(455, 38, 13, -spin * 3.2, true)}
      <text x="455" y="10" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">GENERADOR ${nf(Math.round(e.rpmGen))} rpm</text>
      <rect x="510" y="20" width="46" height="36" rx="3" fill="none" stroke="${C.dark}" stroke-width="1"/>
      <text x="533" y="66" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">TRAFO 690 V</text>
      <line x1="556" y1="38" x2="610" y2="38" stroke="${C.dark}" stroke-width="1.4"/>
      <path d="M610 30 L640 38 L610 46 Z" fill="none" stroke="${C.dark}" stroke-width="1.2"/>
      <text x="655" y="35" font-size="7" fill="${C.mute}" font-family="JetBrains Mono">RED 690 V → 20-66 kV</text>
      <rect x="740" y="14" width="150" height="48" rx="4" fill="${C.accent}" opacity="${s.esGlow ? 0.12 : 0.06}"/>
      <text x="815" y="34" font-size="9" font-weight="700" text-anchor="middle" fill="${s.esGlow ? C.accent : C.dark}" font-family="JetBrains Mono">${nf(Math.round(e.potencia))} kW AHORA</text>
      <text x="815" y="48" font-size="7" text-anchor="middle" fill="${C.mute}" font-family="JetBrains Mono">≈ ${Math.max(0, Math.round(e.potencia / 2000 * 100))} % DE UNA G90</text>
      ${rpmFrac > 0.01 ? `<text x="30" y="12" font-size="7" fill="${C.accent}" font-family="JetBrains Mono">● EN MARCHA</text>` : `<text x="30" y="12" font-size="7" fill="${C.mute}" font-family="JetBrains Mono">○ APARCADA · PALAS EN BANDERA</text>`}`;

    // vistas y toggles
    for (const k of VIEW_KEYS) {
      const v = s.viewOn[k] || 0;
      btn[k].style.background = v > 0.5 ? C.dark : 'rgba(243,238,227,.9)';
      btn[k].style.color = v > 0.5 ? '#f3eee3' : C.dark;
    }
    for (const k of TOGGLES) {
      const on = s[k] > 0.5;
      btn[k].style.background = on ? C.accent : 'rgba(243,238,227,.9)';
      btn[k].style.color = on ? '#f6f1e6' : C.dark;
      btn[k].style.borderColor = on ? C.accent : C.line;
    }

    // llamadas (callouts) sobre la máquina
    let ch = '';
    let lh = '';
    for (const c of s.callouts || []) {
      if (c.o < 0.02) continue;
      const [ax, ay] = c.at;
      const lx = ax + c.dx;
      const ly = ay + c.dy;
      lh += `<g opacity="${c.o.toFixed(2)}"><polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${lx.toFixed(1)},${ly.toFixed(1)} ${(lx + (c.dx < 0 ? -26 : 26)).toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="${C.dark}" stroke-width=".8"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.2" fill="${C.accent}"/></g>`;
      ch += `<div class="call" style="left:${(lx + (c.dx < 0 ? -30 : 30)).toFixed(1)}px;top:${(ly - 8).toFixed(1)}px;opacity:${c.o.toFixed(2)};transform:translateX(${c.dx < 0 ? '-100%' : '0'});text-align:${c.dx < 0 ? 'right' : 'left'}"><b>${c.name}</b><span>${c.sub}</span></div>`;
    }
    callSvg.innerHTML = lh;
    callG.innerHTML = ch;
    pointer(s.cursor);
  };
  return {spots: btn, btn, root: ui, covered, knobAt, update, pointer, renderEspana};
}
