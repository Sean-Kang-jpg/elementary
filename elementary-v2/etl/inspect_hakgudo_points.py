#!/usr/bin/env python3
"""Print official hakgudo polygons covering supplied WGS84 points."""

import argparse
import sys
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape


sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shp", type=Path, required=True)
    parser.add_argument("points", nargs="+", help="label,longitude,latitude")
    args = parser.parse_args()

    reader = shapefile.Reader(str(args.shp), encoding="euc-kr")
    fields = [field[0] for field in reader.fields[1:]]
    name_index = fields.index("HAKGUDO_NM")
    polygons = []
    for record in reader.iterShapeRecords():
        geometry = shape(record.shape.__geo_interface__)
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
        polygons.append((geometry, record.record[name_index]))

    transformer = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)
    for value in args.points:
        label, longitude, latitude = value.split(",", 2)
        point = Point(*transformer.transform(float(longitude), float(latitude)))
        names = [name for polygon, name in polygons if polygon.covers(point)]
        print(f"{label}: {'|'.join(names) or '(no hit)'}")


if __name__ == "__main__":
    main()
