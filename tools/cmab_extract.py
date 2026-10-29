#!/usr/bin/env python3
"""Extract a small, traceable CMAB building sample; no roads or interiors are inferred."""

import argparse
import hashlib
import json
import math
from html import escape
from pathlib import Path

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import box, shape
from shapely.geometry.polygon import orient
from shapely.ops import transform


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()


def coordinates(ring, x0, y0):
    # The schema stores unclosed CCW outer rings; hole rings stay clockwise.
    return [[round(x - x0, 3), round(y - y0, 3)] for x, y, *_ in list(ring.coords)[:-1]]


def write_svg(path, buildings, size, lon, lat):
    margin = size * 0.08
    top = size * 0.16
    bottom = size * 0.20
    font = max(size * 0.018, 2.5)
    def ring_path(ring):
        return 'M ' + ' L '.join(f'{x},{round(size-y, 3)}' for x, y in ring) + ' Z'
    paths = []
    for item in buildings:
        d = ' '.join(ring_path(r) for r in [item['footprint'], *item['holes']] if len(r) >= 3)
        paths.append(f'<path d="{d}" fill="#71899a" stroke="#263c4a" stroke-width="0.35" fill-rule="evenodd"/>')
    scalebar = 50 if size >= 100 else size / 5
    title = escape(f'CMAB Shanghai | {lon:.6f}, {lat:.6f} | {size:g} m selection')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-margin} {-top} {size+2*margin} {size+top+bottom}">
