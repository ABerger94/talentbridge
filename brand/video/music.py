# Original music for the TalentBridge promo: 100 BPM, C - G - Am - F, 22 bars.
# Arrangement follows the video's scenes (bar numbers match video.html).
import numpy as np, wave, sys
SR = 44100
BPM = 100
BEAT = 60 / BPM            # 0.6 s
BAR = 4 * BEAT             # 2.4 s
BARS = 22
TAIL = 2.0
N = int((BARS * BAR + TAIL) * SR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)

def hz(m): return 440 * 2 ** ((m - 69) / 12)
def env_adsr(n, a, d, s, r, sr=SR):
    e = np.ones(n) * s
    A, D, Rl = int(a*sr), int(d*sr), int(r*sr)
    e[:A] = np.linspace(0, 1, max(A, 1))[:len(e[:A])]
    e[A:A+D] = np.linspace(1, s, max(D, 1))[:len(e[A:A+D])]
    if Rl: e[-Rl:] *= np.linspace(1, 0, Rl)
    return e
def onepole(x, cutoff):
    a = np.exp(-2*np.pi*cutoff/SR); y = np.empty_like(x); z = 0.0
    # vectorized-ish via lfilter replacement
    for i in range(0, len(x), 4096):
        seg = x[i:i+4096]; out = np.empty_like(seg)
        for j, v in enumerate(seg): z = (1-a)*v + a*z; out[j] = z
        y[i:i+4096] = out
    return y
def saw(f, n, maxh=7000, detune=0.0):
    t = np.arange(n) / SR; out = np.zeros(n)
    for k in range(1, int(maxh / f) + 1):
        out += np.sin(2*np.pi*k*f*(1+detune)*t + k) / k
    return out
def add(buf, start, sig, gain=1.0):
    s = int(start*SR); e = min(N, s+len(sig))
    if s < N: buf[s:e] += sig[:e-s] * gain

CHORDS = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
ROOTS = [36, 43, 45, 41]

# Section intensity by bar: 0-1 intro, 2-3 logo hit, 4-18 main, 19-21 finale.
def section(b):
    if b < 2: return 'intro'
    if b < 4: return 'lift'
    if b < 19: return 'main'
    return 'end'

import json as _j
_c = _j.load(open(sys.argv[1]))
HIT = _c['chimes'][0]           # the level-up moment
BREAK = (HIT - 3.0, HIT)        # drums drop out before it
def in_break(t): return BREAK[0] <= t < BREAK[1]

for b in range(BARS):
    t0 = b * BAR; ch = CHORDS[b % 4]; sec = section(b)
    # Pad: two detuned band-limited saws per note, low-passed, slow attack.
    n = int(BAR*SR) + int(0.6*SR)
    pad = sum(saw(hz(m), n, 5000, -0.003) + saw(hz(m), n, 5000, 0.004) for m in ch) / 6
    pad = onepole(pad, 900 if sec == 'intro' else 1700) * env_adsr(n, 0.35, 0.3, 0.8, 0.6)
    g = 0.22 if sec != 'intro' else 0.28
    add(L, t0, pad, g); add(R, t0, np.roll(pad, 220), g)
    # Pluck arpeggio, 8ths, panned alternately.
    if sec in ('intro', 'lift', 'main', 'end'):
        notes = [ch[0]+12, ch[1]+12, ch[2]+12, ch[1]+12, ch[0]+24, ch[2]+12, ch[1]+12, ch[2]+12]
        for i, m in enumerate(notes):
            nn = int(0.5*SR); tt = np.arange(nn)/SR
            f = hz(m)
            pl = (np.sin(2*np.pi*f*tt) + 0.35*np.sin(2*np.pi*2*f*tt) + 0.12*np.sin(2*np.pi*3*f*tt)) * np.exp(-tt*9)
            pg = 0.10 if sec == 'intro' else 0.075
            pan = 0.65 if i % 2 else 0.35
            add(L, t0 + i*BEAT/2, pl, pg*(1-pan)*2); add(R, t0 + i*BEAT/2, pl, pg*pan*2)
    if sec == 'intro': continue
    # Bass: root on 8ths with a little movement.
    root = ROOTS[b % 4]
    for i in range(8):
        m = root + (12 if i in (3, 7) else 0)
        nn = int(0.28*SR); tt = np.arange(nn)/SR; f = hz(m)
        bs = np.tanh(1.6*(np.sin(2*np.pi*f*tt) + 0.3*np.sin(2*np.pi*2*f*tt))) * env_adsr(nn, 0.005, 0.08, 0.6, 0.08)
        g = 0.13 if in_break(t0 + i*BEAT/2) else 0.26
        add(L, t0 + i*BEAT/2, bs, g); add(R, t0 + i*BEAT/2, bs, g)
    # Drums.
    for i in range(4):
        tb = t0 + i*BEAT
        if in_break(tb): continue
        if sec != 'lift' or i in (0, 2):
            nn = int(0.35*SR); tt = np.arange(nn)/SR
            f = 45 + 80*np.exp(-tt*30); ph = 2*np.pi*np.cumsum(f)/SR
            kick = np.sin(ph) * np.exp(-tt*9)
            add(L, tb, kick, 0.55); add(R, tb, kick, 0.55)
        if i in (1, 3) and sec in ('main', 'end'):
            nn = int(0.22*SR); tt = np.arange(nn)/SR
            noise = rng.standard_normal(nn); clap = (noise - onepole(noise, 1200)) * np.exp(-tt*22)
            add(L, tb, clap, 0.13); add(R, tb + 0.004, clap, 0.13)
    if sec in ('main', 'end'):
        for i in range(8):
            nn = int(0.06*SR); tt = np.arange(nn)/SR
            noise = rng.standard_normal(nn); hat = (noise - onepole(noise, 6000)) * np.exp(-tt*70)
            g = 0.05 if i % 2 else 0.03
            if in_break(t0 + i*BEAT/2) and t0 + i*BEAT/2 < BREAK[0] + 1.8: continue
            add(L, t0 + i*BEAT/2, hat, g*1.2); add(R, t0 + i*BEAT/2, hat, g*0.8)

