"""Build the preview data from the versioned sample, without editing the source.

Run from repository root with .venv/Scripts/python.exe game/build_demo_data.py.
Shapely is already specified in tools/requirements.txt.
"""
import json
import math
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'game'
src = ROOT / 'data/samples/shanghai_huangpu_250m.json'
roads_src = ROOT / 'data/samples/shanghai_huangpu_roads.json'
data = json.loads(src.read_text(encoding='utf-8'))
window = box(0, 0, 250, 250)
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

# Select an entirely in-bounds building with a straight accessible segment.
# Door and room are invented solely for the prototype; geometry is unaltered.
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
        if any(other.distance(outside) < 0.8 for _, other, _, _ in processed):
            continue
        access = LineString([outside, inside]).buffer(0.35)
        if any(other.intersects(access) for candidate, other, _, _ in processed if candidate['id'] != item['id']):
            continue
        score = math.hypot(mid[0] - 125, mid[1] - 125)
        choices.append((score, item['id'], idx, list(outside.coords)[0], mid))
if not choices:
    raise RuntimeError('No safe candidate entrance found; no demo generated.')
_, selected_id, entrance_edge, spawn, entrance = min(choices)
out = {
    'source': {'dataset': 'CMAB', 'url': 'https://doi.org/10.6084/m9.figshare.27992417',
               'license': 'CC BY 4.0', 'building_height': 'Height interpreted as metres for preview, unconfirmed; not measured',
               'simplification': 'Shapely 0.2m topology-preserving; source file remains unchanged',
               'entrance_and_interior': 'invented for play testing'},
    'buildings': [],
    'spawn': list(spawn), 'entrance': list(entrance), 'entrance_building': selected_id,
}
for item, poly, height, raw in processed:
    out['buildings'].append({
        'id': item['id'], 'footprint': [list(p) for p in list(poly.exterior.coords)[:-1]],
        'holes': [[list(p) for p in list(r.coords)[:-1]] for r in poly.interiors],
        'height_m': height, 'height_source_value': raw,
        'door_edge': entrance_edge if item['id'] == selected_id else -1,
    })
if roads_src.exists():
    road_data = json.loads(roads_src.read_text(encoding='utf-8'))
    out['roads'] = road_data['roads']
    out['road_source'] = road_data.get('source', {})
else:
    out['roads'] = []
(GAME / 'data').mkdir(parents=True, exist_ok=True)
(GAME / 'data/block.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f"Built {len(processed)} buildings, {len(out['roads'])} roads; invented entrance {selected_id}, edge {entrance_edge}; spawn {spawn}.")
