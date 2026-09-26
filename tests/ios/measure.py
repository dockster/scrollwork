#!/usr/bin/env python3
"""Measure pin lag in a screen recording of tests/ios/pin-lab.html.

For every frame: where the green mark (position: fixed, the browser's own
placement) is, and how far the red (Scrollwork) and blue (CSS scroll-driven
animation) marks sit from it, in CSS pixels. Only frames where all three are
fully on screen count: that is the hold. Needs ffmpeg and Pillow.

    python3 tests/ios/measure.py recording.mp4
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image

video = sys.argv[1]
tmp = tempfile.mkdtemp(prefix='pinlab-')
subprocess.run(['ffmpeg', '-loglevel', 'fatal', '-i', video, '-fps_mode', 'passthrough', os.path.join(tmp, 'f%05d.png')], check=True)
frames = sorted(glob.glob(os.path.join(tmp, 'f*.png')))

def is_green(p): return p[1] > 150 and p[0] < 110 and p[2] < 110
def is_red(p): return p[0] > 180 and p[1] < 90 and p[2] < 90
def is_blue(p): return p[2] > 170 and p[0] < 90 and p[1] < 90
def is_orange(p): return p[0] > 200 and 100 < p[1] < 190 and p[2] < 80
def is_black(p): return p[0] < 70 and p[1] < 70 and p[2] < 70

def run(img, x, test, y0=0):
    """top and bottom of the longest run of matching pixels in column x"""
    w, h = img.size
    px = img.load()
    best, cur = None, None
    for y in range(y0, h):
        if test(px[x, y]):
            cur = (cur[0], y) if cur else (y, y)
        elif cur:
            if not best or cur[1] - cur[0] > best[1] - best[0]: best = cur
            cur = None
    if cur and (not best or cur[1] - cur[0] > best[1] - best[0]): best = cur
    return best

# find the green mark once: its height gives the scale (it is 100 CSS px
# tall; the height, not the 30px width, so a blurred edge costs little)
geo = None
for f in frames:
    img = Image.open(f).convert('RGB')
    w, h = img.size
    px = img.load()
    for y in range(0, h, 4):
        xs = [x for x in range(0, min(w, 400)) if is_green(px[x, y])]
        if len(xs) > 5:
            gx = (xs[0] + xs[-1]) // 2
            g = run(img, gx, is_green)
            scale = (g[1] - g[0] + 1) / 100
            # the marks' centres: green 15, red 90, blue 190 CSS px from the left edge
            left = gx - 15 * scale
            geo = {'gx': gx, 'rx': int(left + 90 * scale), 'bx': int(left + 190 * scale), 'ox': int(left + 290 * scale), 'scale': scale, 'gy': (g[0] + g[1]) // 2}
            break
    if geo: break
if not geo:
    sys.exit('no green mark found: is the lab page on screen?')

rows = []
for i, f in enumerate(frames):
    img = Image.open(f).convert('RGB')
    # the page's own gate: a black mark on the green mark's row, right half, while well inside the hold
    w = img.size[0]
    px = img.load()
    if sum(1 for x in range(w // 2, w) if is_black(px[x, geo['gy']])) < 15 * geo['scale']:
        continue
    g = run(img, geo['gx'], is_green)
    r = run(img, geo['rx'], is_red)
    b = run(img, geo['bx'], is_blue)
    o = run(img, geo['ox'], is_orange)
    full = lambda m: m and abs((m[1] - m[0] + 1) / geo['scale'] - 100) <= 8
    if not (full(g) and full(r) and full(b)):
        continue
    rows.append(((r[0] - g[0]) / geo['scale'], (b[0] - g[0]) / geo['scale'], (o[0] - g[0]) / geo['scale'] if full(o) else None))
    if os.environ.get('ROWS'): print('ROW', i, *(round(v) if v is not None else '-' for v in rows[-1]))

def stats(vals):
    a = sorted(abs(v) for v in vals)
    n = len(a)
    if not n: return 'no frames'
    off = sum(1 for v in a if v > 1.5)
    return f'{off}/{n} frames off by more than 1.5px, p95 {a[int(n * 0.95) - 1 if n > 1 else 0]:.1f}px, max {a[-1]:.1f}px'

print(f'{len(frames)} frames, {len(rows)} in the hold, scale {geo["scale"]:.2f}')
print('red    (Scrollwork):                 ', stats([r for r, _, _ in rows]))
print('blue   (CSS scroll-driven animation):', stats([b for _, b, _ in rows]))
print('orange (position: sticky):           ', stats([o for _, _, o in rows if o is not None]))
