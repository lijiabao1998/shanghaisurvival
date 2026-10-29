#!/usr/bin/env python3
"""Extract Geofabrik OSM road centre lines into a CMAB sample's local frame."""
import argparse
import hashlib
import json
from pathlib import Path
from html import escape

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import LineString, Polygon, box, shape
from shapely.ops import transform

WIDTH = {
    'motorway': 16, 'trunk': 14, 'primary': 12, 'secondary': 10,
    'tertiary': 8, 'unclassified': 6, 'residential': 6,
    'living_street': 5, 'service': 4, 'pedestrian': 4, 'track': 3,
    'path': 2, 'footway': 2, 'cycleway': 2, 'steps': 2,
    'motorway_link': 6, 'trunk_link': 6, 'primary_link': 6,
    'secondary_link': 5, 'tertiary_link': 5,
}


def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()


def write_preview(path, data, roads, centerline_hits, size):
    hit_ids = {r['road'] for r in centerline_hits}
    def ring(points):
        return 'M ' + ' L '.join(f'{x},{size-y:.3f}' for x, y in points) + ' Z'
    roof_paths = []
    for b in data['buildings']:
        d = ' '.join(ring(r) for r in [b['footprint'], *b['holes']] if len(r) >= 3)
        roof_paths.append(f'<path d="{d}" fill="#71899a" fill-opacity="0.65" stroke="#263c4a" stroke-width="0.3" fill-rule="evenodd"/>')
    road_paths = []
    for r in roads:
        points = ' '.join(f'{x},{size-y:.3f}' for x,y in r['centerline'])
        color = '#c83125' if r['id'] in hit_ids else '#276791'
        title = escape(f"{r['id']} {r['name']} ({r['type']}); width estimated {r['width_m']} m")
        road_paths.append(f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="0.8"><title>{title}</title></polyline>')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -40 {size+40} {size+100}">
<rect x="-20" y="-40" width="{size+40}" height="{size+100}" fill="#faf9f5"/>
<text x="0" y="-22" font-family="sans-serif" font-size="5">Shanghai sample: CMAB roof outlines + OSM road centre lines</text>
<defs><clipPath id="bounds"><rect x="0" y="0" width="{size}" height="{size}"/></clipPath></defs>
<rect x="0" y="0" width="{size}" height="{size}" fill="#eef0ed" stroke="#455c65" stroke-width="0.5"/>
<g clip-path="url(#bounds)">{''.join(roof_paths)}{''.join(road_paths)}</g>
<path d="M {size-8} 18 L {size-8} 5 M {size-11} 9 L {size-8} 5 L {size-5} 9" stroke="#14242b" stroke-width="1" fill="none"/>
<text x="{size-9}" y="4" font-family="sans-serif" font-size="4">N</text>
<path d="M 0 {size+8} h 50 M 0 {size+6} v 4 M 50 {size+6} v 4" stroke="#172b35" stroke-width="1"/>
<text x="53" y="{size+10}" font-family="sans-serif" font-size="4">50 m</text>
<text x="0" y="{size+20}" font-family="sans-serif" font-size="4">Blue = OSM centre line; red = intersects CMAB estimated roof outline.</text>
<text x="0" y="{size+27}" font-family="sans-serif" font-size="4">Intersection alone does not identify the cause or prove a mapping error.</text>
<text x="0" y="{size+35}" font-family="sans-serif" font-size="4">CMAB, Zhang et al. (2025), CC BY 4.0; © OpenStreetMap contributors, ODbL.</text>
<text x="0" y="{size+42}" font-family="sans-serif" font-size="4">Data adapted to a common local projection; road widths are estimates.</text>
</svg>'''
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--shp', type=Path, required=True)
    ap.add_argument('--buildings', type=Path, required=True)
    ap.add_argument('--archive', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    ap.add_argument('--svg', type=Path, help='Optional overlay preview')
    args = ap.parse_args()
    data = json.loads(args.buildings.read_text(encoding='utf-8'))
    src = data['source']; size = data['chunk']['size_m']
    x0, y0 = src['origin_projected_m']
    target = CRS.from_user_input(src['projection'])
    crs = CRS.from_wkt(args.shp.with_suffix('.prj').read_text(encoding='utf-8-sig'))
    if not crs.equals(CRS.from_epsg(4326), ignore_axis_order=True):
        raise ValueError(f'Unexpected road CRS: {crs}')
    tr = Transformer.from_crs(crs, target, always_xy=True)
    inv = Transformer.from_crs(target, crs, always_xy=True)
    window = box(x0, y0, x0 + size, y0 + size)
    bbox = inv.transform_bounds(*window.bounds, densify_pts=21)
    r = shapefile.Reader(str(args.shp), encoding='utf-8', encodingErrors='strict')
    fields = [f[0] for f in r.fields if f[0] != 'DeletionFlag']
    roads, unsupported = [], 0
    for item in r.iterShapeRecords(bbox=bbox):
        attrs = dict(zip(fields, item.record))
        clipped = transform(tr.transform, shape(item.shape.__geo_interface__)).intersection(window)
        if clipped.is_empty:
            continue
        lines = [clipped] if clipped.geom_type == 'LineString' else list(clipped.geoms) if clipped.geom_type == 'MultiLineString' else []
        for i, line in enumerate(lines):
            if line.length < 0.05:
                continue
            typ = attrs['fclass']; width = WIDTH.get(typ, 4)
            if typ not in WIDTH: unsupported += 1
            roads.append({'id': f"osm_{attrs['osm_id']}_{i}", 'osm_id': attrs['osm_id'],
                'type': typ, 'name': attrs['name'], 'centerline': [[round(x-x0,3), round(y-y0,3)] for x, y in line.coords],
                'width_m': width, 'width_source': 'estimated_by_road_class',
                'tags': {'oneway': attrs['oneway'], 'maxspeed': attrs['maxspeed'], 'layer': attrs['layer'],
                         'bridge': attrs['bridge'], 'tunnel': attrs['tunnel']}})
    if not roads:
        raise SystemExit('No roads found in the selected window')
    buildings = [Polygon(b['footprint'], b['holes']) for b in data['buildings']]
    centerline_hits = []; road_surface_hits = []
    for road in roads:
        line = LineString(road['centerline'])
        hits = [i for i, b in enumerate(buildings) if line.intersects(b)]
        surface_hits = [i for i, b in enumerate(buildings) if line.buffer(road['width_m']/2, cap_style='flat', join_style='mitre').intersects(b)]
        if hits: centerline_hits.append({'road': road['id'], 'building_ids': [data['buildings'][i]['id'] for i in hits]})
        if surface_hits: road_surface_hits.append({'road': road['id'], 'building_ids': [data['buildings'][i]['id'] for i in surface_hits]})
    output = {'schema': 'modu.roads/1', 'chunk': data['chunk'], 'units': data['units'],
        'source': {'name': 'OpenStreetMap contributors, Geofabrik Shanghai extract',
        'url': 'https://download.geofabrik.de/asia/china/shanghai-261028-free.shp.zip',
        'source_data_timestamp_utc': '2026-10-28T21:21:02Z', 'archive_sha256': digest(args.archive),
        'shapefile_sha256': digest(args.shp), 'license': 'ODbL 1.0', 'copyright': '© OpenStreetMap contributors',
        'attribution_url': 'https://www.openstreetmap.org/copyright', 'projection': src['projection'],
        'origin_projected_m': src['origin_projected_m'], 'source_crs': crs.to_string(),
        'geometry': 'Road centerlines clipped to 250 m sample window; source SHP was OSM-derived.',
        'width': 'Illustrative class-based estimate; source extract has no width attribute; not surveyed.',
        'limitations': ['OSM completeness and accuracy unverified; CMAB roof polygons, not measured ground footprints.',
        'CMAB and OSM have different survey dates; overlaps may reflect roofs, source shifts, road width assumptions, level, or changes.']},
        'roads': roads, 'quality': {'road_segments': len(roads), 'unmapped_class_fallbacks': unsupported,
        'road_centerlines_intersecting_cmab_roof': centerline_hits, 'estimated_road_surface_intersecting_cmab_roof': road_surface_hits}}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    if args.svg:
        write_preview(args.svg, data, roads, centerline_hits, size)
    print(f"roads={len(roads)}, centerline_roof_hits={len(centerline_hits)}, estimated_surface_roof_hits={len(road_surface_hits)}")


if __name__ == '__main__':
    main()
