"""Build the preview data from the versioned sample, without editing the source.

Run from repository root with .venv/Scripts/python.exe tools/build_demo_data.py.
Writes straight to web/public/data/block.json, so no manual copy step is needed.
Shapely is already specified in tools/requirements.txt.
"""
import argparse
import json
import math
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parent.parent

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--sample', type=Path, default=ROOT / 'data/samples/shanghai_huangpu_250m.json')
ap.add_argument('--roads', type=Path, default=ROOT / 'data/samples/shanghai_huangpu_roads.json')
ap.add_argument('--pois', type=Path, help='Optional OSM POI extract from tools/extract_pois.py')
ap.add_argument('--out', type=Path, default=ROOT / 'web/public/data/block.json')
args = ap.parse_args()

src = args.sample
roads_src = args.roads
data = json.loads(src.read_text(encoding='utf-8'))
size_m = float(data.get('chunk', {}).get('size_m') or 250.0)
window = box(0, 0, size_m, size_m)
road_data = json.loads(roads_src.read_text(encoding='utf-8')) if roads_src.exists() else {'roads': []}
roads = road_data.get('roads', [])
pois = json.loads(args.pois.read_text(encoding='utf-8')) if args.pois and args.pois.exists() else {}
processed = []
for item in data['buildings']:
    poly = Polygon(item['footprint'], item.get('holes', []))
    if not poly.is_valid or poly.is_empty:
        raise ValueError(f"Invalid source polygon {item['id']}")
    poly = orient(poly.simplify(0.2, preserve_topology=True), sign=1.0)
    raw = item['source_attributes'].get('Height')
    try:
        raw = float(raw)
    except (ValueError, TypeError):
        raw = 0.0
    # Explicit preview assumption: processed Height interpreted as metres,
    # pending source confirmation; invalid values use a 12 m placeholder.
    estimated_height = raw if math.isfinite(raw) and 2 <= raw <= 250 else 12.0
    processed.append((item, poly, estimated_height, raw))

# Spawn at a lane mouth, not a plaza: dense small buildings, a narrow street,
# and enough clearance to turn around. Geometry only; nothing is verified on site.
centroids = []
for _, poly, _, _ in processed:
    pts = list(poly.exterior.coords)[:-1]
    centroids.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))


def nearest_road(x, y):
    best = (1e9, 0.0)
    for r in roads:
        cl = r['centerline']
        for i in range(len(cl) - 1):
            ax, ay = cl[i]
            bx, by = cl[i + 1]
            ex, ey = bx - ax, by - ay
            d = ex * ex + ey * ey
            u = 0.0 if d == 0 else max(0.0, min(1.0, ((x - ax) * ex + (y - ay) * ey) / d))
            dist = math.hypot(x - ax - u * ex, y - ay - u * ey)
            if dist < best[0]:
                best = (dist, float(r.get('width_m') or 0))
    return best


SPAWN_MIN_M, SPAWN_MAX_M = 110.0, 300.0
choices = []
for item, poly, height, raw in processed:
    if poly.interiors or not window.buffer(-5).contains(poly) or poly.area < 80:
        continue
    points = list(poly.exterior.coords)
    for idx, (a, b) in enumerate(zip(points, points[1:])):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length < 4:
            continue
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        outward = (dy / length, -dx / length)
        outside = Point(mid[0] + outward[0] * 6.0, mid[1] + outward[1] * 6.0)
        inside = Point(mid[0] - outward[0] * 1.3, mid[1] - outward[1] * 1.3)
        if not window.buffer(-2).contains(outside) or not poly.contains(inside):
            continue
        to_centre = math.hypot(mid[0] - size_m / 2, mid[1] - size_m / 2)
        if not SPAWN_MIN_M < to_centre < SPAWN_MAX_M:
            continue
        density = sum(1 for cx, cy in centroids if math.hypot(outside.x - cx, outside.y - cy) < 40.0)
        if density < 9:
            continue
        road_distance, road_width = nearest_road(outside.x, outside.y)
        if road_distance > 4.0 or road_width > 8.0:
            continue
        clearance = min((other.distance(outside) for candidate, other, _, _ in processed
                         if candidate['id'] != item['id']), default=0.0)
        # Both bounds matter: too close is a dead end, too far is an open square.
        if not 2.5 <= clearance <= 9.0:
            continue
        access = LineString([outside, inside]).buffer(0.35)
        if any(other.intersects(access) for candidate, other, _, _ in processed if candidate['id'] != item['id']):
            continue
        score = (-density, abs(to_centre - 200.0))
        choices.append((score, item['id'], idx, list(outside.coords)[0], mid,
                        density, road_width, to_centre, clearance))
if not choices:
    raise RuntimeError('No lane-mouth spawn matched; widen the window or relax the rule.')
_, selected_id, entrance_edge, spawn, entrance, spawn_density, spawn_road, spawn_dist, spawn_clear = \
    min(choices, key=lambda c: c[0])
out = {
    'source': {'dataset': 'CMAB', 'url': 'https://doi.org/10.6084/m9.figshare.27992417',
               'license': 'CC BY 4.0', 'building_height': 'Height interpreted as metres for preview, unconfirmed; not measured',
               'simplification': 'Shapely 0.2m topology-preserving; source file remains unchanged',
               'entrance_and_interior': 'invented for play testing'},
    'buildings': [],
    'spawn': list(spawn), 'entrance': list(entrance), 'entrance_building': selected_id,
    'spawn_rule': {
        'distance_to_centre_m': round(spawn_dist, 1),
        'buildings_within_40m': spawn_density,
        'road_width_m': spawn_road,
        'wall_clearance_m': round(spawn_clear, 2),
        'note': 'Lane-mouth spawn chosen from geometry only; not verified on site.',
    },
    'landmarks': pois.get('landmarks', []),
    'shops': pois.get('shops', []),
    'poi_source': pois.get('source', {}),
}
for item, poly, height, raw in processed:
    out['buildings'].append({
        'id': item['id'], 'footprint': [list(p) for p in list(poly.exterior.coords)[:-1]],
        'holes': [[list(p) for p in list(r.coords)[:-1]] for r in poly.interiors],
        'height_m': height, 'height_source_value': raw,
        'door_edge': entrance_edge if item['id'] == selected_id else -1,
    })
out['roads'] = roads
out['road_source'] = road_data.get('source', {})
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f"Built {len(processed)} buildings, {len(out['roads'])} roads; invented entrance {selected_id}, edge {entrance_edge}; spawn {spawn}; wrote {args.out}.")
