// La física del aerogenerador Gamesa G90-2.0 MW. Una sola entrada — la velocidad del viento (m/s) —
// y de ella salen la potencia, el par, las rpm del rotor y del generador, el ángulo de paso y el Cp.
// Todos los números de la ficha son del fabricante (manual GD005900 rev. 11 y folleto G90-2.0 MW);
// la curva de potencia se reconstruye por lectura del gráfico del folleto (estimación razonada).

export const G90 = {
  modelo: 'Gamesa G90-2.0 MW',
  rotorD: 90,          // m — manual GD005900 §5.1
  area: 6361.7,        // m² barridos — GD005900 §5.1
  pala: 44,            // m — GD005900 §5.2
  cuerdaMax: 3.36,     // m — GD005900 §5.2
  buje: 78,            // m de altura (opción estándar) — GD005900 §5.8
  gondola: [10.6, 3.4, 3.6], // m — GD005900 §5.3
  vArranque: 3,        // m/s — folleto G90 (curva de potencia)
  vNominal: 14,        // m/s donde alcanza 2 MW — folleto
  vCorte: 21,          // m/s — folleto
  pNominal: 2000,      // kW — GD005900 §5.11
  rpmRotor: [9, 19],   // rpm — GD005900 §5.1
  rpmGen: [900, 1900], // rpm — GD005900 §5.11 (1.680 en nominal)
  ratio: 100.5,        // multiplicadora 50 Hz — GD005900 §5.9
  genTension: 690,     // V — GD005900 §5.11
  polos: 4,
  pasoMin: -5,         // grados — GD005900 §1.2.5
  pasoBandera: 87,     // grados — GD005900 §1.2.5
  masas: {torre78: 200, gondola: 65, rotor: 39.4}, // t — folleto G90
  rho: 1.225,          // kg/m³ — densidad de la curva del folleto
  betz: 0.593,
};

// Curva reconstruida del gráfico del folleto G90-2.0 MW (lectura aproximada del PDF, kW a m/s).
export const CURVA = [
  [3, 0], [3.5, 18], [4, 55], [4.5, 100], [5, 160], [5.5, 240], [6, 330], [6.5, 430],
  [7, 560], [7.5, 690], [8, 830], [8.5, 980], [9, 1130], [9.5, 1280], [10, 1430],
  [10.5, 1550], [11, 1670], [11.5, 1760], [12, 1850], [12.5, 1910], [13, 1960],
  [13.5, 1990], [14, 2000], [21, 2000],
];

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ss = (a, b, t) => smoother((t - a) / (b - a));

/** Potencia eléctrica (kW) para un viento v (m/s). */
export function potenciaAt(v) {
  if (v < G90.vArranque || v > G90.vCorte) return 0;
  const C = CURVA;
  let lo = 0;
  let hi = C.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (C[m][0] <= v) lo = m;
    else hi = m;
  }
  const k = (v - C[lo][0]) / (C[hi][0] - C[lo][0]);
  return C[lo][1] + (C[hi][1] - C[lo][1]) * k;
}

/** rpm del rotor: 9 en el arranque, 19 desde la nominal (velocidad variable, GD005900 §1.4). */
export function rpmAt(v) {
  if (v < G90.vArranque || v > G90.vCorte) return 0;
  return G90.rpmRotor[0] + (G90.rpmRotor[1] - G90.rpmRotor[0]) * ss(G90.vArranque, G90.vNominal, v);
}

/** Ángulo de paso (grados): fino por debajo de la nominal, pone las palas en bandera al parar. */
export function pasoAt(v) {
  if (v < G90.vArranque) return G90.pasoBandera;      // aparcada en bandera
  if (v > G90.vCorte) return G90.pasoBandera;         // freno aerodinámico
  if (v < G90.vNominal - 1) return 0;                 // máxima potencia
  return 22 * ss(G90.vNominal - 1, G90.vCorte, v);    // limita potencia sobre la nominal
}

export function estadoAt(v) {
  const p = potenciaAt(v);
  const rpm = rpmAt(v);
  const paso = pasoAt(v);
  const omega = (rpm / 60) * Math.PI * 2;
  const par = omega > 0.01 ? (p * 1000) / omega : 0; // N·m en el eje lento
  const vientoUtil = Math.max(v, 0.1);
  const disp = 0.5 * G90.rho * G90.area * vientoUtil ** 3 / 1000; // kW disponibles en el disco
  const cp = disp > 1 ? p / disp : 0;
  return {viento: v, potencia: p, rpm, rpmGen: rpm * G90.ratio, paso, par, cp, disp};
}

/** Energía anual (MWh/año) de una G90 bajo un Weibull (k=2) calibrado con el factor de
 *  capacidad observado en España en 2025 (20,6 %, REE): A = 6,2 m/s a altura de buje. */
export function energiaAnual(A = 6.2, k = 2) {
  let e = 0;
  const dv = 0.25;
  for (let v = 0; v <= 30; v += dv) {
    const w = (k / A) * (v / A) ** (k - 1) * Math.exp(-((v / A) ** k));
    e += potenciaAt(v) * w * dv;
  }
  return e * 8.766; // kWh -> MWh/año (horas al año / 1000)
}
