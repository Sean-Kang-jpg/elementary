#!/usr/bin/env python3
"""
단지 규모 비례 반경 검증
=========================
일률 버퍼는 회수 1건당 회귀 10건으로 손해였다(tune_hakgudo_buffer.py).
큰 단지만 실제로 학구 경계를 걸치므로, 세대수에서 추정한 반경을
단지마다 다르게 적용하면 회귀 없이 회수가 되는지 확인한다.

반경 = k * sqrt(세대수)   (부지 면적이 세대수에 비례한다는 가정)
  149세대  k=2 →  24m
 1000세대  k=2 →  63m
"""

import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = Path(__file__).parent
SHP = BASE / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
GEOMARKET = Path(
    r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv"
)
APT_MST = Path(r"F:/sm/vibe/elementary/archive/GAS/GAS/임시/apt_mst_info_202410.csv")
TARGET_SD = {"11", "41", "28"}
KS = [0.0, 1.0, 1.5, 2.0, 3.0]
CAP = 150.0  # 반경 상한(m)

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def classify(hits: set, truth: set) -> str:
    if not hits:
        return "무판정"
    if hits == truth:
        return "완전일치"
    if truth < hits:
        return "과다판정"
    if hits < truth:
        return "부족판정"
    if hits & truth:
        return "혼합"
    return "불일치"


def load_households():
    hh = {}
    with open(APT_MST, encoding="cp949") as f:
        for r in csv.DictReader(f):
            try:
                hh[r["apt_cd"]] = float(r["nmhsh"] or 0)
            except ValueError:
                pass
    return hh


def main():
    hh = load_households()
    print(f"세대수 확보 단지: {len(hh):,}개")

    sf = shapefile.Reader(str(SHP), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(fields)}
    geoms, names = [], []
    for sr in sf.iterShapeRecords():
        if sr.record[idx["SD_CD"]] not in TARGET_SD:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        geoms.append(g)
        names.append(sr.record[idx["HAKGUDO_NM"]])
    tree = STRtree(geoms)

    stats = {k: Counter() for k in KS}
    trans = Counter()
    no_size = 0
    n = 0

    with open(GEOMARKET, encoding="cp949") as f:
        for row in csv.DictReader(f):
            ld = row.get("legaldong_cd") or ""
            if ld[:2] not in TARGET_SD:
                continue
            try:
                lon, lat = float(row["lo"]), float(row["la"])
                info = json.loads(row["hakgudo_info"])
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            elem = info.get("초등학교") or []
            truth = {e["hakgudo_nm"] for e in elem if e.get("hakgudo_nm")}
            if not truth:
                continue
            n += 1

            households = hh.get(row["apt_cd"], 0)
            if not households:
                no_size += 1

            x, y = to_5186.transform(lon, lat)
            pt = Point(x, y)
            cand = []
            for i in tree.query(pt.buffer(CAP)):
                d = geoms[i].distance(pt)
                if d <= CAP:
                    cand.append((d, names[i]))

            per_k = {}
            for k in KS:
                r = min(k * math.sqrt(households), CAP) if households else 0.0
                hits = {nm for d, nm in cand if d <= r}
                per_k[k] = hits
                stats[k][classify(hits, truth)] += 1

            base = classify(per_k[0.0], truth)
            for k in KS[1:]:
                cur = classify(per_k[k], truth)
                if base != cur:
                    trans[(k, base, cur)] += 1

    print(f"대상 아파트 {n:,}개 (세대수 결측 {no_size:,})\n")
    print("=" * 80)
    print(f"{'k':>5} {'완전일치':>10} {'과다판정':>9} {'부족판정':>9} {'혼합':>7} {'불일치':>7} {'무판정':>7}")
    print("-" * 80)
    for k in KS:
        s = stats[k]
        print(
            f"{k:>5.1f} {s['완전일치']:>10,} {s['과다판정']:>9,} {s['부족판정']:>9,} "
            f"{s['혼합']:>7,} {s['불일치']:>7,} {s['무판정']:>7,}"
        )
    print("=" * 80)
    print("\n반경 0 대비 전이")
    print(f"{'k':>5} {'회수(부족→완전)':>16} {'회귀(완전→과다)':>16} {'순증':>10}")
    print("-" * 60)
    for k in KS[1:]:
        rec = trans[(k, "부족판정", "완전일치")]
        reg = trans[(k, "완전일치", "과다판정")]
        print(f"{k:>5.1f} {rec:>16,} {reg:>16,} {rec - reg:>+10,}")


if __name__ == "__main__":
    main()
