# Dentro del molino · el viento, primera fuente de electricidad de España

Web interactiva del episodio **cci-18** de la serie [«Construido con IA»](https://iacedemy.com/free/yt/construido-con-ia/) (IAcademy): un aerogenerador **Gamesa G90-2.0 MW** que se puede desmontar en 3D y cuyos paneles leen datos oficiales de la eólica en España publicados por Red Eléctrica.

**Ver:** <https://pedri77.github.io/dentro-del-molino/>

## Qué se ve

- Un desmontaje 3D del aerogenerador: torre, góndola abrible, buje y palas con ángulo de paso, eje lento, multiplicadora, eje rápido, freno, generador y sistema de orientación.
- **Una sola entrada**: el deslizador de velocidad del viento. rpm, paso, par y potencia salen del mismo modelo que posa las piezas (curva de potencia del folleto de Gamesa, física P = ½·ρ·A·v³·Cp, límite de Betz 59,3 %).
- Panel **«España · Red Eléctrica»**: generación eólica 2025 y cuota en el mix, potencia instalada, factor de capacidad, último dato diario, récord y día más flojo, con fecha de descarga y enlaces a la fuente en cada dato.

## Datos y fuentes

| Dato | Valor | Fuente | Fecha |
|---|---|---|---|
| Eólica 2025 (España) | 58.756.339 MWh · 21,6 % | [REData API, estructura de generación](https://www.ree.es/es/datos/generacion/estructura-generacion) (el [Informe del Sistema Eléctrico 2025](https://www.sistemaelectrico-ree.es/sites/default/files/informes/2026/ise-2025.pdf) publica 58.801 GWh · 21,6 %) | descarga diaria |
| Mix 2025 (nuclear, solar, ciclo…) | REData, mismo endpoint | REData API | descarga diaria |
| Eólica 2025 (peninsular) | 57.383.154 MWh | REData, mismo endpoint con `geo_limit=peninsular&geo_ids=8741` | descarga diaria |
| Potencia eólica instalada | 32.593 MW (peninsular, 31.12.2025) | [REE, Informes del sistema eléctrico](https://www.sistemaelectrico-ree.es/es/informe-del-sistema-electrico/potencia-instalada) | cierre 2025 (provisional, ene. 2026) |
| Ficha del aerogenerador | rotor 90 m, palas 44 m, 9–19 rpm, 1:100,5, 690 V… | Manual Gamesa GD005900 rev. 11 y folleto G90-2.0 MW | — |
| Curva de potencia | arranque 3 · nominal 14 · corte 21 m/s | Folleto G90 (lectura del gráfico: **estimación razonada**) | — |

**Ámbitos:** la generación y las cuotas del mix son nacionales (sistema eléctrico español). El factor de capacidad y «cuántos G90» usan el ámbito **peninsular** en numerador y denominador: 57.383 GWh ÷ (32.593 MW × 8.760 h) = 20,1 %, de ahí ≈ 16.290 G90. Mezclar la generación nacional con la potencia peninsular daría 20,6 %, y se evita.

La API de potencia instalada de REData (`generacion/potencia-instalada`) devolvía error 500 en noviembre de 2026, así que la potencia instalada es un dato constante del cierre 2025 citado al informe anual; se actualizará cuando REE publique el cierre siguiente.

**Sin datos de personas físicas**: REData publica agregados por tecnología; no hay registros individuales y el parser no descarta ninguno (`descartes: 0` en el JSON).

## Cómo se actualiza

Una GitHub Action diaria (06:00 UTC) ejecuta `scripts/actualizar.py`: descarga el año natural y los últimos 400 días de la REData API, valida rangos (cuotas que sumen 100, serie ≥ 350 días, eólica anual entre 50 y 70 TWh) y escribe `site/data/espana.json`. Si la validación falla, **no publica**: la web queda con los últimos datos buenos (y con valores de respaldo embebidos en el build si el JSON no carga). La página se despliega en GitHub Pages desde `site/`.

## El simulador 3D

La máquina está construida con el kit [teardown](https://github.com/elvarofficial/teardown) (MIT) sobre [claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT): una página HTML autocontenida (< 1 MB) con three.js, sombras VSM, oclusión ambiental y visita automática que cede el control al visitante. Código de la máquina en `maquina/` (aero.js = física, turbine.js = geometría, console.js = paneles).

## Licencias

- Código de este repositorio: MIT (créditos a **teardown** y **claude-motion**, MIT).
- Datos: Red Eléctrica de España, reutilización citando fuente y fecha.
- Ficha técnica: documentación pública de Gamesa (manual GD005900 y folleto G90-2.0 MW).
