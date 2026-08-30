#!/usr/bin/env python3
"""
통학구역 폴리곤 공간조인 검증
================================
Geomarket 2024 배정정보(정답지)와, 통학구역 폴리곤에 아파트 좌표를 공간조인한
결과를 대조해 "Geomarket 없이 자체 산출이 가능한가"를 수치로 확인한다.

정답지 : etl/data/geomarket 계열 apt_hkd_info_2024.csv 의 hakgudo_info.초등학교[].hakgudo_nm
검증대상: etl/data/hakgudo/elem_hakgudo_20250922.shp 의 HAKGUDO_NM (ST_Contains 판정)

대상 범위: 서울(11) / 경기(41) / 인천(28)
"""

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import shapefile  # pyshp
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SHP = Path(__file__).parent / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
GEOMARKET = Path(
    r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv"
)
TARGET_SD = {"11", "41", "28"}  # 서울, 경기, 인천

# 폴리곤은 EPSG:5186(중부원점), 아파트 좌표는 WGS84.
# 폴리곤 정점 수백만 개를 변환하는 대신 점 2만 개를 5186으로 보낸다.
to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def load_polygons():
    """대상 지역 통학구역 폴리곤을 읽어 STRtree 인덱스로 반환."""
    sf = shapefile.Reader(str(SHP), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    idx = {n: i for i, n in enumerate(fields)}

    geoms, metas = [], []
    for sr in sf.iterShapeRecords():
        rec = sr.record
        if rec[idx["SD_CD"]] not in TARGET_SD:
            continue
        geom = shape(sr.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
        metas.append(
            {
                "id": rec[idx["HAKGUDO_ID"]],
                "nm": rec[idx["HAKGUDO_NM"]],
                "gb": rec[idx["HAKGUDO_GB"]],  # 0=통학구역 1=공동통학구역
                "edu": rec[idx["EDU_NM"]],
            }
        )
    return STRtree(geoms), geoms, metas


def load_geomarket():
    """Geomarket 배정정보에서 대상 지역 아파트와 정답 학구도명을 뽑는다."""
    rows = []
    with open(GEOMARKET, encoding="cp949") as f:
        for r in csv.DictReader(f):
            ld = r.get("legaldong_cd") or ""
            if ld[:2] not in TARGET_SD:
                continue
            try:
                lon, lat = float(r["lo"]), float(r["la"])
            except (TypeError, ValueError):
                continue
            try:
                info = json.loads(r["hakgudo_info"])
            except (json.JSONDecodeError, TypeError):
                continue
            # 키는 있지만 값이 null인 행이 있어 get(k, []) 로는 부족하다
            elem = info.get("초등학교") or []
            truth = {e.get("hakgudo_nm") for e in elem if e.get("hakgudo_nm")}
            if not truth:
                continue
            rows.append(
                {
                    "apt_cd": r["apt_cd"],
                    "apt_nm": r["apt_nm"],
                    "lon": lon,
                    "lat": lat,
                    "truth": truth,
                }
            )
    return rows


def main():
    print("통학구역 폴리곤 로딩...")
    tree, geoms, metas = load_polygons()
    print(f"  대상 폴리곤: {len(geoms):,}개")
    gb = Counter(m["gb"] for m in metas)
    print(f"  통학구역 {gb.get('0', 0):,} / 공동통학구역 {gb.get('1', 0):,}")

    print("Geomarket 배정정보 로딩...")
    apts = load_geomarket()
    print(f"  대상 아파트: {len(apts):,}개")

    print("공간조인 판정 중...")
    exact = partial = miss = nohit = 0
    samples = defaultdict(list)

    for a in apts:
        x, y = to_5186.transform(a["lon"], a["lat"])
        pt = Point(x, y)
        hits = {
            metas[i]["nm"]
            for i in tree.query(pt)
            if geoms[i].contains(pt)
        }

        if not hits:
            nohit += 1
            if len(samples["nohit"]) < 5:
                samples["nohit"].append((a["apt_nm"], sorted(a["truth"])))
        elif hits == a["truth"]:
            exact += 1
        elif hits & a["truth"]:
            partial += 1
            if len(samples["partial"]) < 5:
                samples["partial"].append((a["apt_nm"], sorted(a["truth"]), sorted(hits)))
        else:
            miss += 1
            if len(samples["miss"]) < 5:
                samples["miss"].append((a["apt_nm"], sorted(a["truth"]), sorted(hits)))

    total = len(apts)
    print()
    print("=" * 58)
    print(f"{'전체 대상':<22}{total:>10,}")
    print(f"{'완전일치':<22}{exact:>10,}  {exact/total*100:5.1f}%")
    print(f"{'부분일치(교집합 있음)':<22}{partial:>10,}  {partial/total*100:5.1f}%")
    print(f"{'불일치':<22}{miss:>10,}  {miss/total*100:5.1f}%")
    print(f"{'폴리곤 밖(무판정)':<22}{nohit:>10,}  {nohit/total*100:5.1f}%")
    print("-" * 58)
    agree = exact + partial
    print(f"{'실질 일치(완전+부분)':<22}{agree:>10,}  {agree/total*100:5.1f}%")
    print("=" * 58)

    for key, title in [
        ("partial", "부분일치 예시 (정답 / 공간조인)"),
        ("miss", "불일치 예시 (정답 / 공간조인)"),
        ("nohit", "폴리곤 밖 예시"),
    ]:
        if samples[key]:
            print(f"\n▸ {title}")
            for s in samples[key]:
                print(f"   {s[0]}: {' / '.join(str(x) for x in s[1:])}")


if __name__ == "__main__":
    main()
