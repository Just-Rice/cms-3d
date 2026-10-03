"""Fit a pinhole camera to a photo from matched points (image px <-> world m), so the game can
be rendered from the same spot and overlaid on the photo.
    python3 tools/photofit/fit.py points.json   -> prints camera {pos, target, up, fov} and residuals
points.json: {"size": [w, h], "points": [[u, v, x, y, z], ...], "guess": [x, y, z, yawDeg, pitchDeg, fovDeg]}
World axes are the game's: x plan-right, y up, z plan-down."""
import json, sys, math
import numpy as np
from scipy.optimize import least_squares

cfg = json.load(open(sys.argv[1]))
W, H = cfg['size']
P = np.array(cfg['points'], float)
uv, X = P[:, :2], P[:, 2:]

def rot(yaw, pitch, roll):
    # camera looks along f = (-sin yaw cos pitch, sin pitch, -cos yaw cos pitch), like the game
    f = np.array([-math.sin(yaw) * math.cos(pitch), math.sin(pitch), -math.cos(yaw) * math.cos(pitch)])
    r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    c, s = math.cos(roll), math.sin(roll)
    r, u = c * r + s * u, -s * r + c * u
    return f, r, u

SHIFT = cfg.get('shift', False)  # architectural shift lens: level camera, offset principal point

def project(p, X):
    cx, cy, cz, yaw, pitch, roll, fov, sv = p
    if SHIFT: pitch, roll = 0.0, 0.0
    else: sv = 0.0
    f, r, u = rot(yaw, pitch, roll)
    d = X - np.array([cx, cy, cz])
    zc = d @ f
    fpx = (H / 2) / math.tan(math.radians(fov) / 2)
    return np.stack([W / 2 + fpx * (d @ r) / zc, H / 2 - sv * H / 2 - fpx * (d @ u) / zc], 1)

def res(p):
    return (project(p, X) - uv).ravel()

g = cfg['guess']
p0 = [g[0], g[1], g[2], math.radians(g[3]), math.radians(g[4]), 0.0, g[5], 0.0]
sol = least_squares(res, p0, loss='soft_l1', f_scale=8)
p = sol.x
if SHIFT: p[4] = p[5] = 0.0
f, r, u = rot(p[3], p[4], p[5])
pos = p[:3]
out = {'pos': [round(v, 3) for v in pos], 'target': [round(v, 3) for v in pos + f * 20], 'up': [round(v, 4) for v in u], 'fov': round(p[6], 2), 'shiftV': round(p[7], 4)}
print(json.dumps(out))
err = project(p, X) - uv
for (a, b, *_), e in zip(cfg['points'], err): print(f'  ({a:6.0f},{b:6.0f}) residual {e[0]:6.1f} {e[1]:6.1f} px')
print('rms', float(np.sqrt((err ** 2).sum(1).mean())))
