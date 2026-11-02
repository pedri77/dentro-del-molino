#!/usr/bin/env node
// Genera espana-fallback.js desde site/data/espana.json del repo dentro-del-molino: los valores de
// respaldo que la página lleva embebidos por si el JSON no carga. Sin la serie diaria (pesa).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2] || path.resolve(HERE, '../../dentro-del-molino/site/data/espana.json');
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
delete d.serie_diaria;
const out = `// Generado por respaldo.mjs desde ${path.basename(src)} (${d.descargado}). No editar a mano.\nexport const FALLBACK_ES = ${JSON.stringify(d, null, 1)};\n`;
fs.writeFileSync(path.join(HERE, 'espana-fallback.js'), out);
console.log('espana-fallback.js ←', src, d.descargado);
