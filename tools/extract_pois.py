#!/usr/bin/env python3
"""Extract OSM places of interest into a CMAB sample's local frame.

Two outputs, split by one rule: institutions keep their real names, businesses
never do. A hospital or a park is a place; a convenience store is a trademark.
Named commercial POIs are reduced to their generic category so the game can
still put a shop there without borrowing anyone's brand.

Source: Geofabrik Shanghai free shapefile extract, ODbL 1.0.
"""
import argparse
import io
import json
import zipfile
from pathlib import Path

import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape

# Categories worth showing with their real name. Institutions and public space.
NAMED = {
    'hospital': '醫院', 'clinic': '診所', 'doctors': '診所', 'dentist': '牙科',
    'pharmacy': '藥房',
    'school': '學校', 'university': '大學', 'college': '學院', 'kindergarten': '幼兒園',
    'library': '圖書館', 'museum': '博物館', 'theatre': '劇院', 'cinema': '戲院',
    'arts_centre': '藝文中心', 'place_of_worship': '廟宇', 'monastery': '寺院',
    'police': '派出所', 'fire_station': '消防隊', 'post_office': '郵局',
    'town_hall': '政府機關', 'courthouse': '法院', 'government': '政府機關',
    'embassy': '領事館',
    'park': '公園', 'playground': '遊樂場', 'stadium': '體育場',
    'sports_centre': '運動中心', 'swimming_pool': '游泳池', 'market_place': '市場',
    'subway_entrance': '地鐵站', 'bus_station': '公交站', 'railway_station': '車站',
    'monument': '紀念碑', 'memorial': '紀念館', 'attraction': '景點',
    'viewpoint': '觀景點', 'zoo': '動物園', 'aquarium': '水族館',
}

# Trademarks live here. Keep the category, drop the brand.
GENERIC = {
    'convenience': '便利店', 'supermarket': '超市', 'department_store': '百貨',
    'mall': '商場', 'variety_store': '雜貨', 'kiosk': '小賣部',
    'bakery': '麵包店', 'butcher': '肉鋪', 'greengrocer': '菜店',
    'chemist': '藥粧', 'hardware': '五金', 'electronics': '電器',
    'mobile_phone': '手機店', 'furniture': '家具', 'florist': '花店',
    'books': '書店', 'stationery': '文具', 'toys': '玩具', 'gift': '禮品',
    'clothes': '服飾', 'shoes': '鞋店', 'jewelry': '珠寶', 'hairdresser': '理髮',
    'restaurant': '餐館', 'fast_food': '速食', 'cafe': '咖啡', 'pub': '酒吧',
    'bar': '酒吧', 'food_court': '美食街', 'ice_cream': '冰品',
    'alcohol': '酒類', 'beverages': '飲料',
    'bank': '銀行', 'atm': '提款機', 'bureau_de_change': '兌換',
    'car': '車行', 'car_repair': '修車', 'fuel': '加油站', 'parking': '停車場',
    'laundry': '洗衣', 'dry_cleaning': '乾洗', 'travel_agency': '旅行社',
    'estate_agent': '房仲', 'insurance': '保險', 'photo': '照相館',
    'tobacco': '菸酒店', 'vending_machine': '販賣機',
}

LAYERS = ('gis_osm_pois_free_1', 'gis_osm_pois_a_free_1')


def read_layer(archive, name, bbox=None):
    with zipfile.ZipFile(archive) as z:
        if f'{name}.shp' not in z.namelist():
            return []
        shp = io.BytesIO(z.read(f'{name}.shp'))
        shx = io.BytesIO(z.read(f'{name}.shx'))
        dbf = io.BytesIO(z.read(f'{name}.dbf'))
        prj = z.read(f'{name}.prj').decode('utf-8-sig') if f'{name}.prj' in z.namelist() else None
        reader = shapefile.Reader(shp=shp, shx=shx, dbf=dbf, encoding='utf-8', encodingErrors='replace')
        fields = [f[0] for f in reader.fields if f[0] != 'DeletionFlag']
        records = []
        if bbox:
            for item in reader.iterShapeRecords(bbox=bbox):
                records.append((dict(zip(fields, item.record)), item.shape))
        else:
            for item in reader.iterShapeRecords():
                records.append((dict(zip(fields, item.record)), item.shape))
        return records, prj


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--archive', type=Path, required=True)
    ap.add_argument('--buildings', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    args = ap.parse_args()

    data = json.loads(args.buildings.read_text(encoding='utf-8'))
    src = data['source']
    size = float(data['chunk']['size_m'])
    x0, y0 = src['origin_projected_m']
    target = CRS.from_user_input(src['projection'])
    tr = Transformer.from_crs(CRS.from_epsg(4326), target, always_xy=True)
    inv = Transformer.from_crs(target, CRS.from_epsg(4326), always_xy=True)
    from shapely.geometry import box
    window = box(x0, y0, x0 + size, y0 + size)
    bbox = inv.transform_bounds(*window.bounds, densify_pts=21)

    seen = set()
    named, generic, dropped = [], [], 0
    for layer in LAYERS:
        result = read_layer(args.archive, layer, bbox)
        if not result:
            continue
        records, prj = result
        if prj:
            crs = CRS.from_wkt(prj)
            tr = Transformer.from_crs(crs, target, always_xy=True)
        for attrs, shp in records:
            fclass = str(attrs.get('fclass') or '').strip()
            name = str(attrs.get('name') or '').strip()
            if fclass in NAMED:
                kind, keep_name = 'landmark', True
            elif fclass in GENERIC:
                kind, keep_name = 'shop', False
            else:
                dropped += 1
                continue
            geom = shape(shp.__geo_interface__).representative_point() if shp.shapeType != 1 \
                else shape(shp.__geo_interface__)
            from shapely.ops import transform as shp_transform
            p = shp_transform(tr.transform, geom)
            if window.contains(p):
                x, y = p.x - x0, p.y - y0
            else:
                # Areas may straddle the edge; clip to the window and keep the centroid.
                clipped = shp_transform(tr.transform, shape(shp.__geo_interface__)).intersection(window)
                if clipped.is_empty:
                    continue
                c = clipped.centroid
                x, y = c.x - x0, c.y - y0
            label = name if keep_name and name else GENERIC.get(fclass, '')
            if not label:
                continue
            key = (round(x, 1), round(y, 1), label)
            if key in seen:
                continue
            seen.add(key)
            row = {'x': round(x, 2), 'y': round(y, 2), 'fclass': fclass,
                   'label': label, 'cn': NAMED.get(fclass) or GENERIC.get(fclass, '')}
            if keep_name and name:
                row['name'] = name
            (named if kind == 'landmark' else generic).append(row)

    named.sort(key=lambda r: r['label'])
    output = {
        'schema': 'modu.pois/1',
        'chunk': data['chunk'],
        'units': data['units'],
        'source': {
            'name': 'OpenStreetMap contributors, Geofabrik Shanghai extract',
            'license': 'ODbL 1.0',
            'copyright': '© OpenStreetMap contributors',
            'attribution_url': 'https://www.openstreetmap.org/copyright',
            'note': 'Institutional names kept as recorded. Commercial POIs reduced to '
                    'their OSM category so no brand or trademark is reproduced.',
        },
        'landmarks': named,
        'shops': generic,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"landmarks={len(named)} shops={len(generic)} dropped={dropped} -> {args.out}")


if __name__ == '__main__':
    main()
