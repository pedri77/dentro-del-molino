#!/usr/bin/env python3
"""Descarga datos oficiales de generación eólica de España (Red Eléctrica, REData API)
y genera site/data/*.json para la web.

Fuentes:
- REData API (https://apidatos.ree.es), sin clave, datos abiertos de Red Eléctrica.
  Ámbito: sistema eléctrico español (nacional, incluye sistemas no peninsulares).
- Potencia eólica instalada a 31.12.2025: REE, Informes del Sistema Eléctrico
  (cifra provisional, constante hasta que REE publique el cierre anual siguiente).

El script valida los datos y NO publica si algo falla (mejor datos de ayer que datos rotos).
"""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://apidatos.ree.es/es/datos/generacion/estructura-generacion"

FUENTE = {
    "nombre": "Red Eléctrica de España (REData API)",
    "url_api": API,
    "url_web": "https://www.ree.es/es/datos/generacion/estructura-generacion",
    "licencia": "Datos abiertos de Red Eléctrica; reutilización citando fuente y fecha",
}
# Cierre 2025 (REE, Informe del Sistema Eléctrico 2025, provisional a enero 2026):
POTENCIA_EOLICA_MW = 32593  # peninsular, a 31.12.2025
POTENCIA_URL = "https://www.sistemaelectrico-ree.es/es/informe-del-sistema-electrico/potencia-instalada"
GEN_2025_URL = API + "?start_date=2025-01-01T00:00&end_date=2025-12-31T23:59&time_trunc=year"

DESCARTES = 0  # REData publica agregados por tecnología: sin datos personales, sin registros descartables


def descargar(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "dentro-del-molino/1.0 (observatorio CCI-18)"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def por_tecnologia(doc):
    """Devuelve {tecnología: [(fecha_iso, valor, porcentaje)]}."""
    out = {}
    for t in doc["included"]:
        out[t["type"]] = [(v["datetime"][:10], v["value"], v.get("percentage"))
                          for v in t["attributes"]["values"]]
    return out


def anual() -> dict:
    anios = por_tecnologia(descargar(GEN_2025_URL))
    total = anios["Generación total"][0][1]
    return {
        "periodo": "2025 (año natural)",
        "total_sistema_mwh": round(total),
        "fuente": GEN_2025_URL,
        "mix": {t: {"mwh": round(v[0][1]), "cuota_pct": round(v[0][2] * 100, 1)}
                for t, v in anios.items() if t != "Generación total"},
    }


def diario(desde: str, hasta: str) -> dict:
    url = f"{API}?start_date={desde}T00:00&end_date={hasta}T23:59&time_trunc=day"
    dias = por_tecnologia(descargar(url))
    eol = {f: v for f, v, _ in dias["Eólica"]}
    tot = {f: v for f, v, _ in dias["Generación total"]}
    return eol, tot


def validar_mix(anio: dict) -> None:
    mix = anio["mix"]
    eol = mix["Eólica"]
    if not 50_000_000 < eol["mwh"] < 70_000_000:
        raise SystemExit(f"Cuota eólica anual imposible: {eol}")
    suma_pct = round(sum(x["cuota_pct"] for x in mix.values()), 0)
    if abs(suma_pct - 100) > 1.5:
        raise SystemExit(f"Cuotas del mix no suman 100: {suma_pct}")


def main() -> int:
    hoy = datetime.now(timezone.utc).date()
    anio = anual()
    validar_mix(anio)

    # Serie diaria: últimos 400 días en dos tramos de año natural.
    inicio = hoy - timedelta(days=400)
    eol, tot = {}, {}
    for a in range(inicio.year, hoy.year + 1):
        d0 = max(inicio, datetime(a, 1, 1).date())
        d1 = min(hoy - timedelta(days=2), datetime(a, 12, 31).date())
        if d0 > d1:
            continue
        e, t = diario(str(d0), str(d1))
        eol.update(e)
        tot.update(t)

    dias = sorted(eol)
    if len(dias) < 350:
        raise SystemExit(f"Serie diaria demasiado corta: {len(dias)} días")

    def cuota(d):
        return round(eol[d] / tot[d] * 100, 1) if tot.get(d) else None

    record = max(dias, key=lambda d: eol[d])
    minimo = min(dias, key=lambda d: eol[d])
    ultimo = dias[-1]
    valores = [eol[d] for d in dias]
    media = sum(valores) / len(valores)
    var_pct = round((max(valores) - min(valores)) / media * 100, 0)

    # Factor de capacidad 2025: generación nacional / (potencia peninsular × 8760 h).
    # Nota metodológica: la potencia creció durante el año; REE no publica la potencia
    # media del parque en la API, así que este factor es un mínimo razonable.
    factor = round(anio["mix"]["Eólica"]["mwh"] / (POTENCIA_EOLICA_MW * 8760) * 100, 1)
    # Aerogeneradores G90-2.0 MW equivalentes para la generación anual:
    g90 = round(anio["mix"]["Eólica"]["mwh"] / (2000 * 8760 * factor / 100 * 0.2058 / 0.2058) )  # placeholder

    out_dir = ROOT / "site" / "data"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "espana.json").write_text(json.dumps({
        "titulo": "España, con datos de Red Eléctrica",
        "descargado": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "fuente": FUENTE,
        "anual": anio,
        "potencia_eolica_mw": POTENCIA_EOLICA_MW,
        "potencia_fuente": {"url": POTENCIA_URL, "fecha": "cierre 2025, provisional a enero 2026"},
        "factor_capacidad_pct": factor,
        "ultimo_dato": {"fecha": ultimo, "mwh": round(eol[ultimo]), "cuota_pct": cuota(ultimo)},
        "record_diario": {"fecha": record, "mwh": round(eol[record]), "cuota_pct": cuota(record)},
        "minimo_diario": {"fecha": minimo, "mwh": round(eol[minimo]), "cuota_pct": cuota(minimo)},
        "variabilidad_pct_sobre_media": var_pct,
        "descartes": DESCARTES,
        "serie_diaria": [{"fecha": d, "mwh": round(eol[d]), "cuota_pct": cuota(d)} for d in dias],
    }, ensure_ascii=False), encoding="utf-8")
    print(f"OK: eólica 2025 {anio['mix']['Eólica']['mwh']} MWh "
          f"({anio['mix']['Eólica']['cuota_pct']} %); último día {ultimo} {round(eol[ultimo])} MWh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
