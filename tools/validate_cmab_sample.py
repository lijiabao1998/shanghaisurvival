#!/usr/bin/env python3
"""Cross-check extracted geometry and heights against the original shapefile."""
import argparse
import json
import math
from pathlib import Path

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import Polygon, box, shape
from shapely.ops import transform

from cmab_extract import sha256


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('sample', type=Path)
    a = p.parse_args()
    d = json.loads(a.sample.read_text(encoding='utf-8'))
    source = d['source']
    shp = Path(source['source_file'])
    for suffix in ('shp', 'shx', 'dbf', 'prj'):
        if suffix == 'shx':
            continue
        path = shp.with_suffix('.' + suffix)
        if sha256(path) != source[f'source_{suffix}_sha256']:
            raise ValueError(f'Source checksum mismatch: {path}')
    crs = CRS.from_wkt(shp.with_suffix('.prj').read_text(encoding='utf-8-sig'))
    tr = Transformer.from_crs(crs, CRS.from_user_input(source['projection']), always_xy=True)
    x0, y0 = source['origin_projected_m']
    size = d['chunk']['size_m']
    window = box(0, 0, size, size)
    reader = shapefile.Reader(str(shp), encoding='utf-8')
    seen = set()
    max_error = 0.0
    for building in d['buildings']:
        idx = building['source_record_index']
        part_idx = int(building['id'].rsplit('_', 1)[1])
        source_shape = transform(tr.transform, shape(reader.shape(idx).__geo_interface__))
        parts = [source_shape] if source_shape.geom_type == 'Polygon' else list(source_shape.geoms)
        original = transform(lambda x, y, z=None: (x-x0, y-y0), parts[part_idx])
        result = Polygon(building['footprint'], building['holes'])
        if not result.is_valid or not result.intersects(window) or not result.exterior.is_ccw:
            raise ValueError(f'Invalid output geometry: {building["id"]}')
        error = result.hausdorff_distance(original)
        if error > 0.002:
            raise ValueError(f'Unexpected geometry change {error:.4f} m: {building["id"]}')
        hfield = source['height_field']
        if hfield and building['height_m'] is not None:
            expected = float(reader.record(idx).as_dict()[hfield])
            if not math.isclose(expected, building['height_m'], rel_tol=1e-12):
                raise ValueError(f'Height mismatch: {building["id"]}')
        max_error = max(max_error, error)
        seen.add(idx)
    if len(seen) != source['selected_records'] - source['skipped_invalid_or_unsupported']:
        raise ValueError('Source record count mismatch')
    print(f'PASS: {len(d["buildings"])} polygon parts / {len(seen)} records; maximum rounding error {max_error:.6f} m')


if __name__ == '__main__':
    main()
