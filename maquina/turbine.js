// El aerogenerador Gamesa G90-2.0 MW construido con código, a escala 1:100 (S = 0,1 unidades/m).
// Dimensiones del manual GD005900 rev. 11 y del folleto G90: rotor 90 m, palas 44 m, buje a 78 m,
// góndola 10,6 × 3,4 × 3,6 m, multiplicadora 1:100,5, generador doblemente alimentado de 690 V.
// update(est, t, ops) posa todo el tren desde una sola entrada: el estado aero (aero.js).
import * as THREE from 'three';
import {G90, estadoAt} from './aero.js';

export const S = 0.1; // unidades por metro
const R = (m) => m * S;
const D2R = Math.PI / 180;

function bladeGeometry() {
  const SEG = 44; // tramos a lo largo de los 44 m
  const K = 10; // puntos por sección
  const pos = [];
  const idx = [];
  const shape = (u) => {
    if (u < 0.07) return {c: 1.9, th: 1.0, tw: 14}; // cilindro de encastre al buje
    const c = 3.36 * Math.pow(1 - u, 0.62) + 0.05;
    return {c, th: c * 0.15, tw: 15.74 * (1 - u) - 1}; // torsión GD005900 §5.2
  };
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const r = (1 + u * (G90.pala - 1)) * S; // 1 m de buje a raíz + 44 m de pala
    const {c, th, tw} = shape(u);
    const t = tw * D2R;
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      const px = Math.cos(a) * c * 0.5;
      const py = Math.sin(a) * th * 0.5 + th * 0.15; // combadura hacia el intradós
      const x = px * Math.cos(t) - py * Math.sin(t);
      const y = px * Math.sin(t) + py * Math.cos(t);
      pos.push(y * S, x * S, r); // cuerda en el plano del rotor (y → tangencial tras girar), espesor según el eje
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let k = 0; k < K; k++) {
      const a = i * K + k;
      const b = i * K + ((k + 1) % K);
      idx.push(a, b, a + K, b, b + K, a + K);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTurbine(P) {
  const group = new THREE.Group();
  const mats = {
    shell: new THREE.MeshPhysicalMaterial({color: P.shell, roughness: 0.42, metalness: 0.05, clearcoat: 0.4, clearcoatRoughness: 0.45, transparent: true}),
    steel: new THREE.MeshStandardMaterial({color: P.steel, roughness: 0.32, metalness: 0.85, transparent: true}),
    cast: new THREE.MeshStandardMaterial({color: P.cast, roughness: 0.55, metalness: 0.7, transparent: true}),
    blade: new THREE.MeshPhysicalMaterial({color: P.blade, roughness: 0.5, metalness: 0.05, clearcoat: 0.3, side: THREE.DoubleSide}),
    copper: new THREE.MeshStandardMaterial({color: P.copper, roughness: 0.35, metalness: 0.9, transparent: true}),
    accent: new THREE.MeshStandardMaterial({color: P.accent, roughness: 0.45, metalness: 0.3, transparent: true}),
    dark: new THREE.MeshStandardMaterial({color: P.dark, roughness: 0.7, metalness: 0.2, transparent: true}),
  };
  const parts = [];
  const add = (geo, mat, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    parts.push(m);
    return m;
  };
  const cyl = (r1, r2, h, mat, parent) => add(new THREE.CylinderGeometry(r1, r2, h, 28, 1), mat, parent);

  // ------------------------------------------------- torre tronco-cónica (78 m, §5.8)
  const towerH = R(G90.buje);
  const tower = cyl(R(2.1), R(1.06), towerH, mats.steel);
  tower.position.y = towerH / 2;
  const base = add(new THREE.CylinderGeometry(R(3.3), R(3.5), R(0.7), 32), mats.cast);
  base.position.y = R(0.35);
  // puerta de acceso
  const door = add(new THREE.BoxGeometry(R(1.2), R(2.2), R(0.25)), mats.dark);
  door.position.set(0, R(1.4), R(2.02));

  // ------------------------------------------------- corona de orientación + 4 motorreductores (§1.1.5)
  const yaw = new THREE.Group();
  yaw.position.y = towerH;
  group.add(yaw);
  const ring = add(new THREE.TorusGeometry(R(1.25), R(0.16), 12, 40), mats.steel, yaw);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = R(0.1);
  for (let i = 0; i < 4; i++) {
    const mo = cyl(R(0.16), R(0.16), R(0.62), mats.accent, yaw);
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    mo.position.set(Math.cos(a) * R(1.45), R(0.38), Math.sin(a) * R(1.45));
    mo.rotation.z = 0; // eje vertical
  }

  // ------------------------------------------------- góndola: bastidor, tren de potencia y carcasa
  const nad = new THREE.Group();
  yaw.add(nad);
  const L = R(G90.gondola[0]); // 10,6 m a lo largo de x (eje del tren)
  // bastidor
  const bed = add(new THREE.BoxGeometry(L * 0.94, R(0.35), R(2.2)), mats.cast, nad);
  bed.position.set(R(0.4), R(0.55), 0);
  // eje principal (forjado, §5.5) sobre dos soportes
  const shaftY = R(1.9);
  const mainShaft = cyl(R(0.42), R(0.42), R(4.6), mats.steel, nad);
  mainShaft.rotation.z = Math.PI / 2;
  mainShaft.position.set(-R(2.0), shaftY, 0);
  for (const x of [-R(3.0), -R(0.9)]) {
    const b = add(new THREE.BoxGeometry(R(0.8), R(1.6), R(1.3)), mats.cast, nad);
    b.position.set(x, shaftY - R(0.75), 0);
    const brg = cyl(R(0.55), R(0.55), R(0.55), mats.copper, nad);
    brg.rotation.z = Math.PI / 2;
    brg.position.set(x, shaftY, 0);
  }
  // multiplicadora: 1 planetaria + 2 etapas paralelas (§5.9)
  const gear = new THREE.Group();
  gear.position.set(R(1.35), shaftY, 0);
  nad.add(gear);
  const gearBox = add(new THREE.BoxGeometry(R(2.2), R(2.2), R(1.8)), mats.cast, gear);
  gearBox.position.x = R(0.1);
  // planetaria visible al abrir: sol, 3 satélites y corona
  const planet = new THREE.Group();
  planet.position.set(-R(0.55), 0, 0);
  gear.add(planet);
  const sun = cyl(R(0.14), R(0.14), R(0.5), mats.accent, planet);
  sun.rotation.z = Math.PI / 2;
  const planets = [];
  for (let i = 0; i < 3; i++) {
    const pg = new THREE.Group();
    const a = (i / 3) * Math.PI * 2;
    pg.position.set(0, Math.cos(a) * R(0.38), Math.sin(a) * R(0.38));
    planet.add(pg);
    const pm = cyl(R(0.12), R(0.12), R(0.42), mats.steel, pg);
    pm.rotation.z = Math.PI / 2;
    planets.push({g: pg, a});
  }
  const ringGear = add(new THREE.TorusGeometry(R(0.52), R(0.09), 8, 32), mats.dark, planet);
  ringGear.rotation.y = Math.PI / 2;
  // eje rápido + freno de disco + acoplamiento flexible (§5.10, §5.12)
  const hsShaft = cyl(R(0.09), R(0.09), R(1.5), mats.steel, gear);
  hsShaft.rotation.z = Math.PI / 2;
  hsShaft.position.set(R(1.6), 0, 0);
  const disc = cyl(R(0.4), R(0.4), R(0.07), mats.steel, gear);
  disc.rotation.z = Math.PI / 2;
  disc.position.set(R(2.1), 0, 0);
  const caliper = add(new THREE.BoxGeometry(R(0.3), R(0.55), R(0.3)), mats.accent, gear);
  caliper.position.set(R(2.1), R(0.25), 0);
  // generador doblemente alimentado de 4 polos (§5.11) + transformador trasero (§1.1.9)
  const gen = cyl(R(0.75), R(0.75), R(1.7), mats.copper, gear);
  gen.rotation.z = Math.PI / 2;
  gen.position.set(R(3.3), 0, 0);
  const genCapL = add(new THREE.SphereGeometry(R(0.75), 24, 14), mats.copper, gear);
  genCapL.position.set(R(3.3) - R(0.85), 0, 0);
  const genCapR = genCapL.clone();
  genCapR.position.x = R(3.3) + R(0.85);
  gear.add(genCapR);
  parts.push(genCapR);
  const trafo = add(new THREE.BoxGeometry(R(1.6), R(1.7), R(1.7)), mats.cast, nad);
  trafo.position.set(R(4.7), R(1.2), 0);
  // convertidor/armario TOP (§1.1.10)
  const cab = add(new THREE.BoxGeometry(R(0.9), R(1.5), R(1.2)), mats.dark, nad);
  cab.position.set(R(4.7), R(1.2), R(1.5));

  // ------------------------------------------------- rotor: buje, cono y tres palas con paso (§1.2)
  const rotor = new THREE.Group();
  rotor.position.set(-R(3.55), shaftY, 0); // buje delante, a barlovento
  nad.add(rotor);
  const hub = add(new THREE.SphereGeometry(R(1.15), 28, 18), mats.cast, rotor);
  hub.scale.set(1.15, 1, 1);
  const cone = add(new THREE.ConeGeometry(R(1.05), R(2.4), 28), mats.blade, rotor);
  cone.rotation.z = Math.PI / 2;
  cone.position.x = -R(1.1);
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    const a = (i / 3) * Math.PI * 2;
    arm.rotation.x = a;
    rotor.add(arm);
    const pitch = new THREE.Group(); // giro de cambio de paso sobre su eje radial (z local)
    arm.add(pitch);
    const blade = add(bladeGeometry(), mats.blade, pitch);
    blade.rotation.x = Math.PI / 2; // la geometría crece en z → radial
    const pb = add(new THREE.CylinderGeometry(R(0.5), R(0.5), R(0.35), 24), mats.accent, arm);
    pb.position.y = -R(0.9);
    blades.push({arm, pitch, a});
  }
  // el eje principal gira con el rotor
  const spinner = rotor;

  // ------------------------------------------------- carcasa de góndola: dos medias cáscaras que se abren
  const cover = new THREE.Group();
  nad.add(cover);
  const shellGeo = (() => {
    const H = R(3.6);
    const x0 = -R(2.5);
    const x1 = R(5.6);
    const shape = new THREE.Shape();
    shape.moveTo(x0, 0);
    shape.quadraticCurveTo(x0 - R(0.6), H * 0.55, x0 + R(0.4), H);
    shape.lineTo(x1 - R(0.8), H);
    shape.quadraticCurveTo(x1 + R(0.2), H, x1, H * 0.6);
    shape.lineTo(x1, 0);
    shape.lineTo(x0, 0);
    return shape;
  })();
  const halfShell = (side) => {
    const g = new THREE.ExtrudeGeometry(shellGeo, {depth: R(1.7), bevelEnabled: false, curveSegments: 24});
    g.translate(0, 0, side > 0 ? 0 : -R(1.7));
    const m = new THREE.Mesh(g, mats.shell);
    m.castShadow = true;
    m.receiveShadow = true;
    cover.add(m);
    parts.push(m);
    return m;
  };
  const shellTop = halfShell(1);
  const shellBottom = halfShell(-1);
  // anemómetro y veleta sobre la góndola (§5.14)
  const mast = cyl(R(0.03), R(0.03), R(0.8), mats.steel, cover);
  mast.position.set(R(4.4), R(4.0), 0);
  const anemo = new THREE.Group();
  anemo.position.set(R(4.4), R(4.45), 0);
  cover.add(anemo);
  const cups = new THREE.Group();
  anemo.add(cups);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const arm2 = cyl(R(0.012), R(0.012), R(0.14), mats.accent, cups);
    arm2.rotation.z = Math.PI / 2;
    arm2.position.set(Math.cos(a) * R(0.07), Math.sin(a) * R(0.07), 0);
    const cup = add(new THREE.SphereGeometry(R(0.035), 10, 8), mats.accent, cups);
    cup.position.set(Math.cos(a) * R(0.14), Math.sin(a) * R(0.14), 0);
  }
  const vane = add(new THREE.BoxGeometry(R(0.25), R(0.012), R(0.06)), mats.accent, anemo);
  vane.position.y = R(0.12);

  shellTop.userData.cover = true;
  shellBottom.userData.cover = true;
  mats.gearGlass = mats.cast.clone();
  mats.gearGlass.depthWrite = false;
  gearBox.material = mats.gearGlass;
  let open = 0;
  const glass = () => {
    // solo la carcasa se vuelve de cristal; la caja de la multiplicadora deja ver la planetaria
    mats.shell.opacity = 1 - 0.92 * open;
    mats.gearGlass.opacity = 1 - 0.8 * open;
    mats.shell.depthWrite = open < 0.05;
    mats.gearGlass.depthWrite = open < 0.05;
  };

  // ------------------------------------------------- update: una entrada, todo el tren
  const update = (est, t, ops = {}) => {
    open = ops.iso ?? 0;
    const ease = 1 - Math.pow(1 - Math.min(1, Math.max(0, open)), 2);
    glass();
    // la carcasa se parte en dos mitades que se separan hacia los lados y se desvanecen
    shellTop.position.set(0, R(0.3) * ease, R(2.6) * ease);
    shellBottom.position.set(0, R(0.3) * ease, -R(2.6) * ease);
    shellTop.visible = shellBottom.visible = mats.shell.opacity > 0.03;
    // giro: el rotor integra el viento (ops.theta lo trae el que llama), el tren lo sigue
    const th = ops.theta ?? 0;
    spinner.rotation.x = -th;
    mainShaft.rotation.x = -th;
    planet.rotation.x = -th;
    for (const p of planets) p.g.rotation.x = th * 1.9 + p.a;
    hsShaft.rotation.x = -th * 3.2;
    disc.rotation.x = -th * 3.2;
    gen.rotation.x = -th * 3.2;
    cups.rotation.z = t * (2 + est.viento * 0.8) * 0.4;
    // cambio de paso: cada pala sobre su eje radial
    const pitchRad = est.paso * D2R;
    for (const b of blades) b.pitch.rotation.y = -pitchRad; // eje radial = y local del grupo
    // orientación lenta a barlovento (el viento viene de -x)
    yaw.rotation.y = Math.sin(t * 0.05) * 0.04;
  };
  return {group, update, parts, mats, rotor, nad, estadoAt, S, R};
}