# Final chord ringing out.
n = int((TAIL + 0.6)*SR)
fin = sum(saw(hz(m), n, 4000, -0.003) + saw(hz(m), n, 4000, 0.004) for m in [48, 60, 64, 67, 72]) / 8
fin = onepole(fin, 1400) * np.exp(-np.arange(n)/SR*1.6)
add(L, BARS*BAR, fin, 0.3); add(R, BARS*BAR, fin, 0.3)
nn = int(0.6*SR); tt = np.arange(nn)/SR; k = np.sin(2*np.pi*np.cumsum(45 + 80*np.exp(-tt*30))/SR) * np.exp(-tt*6)
add(L, BARS*BAR, k, 0.5); add(R, BARS*BAR, k, 0.5)

# Sound effects at scene changes (seconds, from video.html) and the level-up chime.
def whoosh(at, dur=0.7, g=0.10):
    nn = int(dur*SR); tt = np.arange(nn)/SR
    noise = rng.standard_normal(nn); x = onepole(noise, 2500) - onepole(noise, 300)
    shape = np.sin(np.pi*tt/dur) ** 2
    add(L, at - dur*0.75, x*shape, g); add(R, at - dur*0.75, np.roll(x, 300)*shape, g)
def chime(at, g=0.16):
    nn = int(1.8*SR); tt = np.arange(nn)/SR
    x = sum(a*np.sin(2*np.pi*hz(m)*r*tt) for m, a, r in [(84, 1, 1), (84, .5, 2.01), (88, .6, 1), (91, .45, 1)]) * np.exp(-tt*2.8)
    add(L, at, x, g); add(R, at, x, g)
def tick(at, g=0.07, m=96):
    nn = int(0.12*SR); tt = np.arange(nn)/SR
    x = np.sin(2*np.pi*hz(m)*tt) * np.exp(-tt*45)
    add(L, at, x, g); add(R, at, x, g)

import json
cues = json.load(open(sys.argv[1]))
for t in cues['scene_changes']: whoosh(t)
for t in cues['chimes']: chime(t)
for t in cues['ticks']: tick(t)

# Riser into the level-up, then an impact (kick + crash) on it.
nn = int(2.0*SR); tt = np.arange(nn)/SR
noise = rng.standard_normal(nn)
lo = onepole(noise, 400); hi = noise - onepole(noise, 1500)
rise = (lo * (1 - tt/2.0) + hi * (tt/2.0)) * (tt/2.0) ** 2
sweep = np.sin(2*np.pi*np.cumsum(200 + 900*(tt/2.0)**2)/SR) * (tt/2.0) ** 3 * 0.4
add(L, HIT - 2.0, rise + sweep, 0.16); add(R, HIT - 2.0, np.roll(rise, 400) + sweep, 0.16)
nn = int(1.6*SR); tt = np.arange(nn)/SR
crash = rng.standard_normal(nn); crash = (crash - onepole(crash, 4000)) * np.exp(-tt*2.6)
kick = np.sin(2*np.pi*np.cumsum(45 + 90*np.exp(-tt*30))/SR) * np.exp(-tt*7)
add(L, HIT, crash, 0.11); add(R, HIT + 0.006, crash, 0.11)
add(L, HIT, kick, 0.6); add(R, HIT, kick, 0.6)

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
fade = int(0.25*SR); mix[:fade] *= np.linspace(0, 1, fade)[:, None]
mix /= np.abs(mix).max() / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote', sys.argv[2], round(len(pcm)/SR, 2), 's')