<rect x="{-margin}" y="{-top}" width="{size+2*margin}" height="{size+top+bottom}" fill="#faf9f5"/>
<text x="0" y="{-top*.58}" font-family="sans-serif" font-size="{font*1.1}" fill="#162a35">{title}</text>
<defs><clipPath id="window"><rect x="0" y="0" width="{size}" height="{size}"/></clipPath></defs>
<rect x="0" y="0" width="{size}" height="{size}" fill="#e6e9e7" stroke="#455c65" stroke-width="0.5"/>
<g clip-path="url(#window)">{''.join(paths)}</g>
<path d="M {size-8} 18 L {size-8} 5 M {size-11} 9 L {size-8} 5 L {size-5} 9" stroke="#14242b" stroke-width="1" fill="none"/>
<text x="{size-9.5}" y="4" font-family="sans-serif" font-size="{font}">N</text>
<path d="M 0 {size+8} h {scalebar} M 0 {size+6} v 4 M {scalebar} {size+6} v 4" stroke="#172b35" stroke-width="1"/>
<text x="{scalebar+3}" y="{size+10}" font-family="sans-serif" font-size="{font}">{scalebar:g} m</text>
<text x="0" y="{size+20}" font-family="sans-serif" font-size="{font*.85}">CMAB estimated roof outlines, projected to UTM. No roads or interiors shown.</text>
<text x="0" y="{size+27}" font-family="sans-serif" font-size="{font*.85}">Zhang, Zhao &amp; Long (2025), CMAB, CC BY 4.0; adapted to local coordinates.</text>
</svg>'''
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg + '\n', encoding='utf-8')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--shp', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--svg', type=Path, help='Optional top-down preview clipped to the selection window')
    p.add_argument('--lon', type=float, required=True, help='WGS84 longitude of window centre')
    p.add_argument('--lat', type=float, required=True, help='WGS84 latitude of window centre')
    p.add_argument('--size-m', type=float, default=250)
    p.add_argument('--height-field', help='Numeric height in metres, only if verified from source metadata')
    p.add_argument('--archive', type=Path, help='Original source archive, whose SHA-256 is recorded')
    p.add_argument('--encoding', default='utf-8', help='DBF text encoding; default utf-8')
    a = p.parse_args()
    if not (-180 <= a.lon <= 180 and -80 <= a.lat <= 84 and 0 < a.size_m <= 5000):
        p.error('Invalid longitude, latitude, or window size (maximum 5000 metres).')
    if not a.shp.is_file() or not a.shp.with_suffix('.prj').is_file():
        p.error('Input .shp and accompanying .prj are required.')
    crs = CRS.from_wkt(a.shp.with_suffix('.prj').read_text(encoding='utf-8-sig'))
    if not any(crs.equals(CRS.from_epsg(epsg), ignore_axis_order=True) for epsg in (4326, 3857)):
        p.error(f'Expected WGS84 EPSG:4326 or EPSG:3857 source; .prj is {crs.to_string()}.')
    zone = int((a.lon + 180) // 6) + 1
    zone = min(zone, 60)
    utm = CRS.from_epsg((32600 if a.lat >= 0 else 32700) + zone)
    to_utm = Transformer.from_crs(crs, utm, always_xy=True)
    from_utm = Transformer.from_crs(utm, crs, always_xy=True)
    from_wgs84 = Transformer.from_crs(4326, utm, always_xy=True)
    cx, cy = from_wgs84.transform(a.lon, a.lat)
    x0, y0 = cx - a.size_m / 2, cy - a.size_m / 2
    window = box(x0, y0, x0 + a.size_m, y0 + a.size_m)
    # Densified transform_bounds avoids excluding shapes at curved projected edges.
    bbox = from_utm.transform_bounds(*window.bounds, densify_pts=21)
    reader = shapefile.Reader(str(a.shp), encoding=a.encoding)
    fields = [f[0] for f in reader.fields if f[0] != 'DeletionFlag']
    if a.height_field and a.height_field not in fields:
        p.error(f'Height field {a.height_field!r} absent; available: {fields}')
    buildings, skipped, selected = [], 0, 0
    for record in reader.iterShapeRecords(bbox=bbox):
        try:
            geometry = shape(record.shape.__geo_interface__)
            projected = transform(to_utm.transform, geometry)
            if not projected.intersects(window):
                continue
            selected += 1
            if not projected.is_valid or projected.is_empty:
                skipped += 1
                continue
            parts = [projected] if projected.geom_type == 'Polygon' else list(projected.geoms) if projected.geom_type == 'MultiPolygon' else []
            if not parts:
                skipped += 1
                continue
            attrs = dict(zip(fields, record.record))
            h = attrs.get(a.height_field) if a.height_field else None
            try:
                h = float(h)
                if not math.isfinite(h) or h <= 0:
                    h = None
            except (TypeError, ValueError):
                h = None
            for i, part in enumerate(parts):
                poly = orient(part, sign=1.0)
                buildings.append({
                    'id': f'cmab_{record.shape.oid}_{i}',
                    'footprint': coordinates(poly.exterior, x0, y0),
                    'holes': [coordinates(r, x0, y0) for r in poly.interiors],
                    'height_m': h,
                    'height_status': 'source_estimate' if h is not None else 'unknown',
                    'source_record_index': record.shape.oid,
                    'source_attributes': attrs,
                })
        except (ValueError, TypeError, IndexError):
            skipped += 1
    if not buildings:
        raise SystemExit('No usable building polygons selected; no output written.')
    source = {
        'dataset': 'CMAB: A Multi-Attribute Building Dataset of China',
        'dataset_url': 'https://doi.org/10.6084/m9.figshare.27992417',
        'license': 'CC BY 4.0 (publisher metadata)',
        'source_file': str(a.shp),
        'source_shp_sha256': sha256(a.shp),
        'source_prj_sha256': sha256(a.shp.with_suffix('.prj')),
        'source_dbf_sha256': sha256(a.shp.with_suffix('.dbf')),
        'source_crs': crs.to_string(),
        'projection': utm.to_string(),
        'origin_projected_m': [x0, y0],
        'centre_wgs84_lon_lat': [a.lon, a.lat],
        'height_field': a.height_field,
        'selected_records': selected,
        'skipped_invalid_or_unsupported': skipped,
        'geometry_selection': 'intersects window; complete source polygons retained, not clipped',
        'limitations': ['Roof outlines and height attributes are estimates, not surveyed ground footprints or heights.', 'No roads, entrances, interiors, collisions or gameplay placement inferred.'],
    }
    if a.archive:
        source['archive_file'] = str(a.archive)
        source['archive_sha256'] = sha256(a.archive)
    result = {
        'schema': 'modu.cityblock/1',
        'chunk': {'id': 'cmab_shanghai_sample', 'size_m': a.size_m, 'origin_m': [0, 0]},
        'units': {'length': 'meter', 'angle': 'degree', 'winding': 'ccw', 'axes': 'x=east, y=north, height=up'},
        'source': source,
        'buildings': buildings,
        'roads': [], 'props': [], 'spawns': [],
    }
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + '\n', encoding='utf-8')
    if a.svg:
        write_svg(a.svg, buildings, a.size_m, a.lon, a.lat)
    print(f'Wrote {len(buildings)} polygon parts from {selected} records to {a.out}; skipped {skipped}.')


if __name__ == '__main__':
    main()
