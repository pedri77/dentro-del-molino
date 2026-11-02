"""Banda sonora de la película «Dentro del molino»: una cama cálida tenue (Dmaj9, 76 bpm), aire que
sube cuando el operador abre el viento (6 → 13,5 m/s), un «whoosh» por cada paso de pala delante de
la torre (tres por vuelta, de la misma integral de rpm que mueve el rotor), un zumbido de generador
que crece con las rpm y un clic por cada botón de la visita.

    python run_sfx.py molino-shared/score.py

Tiempos de molino-shared/film.js (SCRIPT) y molino-film/timeline.json; el modelo de rpm es el de aero.js.
"""

import math
import os

from sfx.score_kit import airy, bed, chords, hz, motor, thud
from sfx.synth import click

TIMELINE = "../molino-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "molino-score.wav")
TARGET_LUFS = -14.0
SEED = 18

CHORDS = chords("Dmaj9:D2 A2 F#3 C#4 E4/D1", "Bm9:B1 F#2 D3 A3 C#4/B0", "Gmaj7:G1 D2 B2 F#3/G0", "A6sus:A1 D2 E2 F#2 B2/A0")
MOTIF = [(0.5, hz("A4")), (1.5, hz("F#4")), (2.5, hz("E4"))]

CLICKS = (3.4, 11.0, 12.8, 15.6, 19.2, 22.6)
WIND_EV = (11.0, 6.0, 13.5, 2.2)  # t0, de, a, duración
V_IN, V_NOM, V_OUT = 3.0, 14.0, 21.0


def smoother(x):
    u = min(1.0, max(0.0, x))
    return u * u * u * (u * (u * 6 - 15) + 10)


def ss(a, b, t):
    return smoother((t - a) / (b - a))


def wind_at(t):
    t0, w0, w1, dur = WIND_EV
    return w0 + (w1 - w0) * ss(t0, t0 + dur, t) + 0.3 * math.sin(t * 0.9) * ss(0.5, 2, t)


def rpm_at(v):
    if v < V_IN or v > V_OUT:
        return 0.0
    return 9 + 10 * ss(V_IN, V_NOM, v)


def blade_passes(dur, dt=1 / 240):
    """Instantes en que una pala pasa por abajo: tres por vuelta del rotor."""
    th, t, out, prev = 0.0, -16.0, [], None
    while t <= dur:
        k = math.floor(th * 3 / (2 * math.pi))
        if prev is not None and k != prev and t >= 0:
            out.append(t)
        prev = k
        th += rpm_at(wind_at(t + dt / 2)) / 60 * 2 * math.pi * dt
        t += dt
    return out


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 76, CHORDS, MOTIF, motif_voice="epiano", kicks=(0,), snares=(), hats=0, swing=0.0, keys_vel=0.55, keys_lp=3000)
    mix.put_stereo(0, left, right, 0.10)
    mix.put(0, low, 0.10)

    # aire: una respiración baja todo el rato, una ráfaga en la subida del deslizador, cama más fuerte después
    mix.put(0, airy(WIND_EV[0] + 0.6, 320, 480, 0.5), 0.014)
    mix.put(WIND_EV[0], airy(WIND_EV[3] + 1.2, 420, 1700, 0.7), 0.045)
    mix.put(WIND_EV[0] + WIND_EV[3], airy(dur - WIND_EV[0] - WIND_EV[3], 600, 760, 0.6), 0.03)

    # paso de pala: un soplo corto, más intenso con más viento
    for t in blade_passes(dur):
        if t < dur - 0.5:
            lvl = 0.02 + 0.03 * ss(6, 13.5, wind_at(t))
            mix.put(t, airy(0.42, 900, 300, 0.8), lvl)

    # generador: un zumbido que sube con las rpm desde que se abre la góndola (lo oímos de cerca)
    for seg_t in range(3, int(dur) - 1):
        v = wind_at(seg_t + 0.5)
        f0 = 60 + 60 * rpm_at(v) / 19
        lvl = 0.006 + 0.012 * ss(5, 13, v)
        mix.put(seg_t, motor(1.05, f0=f0, grit_hz=1200, wobble=9), lvl)

    for t in CLICKS:
        mix.put(t, click(2400, 0.025), 0.055)
    # abrir la góndola: un golpe seco de carcasa; cerrarla a 15,6: otro más suave
    mix.put(3.5, thud(140, 0.05, 0.35), 0.06)
    mix.put(15.7, thud(120, 0.04, 0.3), 0.04)
    # el panel de España se enciende
    mix.put(22.7, airy(1.2, 1200, 2400, 0.6), 0.025)
