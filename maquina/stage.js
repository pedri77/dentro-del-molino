// El estudio del aerogenerador: cielo claro y páramo pálido, el molino a 1:100 con su sombra larga.
// PBR con sombras VSM y GTAO (el suelo fuera del pase de AO), tinta de contorno para piecitas claras
// y viento visible: filetes que cruzan el cuadro a la altura del buje. frame(est, cam) dibuja un
// fotograma desde el estado aero y la cámara; render queda en manos de quien llama.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {buildTurbine} from './turbine.js';

const V3 = THREE.Vector3;
export const PALETTE = {
  bg: '#dfe6ea',
  sky: ['#b9cdd9', '#e8edee'],
  ground: '#c9c3ae',
  env: {bg: '#dfe6ea', ground: '#b9bfa8', k: 0.9},
  hemi: ['#e8f0f4', '#a8a290', 0.75],
  shadow: ['#5b6b74', 0.3],
  shell: '#f2f1ec',
  steel: '#9aa3ab',
  cast: '#5d656d',
  blade: '#f4f3ef',
  copper: '#c98a4b',
  accent: '#d0592a',
  dark: '#3a4147',
  streak: '#8fa3ad',
};

const INK_FRAG = `
  uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNormal;
  uniform float uNear; uniform float uFar; uniform vec2 uPx; uniform vec3 uInk; uniform float uStrength;
  varying vec2 vUv;
  float lz(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
  vec3 nn(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float z0 = lz(vUv);
    float zl = lz(vUv - vec2(uPx.x, 0.0)), zr = lz(vUv + vec2(uPx.x, 0.0));
    float zd = lz(vUv - vec2(0.0, uPx.y)), zu = lz(vUv + vec2(0.0, uPx.y));
    float lap = (abs(zl + zr - 2.0 * z0) + abs(zu + zd - 2.0 * z0)) / max(z0, 1e-3);
    float eD = smoothstep(0.004, 0.016, lap);
    vec3 n0 = nn(vUv);
    float eN = max(max(1.0 - dot(n0, nn(vUv - vec2(uPx.x, 0.0))), 1.0 - dot(n0, nn(vUv + vec2(uPx.x, 0.0)))),
                   max(1.0 - dot(n0, nn(vUv - vec2(0.0, uPx.y))), 1.0 - dot(n0, nn(vUv + vec2(0.0, uPx.y)))));
    float e = max(eD, smoothstep(0.3, 0.6, eN));
    c.rgb = mix(c.rgb, uInk, e * uStrength);
    gl_FragColor = c;
  }`;

const GROUND_VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const GROUND_FRAG = `uniform vec3 uG; uniform vec3 uBg; uniform vec3 uC; varying vec3 vW;
  void main(){
    float d = length(vW.xz - uC.xz);
    float h = smoothstep(26.0, 60.0, d);
    vec3 c = mix(uG, uBg, h);
    gl_FragColor = vec4(c, 1.0);
  }`;

// filetes de viento: trazos finos que cruzan horizontalmente a la altura del buje
const STREAK_VERT = `attribute vec3 aSeed; uniform float uT; uniform float uFlow; uniform vec3 uC; uniform float uPr; uniform float uAmt; varying float vA;
  void main(){
    float span = 22.0;
    float x = mod(aSeed.x * span + uFlow * (1.2 + aSeed.y * 0.8), span) - span * 0.5;
    float y = 6.2 + aSeed.z * 2.4 - 1.2;
    float z = (fract(aSeed.y * 7.31 + uT * 0.015) - 0.5) * 9.0;
    vec3 p = vec3(uC.x + x, y + sin(uT * (0.6 + aSeed.z) + aSeed.x * 9.0) * 0.35, uC.z + z);
    float life = sin(3.14159 * fract(aSeed.x * 5.77 + uT * 0.22 + aSeed.z));
    vA = uAmt * smoothstep(0.0, 0.25, life) * smoothstep(1.0, 0.6, life);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.5 + aSeed.y) * 1.1 * uPr * 60.0 / max(1.0, -mv.z);
  }`;
const STREAK_FRAG = `uniform vec3 uCol; varying float vA;
  void main(){ vec2 c = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(c))) * vA * 0.5; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a); }`;

