# Checklist antes de publicar · Dentro del molino (cci-18)

Revisado el 02-11-2026 contra los datos descargados ese día (`site/data/espana.json`, 09:13 UTC).

## Datos
- [x] Cada cifra tiene fuente, enlace y periodo: panel «España · Red Eléctrica» (REData, enlace y fecha de descarga al pie), potencia instalada (REE Informes del sistema, cierre 2025), ficha del G90 (manual Gamesa GD005900 rev. 11 + folleto G90-2.0 MW, citados en README y en los paneles).
- [x] La licencia de la fuente permite reutilizar: datos abiertos de Red Eléctrica (REData API pública, sin clave) citando fuente y fecha; documentación técnica pública de Gamesa citada, no reproducida.
- [x] No mezclas fuentes que miden cosas distintas en una misma serie: generación y cuotas vienen del mismo endpoint `estructura-generacion` (ámbito nacional). La potencia instalada (peninsular, REE informe) se usa solo para el factor de capacidad y se dice en la web que es peninsular.
- [x] Has filtrado valores imposibles y cuentas cuántos descartas: `validar_mix()` exige eólica anual entre 50 y 70 TWh, cuotas que sumen 100 ± 1,5 y serie diaria ≥ 350 días. Registros descartados: **0** (`descartes: 0` en el JSON; REData entrega agregados por tecnología, no registros individuales).
- [x] Los totales cuadran y no hay territorios contados dos veces: «Generación total» 272.321.311 MWh es la fila de REData; la suma de tecnologías coincide (comprobado en el sondeo del 02-11-2026). Las cuotas de las 16 tecnologías suman 100,0 %.
- [x] Las cifras de los titulares coinciden con la fuente original: 58.756.339 MWh eólicos · 21,6 % (REData); el Informe del Sistema Eléctrico 2025 de REE publica 58.801 GWh · 21,6 % (dato con fecha de cierre distinta; la web usa el de la API, con su fecha de descarga).

## Automatización
- [x] El script valida los datos y NO publica si algo falla: `scripts/actualizar.py` termina con `SystemExit` y la Action no despliega.
- [x] La web muestra la fecha de la última actualización: pie del panel de España y portada móvil.
- [x] Hay aviso cuando la fuente publica un periodo nuevo o cambia el formato: un cambio de formato rompe `por_tecnologia()` → la Action falla en rojo (aviso de GitHub). La potencia instalada es constante hasta el siguiente informe anual de REE (nota en README).

## Responsabilidad
- [x] Sin datos personales de particulares: la fuente solo publica agregados por tecnología.
- [x] Lenguaje neutral: ficha técnica y lecturas; sin valoraciones.
- [x] Explicas la metodología y sus límites: README (curva de potencia reconstruida del gráfico del folleto = estimación; factor de capacidad = generación nacional / (potencia peninsular × 8.760 h); «cuántos G90» derivado de esos dos números; Weibull calibrado al factor observado).
- [x] Hay una vía para pedir rectificaciones: issues del repositorio público.
- [x] Si señalas a organismos o empresas concretas: solo se cita a Red Eléctrica y a Gamesa (Siemens Gamesa) como fuentes de datos públicos; sin aviso legal necesario.

## Web
- [x] Revisión visual en escritorio (1440) y móvil (390) con `maquina/qa.mjs` en Chrome real: capturas en `teardown-out/qa/`.
- [x] Sin errores de consola ni desbordamiento horizontal: `qa.mjs` → «consola limpia» en ambos tamaños.
- [x] Funciona en modo oscuro y es legible: la hoja tiene colores fijos (papel claro sobre estudio claro), no depende del esquema del sistema.
