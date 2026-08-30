#!/usr/bin/env python3
"""
버퍼 반경 튜닝 — 회수와 회귀를 동시에 측정
============================================
점 좌표 판정(반경 0)에서 놓친 '경계에 걸친 단지'를 버퍼로 회수하되,
이미 정확히 맞던 단지에 이웃 학구가 덧붙는 부작용을 같이 잰다.

반경별로 점 판정 대비 상태 전이를 집계한다:
  회수  : 부족판정 → 완전일치   (버퍼가 도움이 된 경우)
  회귀  : 완전일치 → 과다판정   (버퍼가 망친 경우)

한 점에서 각 폴리곤까지 거리를 한 번만 계산하고 반경별로 임계값만
바꾸므로 반경을 늘려도 비용이 늘지 않는다.
"""

import csv
import json
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
TARGET_SD = {"11", "41", "28"}
RADII = [0, 25, 50, 75, 100, 150, 200]  # meter (EPSG:5186 단위)

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


def main():
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
    print(f"대상 폴리곤 {len(geoms):,}개 · 반경 {RADII} m\n")

    maxr = max(RADII)
    stats = {r: Counter() for r in RADII}
    transitions = Counter()
    regress_samples = []
    recover_samples = []
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

            x, y = to_5186.transform(lon, lat)
            pt = Point(x, y)

            # 최대 반경 안의 후보만 뽑아 거리를 한 번씩 잰다
            cand = []
            for i in tree.query(pt.buffer(maxr)):
                d = geoms[i].distance(pt)
                if d <= maxr:
                    cand.append((d, names[i]))

            per_r = {}
            for r in RADII:
                hits = {nm for d, nm in cand if d <= r}
                per_r[r] = hits
                stats[r][classify(hits, truth)] += 1

            base = classify(per_r[0], truth)
            for r in RADII[1:]:
                cur = classify(per_r[r], truth)
                if base != cur:
                    transitions[(r, base, cur)] += 1
                if r == 100:
                    if base == "완전일치" and cur == "과다판정" and len(regress_samples) < 5:
                        regress_samples.append(
                            (row["apt_nm"], sorted(truth), sorted(per_r[r] - truth))
                        )
                    if base == "부족판정" and cur == "완전일치" and len(recover_samples) < 5:
                        recover_samples.append((row["apt_nm"], sorted(truth)))

    print(f"대상 아파트 {n:,}개\n")
    print("=" * 78)
    hdr = f"{'반경':>5} {'완전일치':>10} {'과다판정':>9} {'부족판정':>9} {'혼합':>7} {'불일치':>7} {'무판정':>7}"
    print(hdr)
    print("-" * 78)
    for r in RADII:
        s = stats[r]
        print(
            f"{r:>4}m {s['완전일치']:>10,} {s['과다판정']:>9,} {s['부족판정']:>9,} "
            f"{s['혼합']:>7,} {s['불일치']:>7,} {s['무판정']:>7,}"
        )
    print("=" * 78)

    print("\n점 판정(0m) 대비 상태 전이")
    print("-" * 78)
    print(f"{'반경':>5} {'회수(부족→완전)':>16} {'회귀(완전→과다)':>16} {'순증':>10}")
    print("-" * 78)
    for r in RADII[1:]:
        rec = transitions[(r, "부족판정", "완전일치")]
        reg = transitions[(r, "완전일치", "과다판정")]
        print(f"{r:>4}m {rec:>16,} {reg:>16,} {rec - reg:>+10,}")
    print("-" * 78)

    if recover_samples:
        print("\n▸ 100m에서 회수된 예시")
        for a, t in recover_samples:
            print(f"   {a}: {t}")
    if regress_samples:
        print("\n▸ 100m에서 회귀한 예시 (정답 / 덧붙은 학구)")
        for a, t, extra in regress_samples:
            print(f"   {a}: {t} + {extra}")


if __name__ == "__main__":
    main()
