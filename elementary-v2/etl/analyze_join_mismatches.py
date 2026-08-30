#!/usr/bin/env python3
"""
공간조인 불일치 원인 분류
==========================
verify_hakgudo_spatial_join.py 에서 나온 불일치·부분일치가
(a) Geomarket 2024가 낡아서인지  (b) 공간조인 자체의 한계인지 가른다.

판정 근거: 정답지가 지목한 학교가 2026-03 학교위치 표준데이터에 살아있는지.
없으면 폐교·통폐합 → Geomarket이 낡은 것이고 폴리곤이 맞다.
"""

import csv
import json
import re
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
SCHOOLS = BASE / "data" / "schoolzone" / "school_location_20260320.csv"
GEOMARKET = Path(
    r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv"
)
TARGET_SD = {"11", "41", "28"}

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def norm_school(name: str) -> str:
    """'서울보광초등학교' / '서울보광초' → '서울보광초' 로 통일."""
    n = re.sub(r"\s+", "", name)
    n = n.replace("등학교", "").replace("학교", "")
    return n


def live_schools():
    """2026-03 기준 운영 중인 초등학교 정규화 이름 집합."""
    live = set()
    with open(SCHOOLS, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["학교급구분"] == "초등학교" and r["운영상태"] == "운영":
                live.add(norm_school(r["학교명"]))
    return live


def schools_in_hakgudo(nm: str):
    """학구도명에서 학교명들을 뽑는다. 공동통학구역은 여러 학교를 담는다."""
    body = nm.replace("공동통학구역", "").replace("통학구역", "")
    return [norm_school(s + "초") for s in body.split("초") if s]


def main():
    live = live_schools()
    print(f"2026-03 운영 중 초등학교: {len(live):,}개")

    sf = shapefile.Reader(str(SHP), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(fields)}
    geoms, metas = [], []
    for sr in sf.iterShapeRecords():
        if sr.record[idx["SD_CD"]] not in TARGET_SD:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        geoms.append(g)
        metas.append(sr.record[idx["HAKGUDO_NM"]])
    tree = STRtree(geoms)
    print(f"대상 폴리곤: {len(geoms):,}개")

    stale = fresh_only = genuine = 0
    stale_names = Counter()
    genuine_samples = []
    partial_cause = Counter()

    with open(GEOMARKET, encoding="cp949") as f:
        for r in csv.DictReader(f):
            ld = r.get("legaldong_cd") or ""
            if ld[:2] not in TARGET_SD:
                continue
            try:
                lon, lat = float(r["lo"]), float(r["la"])
                info = json.loads(r["hakgudo_info"])
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            elem = info.get("초등학교") or []
            truth = {e["hakgudo_nm"] for e in elem if e.get("hakgudo_nm")}
            if not truth:
                continue

            x, y = to_5186.transform(lon, lat)
            pt = Point(x, y)
            hits = {metas[i] for i in tree.query(pt) if geoms[i].contains(pt)}

            if hits == truth or not hits:
                continue

            # 정답지가 지목한 학교 중 지금은 없어진 학교가 있는가
            truth_schools = {s for nm in truth for s in schools_in_hakgudo(nm)}
            dead = truth_schools - live

            if hits & truth:
                # 부분일치: 정답이 더 많음 → 단지가 여러 학구에 걸침
                partial_cause["단지가 복수 학구에 걸침(점 좌표 한계)"] += 1
                continue

            if dead:
                stale += 1
                for d in dead:
                    stale_names[d] += 1
            elif any("공동통학구역" in h for h in hits):
                fresh_only += 1
            else:
                genuine += 1
                if len(genuine_samples) < 12:
                    genuine_samples.append((r["apt_nm"], sorted(truth), sorted(hits)))

    print()
    print("=" * 62)
    print("완전 불일치 건의 원인 분류")
    print("-" * 62)
    print(f"{'폐교·통폐합 (Geomarket이 낡음)':<38}{stale:>8,}")
    print(f"{'공동통학구역으로 개편 (폴리곤이 최신)':<38}{fresh_only:>8,}")
    print(f"{'원인 미상 (검토 필요)':<38}{genuine:>8,}")
    print("=" * 62)

    if stale_names:
        print("\n▸ 2026-03 기준 사라진 학교 (건수)")
        for n, c in stale_names.most_common(12):
            print(f"   {n:<16} {c:>5,}건")

    if partial_cause:
        print("\n▸ 부분일치 원인")
        for k, v in partial_cause.items():
            print(f"   {k}: {v:,}건")

    if genuine_samples:
        print("\n▸ 원인 미상 예시 (정답 / 공간조인)")
        for a, t, h in genuine_samples:
            print(f"   {a}: {t} / {h}")


if __name__ == "__main__":
    main()