export function createMolinoStage({canvas, ink = 0.55}) {
  const P = PALETTE;
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.bg);
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, P.sky[0]);
    gr.addColorStop(0.55, P.sky[1]);
    gr.addColorStop(1, P.sky[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog(P.bg, 30, 70);
  const camera = new THREE.PerspectiveCamera(22, 16 / 9, 0.05, 220);
  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8});
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({radius: 0.6, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  let isoNow = 0;
  const groundAO = (v) => () => {
    floor.visible = v;
    shade.visible = v;
    streaks.visible = v;
    // la carcasa de cristal no entra en el pase de AO: taparía el tren con una sombra fantasma
    if (isoNow > 0.05) for (const m of turbine.parts) if (m.userData.cover) m.visible = v && turbine.mats.shell.opacity > 0.03;
  };
  composer.addPass(new Toggle(groundAO(false)));
  let aoOn = true;
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (r, w, rb, ...rest) => {
    if (aoOn) return gtaoRender(r, w, rb, ...rest);
    gtao._overrideVisibility();
    gtao._renderOverride(r, gtao.normalMaterial, gtao.normalRenderTarget, 0x7777ff, 1.0);
    gtao._restoreVisibility();
  };
  composer.addPass(gtao);
  composer.addPass(new Toggle(groundAO(true)));
  const inkPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: {value: null},
        tDepth: {value: gtao.depthTexture},
        tNormal: {value: gtao.normalTexture},
        uNear: {value: camera.near},
        uFar: {value: camera.far},
        uPx: {value: new THREE.Vector2(1 / 1920, 1 / 1080)},
        uInk: {value: new THREE.Color().setRGB(0.07, 0.06, 0.055, THREE.LinearSRGBColorSpace)},
        uStrength: {value: ink},
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: INK_FRAG,
    }),
  );
  inkPass.enabled = ink > 0;
  composer.addPass(inkPass);
  composer.addPass(new OutputPass());

  // estudio: cajas de luz frías
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color(P.env.bg);
    const box = (w, h, pos, k, tint = [1, 0.985, 0.95]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(16, 7, new V3(-12, 11, 9), 3.0, [0.97, 0.99, 1.0]);
    box(10, 10, new V3(11, 14, -7), 2.2);
    box(20, 3, new V3(2, 5, 17), 1.7);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: P.env.ground, side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -1.5;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture;
    scene.environmentIntensity = P.env.k;
    pm.dispose();
  }
  const SUN_DIR = new V3(-0.55, 0.66, 0.52).normalize();
  const sun = new THREE.DirectionalLight('#fff7ec', 2.4);
  sun.castShadow = true;
  const EXT = 6.0;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.5, far: 40});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 7;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.003;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(...P.hemi));

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: {uG: {value: new THREE.Color(P.ground)}, uBg: {value: new THREE.Color(P.bg)}, uC: {value: new V3()}},
    toneMapped: false,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({color: P.shadow[0], opacity: P.shadow[1], fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.0004;
  shade.receiveShadow = true;
  scene.add(shade);

  const turbine = buildTurbine(P);
  scene.add(turbine.group);

  // filetes de viento
  const NS = 2600;
  const streakGeo = new THREE.BufferGeometry();
  {
    const seed = new Float32Array(NS * 3);
    let r = 91;
    const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < NS * 3; i++) seed[i] = rnd();
    streakGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    streakGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
  }
  const streakMat = new THREE.ShaderMaterial({
    vertexShader: STREAK_VERT,
    fragmentShader: STREAK_FRAG,
    uniforms: {uT: {value: 0}, uFlow: {value: 0}, uC: {value: new V3()}, uPr: {value: 1}, uAmt: {value: 0}, uCol: {value: new THREE.Color(P.streak)}},
    transparent: true,
    depthWrite: false,
  });
  const streaks = new THREE.Points(streakGeo, streakMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 4;
  scene.add(streaks);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    streakMat.uniforms.uPr.value = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    inkPass.material.uniforms.uPx.value.set(1 / (w * pr), 1 / (h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const tmp = new V3();
  const right = new V3().crossVectors(new V3(0, 1, 0), SUN_DIR).normalize();
  const upL = new V3().crossVectors(SUN_DIR, right);
  let texel = (2 * EXT) / sun.shadow.mapSize.x;

  // ops: theta (ángulo del rotor integrado), iso, flow
  const frame = (est, t, cam, ops = {}) => {
    isoNow = ops.iso ?? 0;
    turbine.update(est, t, ops);
    streakMat.uniforms.uT.value = t;
    streakMat.uniforms.uFlow.value = ops.flow ?? 0;
    streakMat.uniforms.uAmt.value = Math.min(1, Math.max(0, (est.viento - 4) / 8)) * 0.5;

    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.cos(az), ty + d * Math.sin(el), tz - d * Math.cos(el) * Math.sin(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    streakMat.uniforms.uC.value.set(tx, 0, tz);
    groundMat.uniforms.uC.value.set(tx, 0, tz);
    floor.position.x = shade.position.x = Math.round(tx);
    floor.position.z = shade.position.z = Math.round(tz);
    tmp.set(0, 4.5, 0);
    const rr = Math.round(tmp.dot(right) / texel) * texel;
    const uu = Math.round(tmp.dot(upL) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(rr).addScaledVector(upL, uu).addScaledVector(SUN_DIR, tmp.dot(SUN_DIR));
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 20);
    sun.target.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    if (pv.z > 1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, shadow, blur, radius, ao, pcf, streaks: ns}) => {
    if (samples !== undefined) {
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    }
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      texel = (2 * EXT) / shadow;
    }
    if (blur !== undefined) sun.shadow.blurSamples = blur;
    if (radius !== undefined) sun.shadow.radius = radius;
    if (ao !== undefined) {
      aoOn = ao > 0;
      gtao.needsSwap = aoOn;
      if (aoOn) {
        gtao.updateGtaoMaterial({samples: ao});
        gtao.updatePdMaterial({samples: Math.max(4, ao)});
      }
    }
    if (pcf !== undefined) {
      const type = pcf ? THREE.PCFSoftShadowMap : THREE.VSMShadowMap;
      if (renderer.shadowMap.type !== type) {
        renderer.shadowMap.type = type;
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
        scene.traverse((o) => {
          if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true;
        });
      }
    }
    if (ns !== undefined) streakGeo.setDrawRange(0, ns);
  };
  return {renderer, scene, camera, turbine, composer, gtao, inkPass, sun, resize, frame, size, project, setQuality};
}
