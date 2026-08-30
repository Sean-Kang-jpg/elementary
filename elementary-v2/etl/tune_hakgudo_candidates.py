#!/usr/bin/env python3
"""
'인접 후보' 추가 전략의 정밀도 측정
=====================================
점 판정으로 나온 학구를 '주 배정'으로 두고, 그 밖의 학구를 '인접 후보'로
덧붙일 때 그 후보가 실제로 맞는 비율(정밀도)을 잰다.

앞선 실험은 아파트 단위 상태 전이를 봤지만, 여기서는 학구 단위로
  맞는 추가 : 정답지에 있는 학구를 덧붙임
  틀린 추가 : 정답지에 없는 학구를 덧붙임
을 세어 후보 목록이 쓸 만한지 판단한다. 세대수 구간별로도 나눈다.
"""

import csv
import json
import math
import sys
from collections import Counter, defaultdict
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
CAP = 200.0

STRATEGIES = [
    ("고정 25m", lambda hh: 25.0),
    ("고정 50m", lambda hh: 50.0),
    ("고정 100m", lambda hh: 100.0),
    ("규모 1.0·√세대", lambda hh: min(1.0 * math.sqrt(hh), CAP) if hh else 0.0),
    ("규모 1.5·√세대", lambda hh: min(1.5 * math.sqrt(hh), CAP) if hh else 0.0),
    ("규모 2.0·√세대", lambda hh: min(2.0 * math.sqrt(hh), CAP) if hh else 0.0),
    ("300세대+만 50m", lambda hh: 50.0 if hh >= 300 else 0.0),
    ("500세대+만 75m", lambda hh: 75.0 if hh >= 500 else 0.0),
    ("1000세대+만 100m", lambda hh: 100.0 if hh >= 1000 else 0.0),
]

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


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
    hh_map = load_households()

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

    good = Counter()  # 맞는 추가
    bad = Counter()  # 틀린 추가
    by_size = defaultdict(lambda: [0, 0])  # 세대수 구간 → [맞음, 틀림] (고정 50m 기준)
    total_missing = 0
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
            hh = hh_map.get(row["apt_cd"], 0)

            x, y = to_5186.transform(lon, lat)
            pt = Point(x, y)
            cand = []
            contain = set()
            for i in tree.query(pt.buffer(CAP)):
                d = geoms[i].distance(pt)
                if d == 0:
                    contain.add(names[i])
                elif d <= CAP:
                    cand.append((d, names[i]))

            total_missing += len(truth - contain)

            for label, fn in STRATEGIES:
                r = fn(hh)
                if r <= 0:
                    continue
                for d, nm in cand:
                    if d <= r and nm not in contain:
                        if nm in truth:
                            good[label] += 1
                        else:
                            bad[label] += 1

            # 세대수 구간별 (고정 50m 기준)
            bucket = (
                "~300" if hh < 300 else "300~500" if hh < 500
                else "500~1000" if hh < 1000 else "1000+"
            )
            for d, nm in cand:
                if d <= 50 and nm not in contain:
                    by_size[bucket][0 if nm in truth else 1] += 1

    print(f"대상 아파트 {n:,}개 · 점 판정이 놓친 학구 총 {total_missing:,}건\n")
    print("=" * 76)
    print(f"{'전략':<18}{'맞는 추가':>10}{'틀린 추가':>10}{'정밀도':>9}{'회수율':>9}")
    print("-" * 76)
    for label, _ in STRATEGIES:
        g, b = good[label], bad[label]
        if g + b == 0:
            continue
        prec = g / (g + b) * 100
        rec = g / total_missing * 100
        print(f"{label:<18}{g:>10,}{b:>10,}{prec:>8.1f}%{rec:>8.1f}%")
    print("=" * 76)

    print("\n세대수 구간별 (고정 50m 기준)")
    print("-" * 56)
    print(f"{'세대수':<12}{'맞는 추가':>10}{'틀린 추가':>10}{'정밀도':>10}")
    print("-" * 56)
    for k in ["~300", "300~500", "500~1000", "1000+"]:
        g, b = by_size[k]
        if g + b == 0:
            continue
        print(f"{k:<12}{g:>10,}{b:>10,}{g/(g+b)*100:>9.1f}%")


if __name__ == "__main__":
    main()
