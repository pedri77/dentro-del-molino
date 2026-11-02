#!/usr/bin/env node
// Compila molino-live con el kit teardown, ajusta <head> (idioma, título, descripción, tarjeta
// social) y deja el HTML en dentro-del-molino/site/index.html. Uso:
//   node molino-shared/publicar.mjs   (desde ~/Dev/Claude_proyectos/Claude/teardown)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SKILL = path.join(os.homedir(), '.agents/skills/teardown');
const REPO = path.resolve(ROOT, '../dentro-del-molino');

execFileSync('node', [path.join(SKILL, 'sims/build.mjs'), path.join(ROOT, 'molino-live')], {stdio: 'inherit', cwd: ROOT});
let html = fs.readFileSync(path.join(ROOT, 'teardown-out/dist/molino-live.html'), 'utf8');
const HEAD = `<title>Dentro del molino · el viento, primera fuente de electricidad de España</title>
<meta name="description" content="Desmonta en 3D un aerogenerador Gamesa G90-2.0 MW y mira cómo el viento se convierte en electricidad, con datos oficiales de Red Eléctrica. Episodio cci-18 de «Construido con IA» (IAcademy).">
<meta property="og:title" content="Dentro del molino · el viento, primera fuente de electricidad de España">
<meta property="og:description" content="Un aerogenerador real que se puede desmontar en 3D, con los datos de la eólica en España de Red Eléctrica.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://pedri77.github.io/dentro-del-molino/">
<meta property="og:image" content="https://pedri77.github.io/dentro-del-molino/portada.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%276%27 fill=%27%23d0592a%27/%3E%3C/svg%3E">`;
html = html.replace('<html lang="en">', '<html lang="es">').replace(/<title>[^<]*<\/title>/, HEAD);
if (!html.includes('og:image')) throw new Error('no se pudo parchear el <head>');
fs.mkdirSync(path.join(REPO, 'site'), {recursive: true});
fs.writeFileSync(path.join(REPO, 'site/index.html'), html);
// el código de la máquina, visible en el repo (CCI-R7)
const M = path.join(REPO, 'maquina');
fs.mkdirSync(M, {recursive: true});
for (const f of fs.readdirSync(HERE)) if (/\.(js|mjs|py)$/.test(f)) fs.copyFileSync(path.join(HERE, f), path.join(M, f));
fs.copyFileSync(path.join(ROOT, 'molino-live/main.js'), path.join(M, 'main-live.js'));
fs.copyFileSync(path.join(ROOT, 'molino-film/main.js'), path.join(M, 'main-film.js'));
fs.copyFileSync(path.join(ROOT, 'molino-film/timeline.json'), path.join(M, 'timeline.json'));
console.log('site/index.html', (html.length / 1024).toFixed(0), 'KB →', REPO);
