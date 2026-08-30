#!/usr/bin/env python3
"""
동 단위 판정으로 부분일치의 진위 확인
=======================================
Geomarket이 복수 학교를 부여한 단지가 실제로 동마다 학구가 갈리는지,
VWorld 건물 폴리곤(LT_C_SPBD, 동 단위)으로 직접 확인한다.

단지 매칭은 도로명주소로 한다. Geomarket rdnmadr("서울특별시 중구 다산로 32")를
건물 속성 rd_nm("다산로") + buld_no("32")와 맞춘다.
"""

import csv
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import shapefile
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KEY = os.getenv("VWORLD_API_KEY") or "B6A216F3-038A-366B-B85D-44324FF03BDB"
DOMAIN = "https://github.com/sean-kang-jpg/elementary"
BASE = Path(__file__).parent
SHP = BASE / "data" / "hakgudo" / "elem_hakgudo_20250922.shp"
GEOMARKET = Path(
    r"F:/sm/vibe/elementary/archive/legacy-v1/etl/data/geomarket/apt_hkd_info_2024.csv"
)
APT_MST = Path(r"F:/sm/vibe/elementary/archive/GAS/GAS/임시/apt_mst_info_202410.csv")
SAMPLE = 25
DEG = 0.006  # bbox 반폭(약 500m)

to_5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)


def load_districts():
    sf = shapefile.Reader(str(SHP), encoding="euc-kr")
    fields = [f[0] for f in sf.fields[1:]]
    ix = {n: i for i, n in enumerate(fields)}
    geoms, names = [], []
    for sr in sf.iterShapeRecords():
        if sr.record[ix["SD_CD"]] not in {"11", "41", "28"}:
            continue
        g = shape(sr.shape.__geo_interface__)
        if not g.is_valid:
            g = g.buffer(0)
        geoms.append(g)
        names.append(sr.record[ix["HAKGUDO_NM"]])
    return STRtree(geoms), geoms, names


def fetch_buildings(lon, lat):
    q = urllib.parse.urlencode(
        {
            "service": "data",
            "request": "GetFeature",
            "data": "LT_C_SPBD",
            "key": KEY,
            "domain": DOMAIN,
            "format": "json",
            "size": "1000",
            "crs": "EPSG:4326",
            "geomFilter": f"BOX({lon-DEG},{lat-DEG},{lon+DEG},{lat+DEG})",
        }
    )
    with urllib.request.urlopen(f"https://api.vworld.kr/req/data?{q}", timeout=60) as r:
        d = json.loads(r.read().decode("utf-8"))
    res = d.get("response", {}).get("result")
    if not res:
        return []
    return res["featureCollection"]["features"]


def parse_road(rdnmadr: str):
    """'서울특별시 중구 다산로 32' → ('다산로', '32')"""
    m = re.search(r"([가-힣A-Za-z0-9]+(?:로|길))\s+(\d+(?:-\d+)?)\s*$", rdnmadr.strip())
    return (m.group(1), m.group(2)) if m else (None, None)


def summarize_candidates(features, limit=8):
    rows = []
    for f in features:
        p = f.get("properties", {})
        dc = p.get("buld_nm_dc") or ""
        if not re.search(r"\d+동", dc):
            continue
        rows.append(
            f"{p.get('rd_nm','')}/{p.get('buld_no','')} · "
            f"{p.get('buld_nm','')} · {dc}"
        )
        if len(rows) >= limit:
            break
    return rows


def main():
    parser = argparse.ArgumentParser(description="VWorld 건물 폴리곤으로 복수 학구 단지를 검증한다.")
    parser.add_argument("--sample", type=int, default=SAMPLE, help="세대수 큰 순 검증 대상 수")
    parser.add_argument("--out", type=Path, help="요약 CSV 저장 경로")
    parser.add_argument("--debug-failures", action="store_true", help="건물 매칭 실패 시 후보 속성 출력")
    args = parser.parse_args()

    tree, geoms, names = load_districts()
    print(f"학구 폴리곤 {len(geoms):,}개 로드")

    hh = {}
    with open(APT_MST, encoding="cp949") as f:
        for r in csv.DictReader(f):
            try:
                hh[r["apt_cd"]] = float(r["nmhsh"] or 0)
            except ValueError:
                pass

    # 부분일치 후보 = Geomarket이 복수 부여 + 점 판정은 부분집합
    targets = []
    with open(GEOMARKET, encoding="cp949") as f:
        for row in csv.DictReader(f):
            if (row.get("legaldong_cd") or "")[:2] not in {"11", "41", "28"}:
                continue
            try:
                lon, lat = float(row["lo"]), float(row["la"])
                info = json.loads(row["hakgudo_info"])
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            truth = {e["hakgudo_nm"] for e in (info.get("초등학교") or []) if e.get("hakgudo_nm")}
            if len(truth) < 2:
                continue
            pt = Point(*to_5186.transform(lon, lat))
            hits = {names[i] for i in tree.query(pt) if geoms[i].contains(pt)}
            if hits and hits < truth:
                targets.append((row, lon, lat, truth, hits, hh.get(row["apt_cd"], 0)))

    targets.sort(key=lambda t: -t[5])  # 큰 단지부터
    targets = targets[: args.sample]
    print(f"검증 대상 {len(targets)}개 (세대수 큰 순)\n")

    agree_point = split_real = nomatch = 0
    rows = []
    for row, lon, lat, truth, hits, households in targets:
        rd, no = parse_road(row["rdnmadr"])
        try:
            feats = fetch_buildings(lon, lat)
        except Exception as e:
            print(f"  {row['apt_nm']}: API 실패 {e}")
            continue
        time.sleep(0.3)

        dongs = [
            f
            for f in feats
            if re.match(r"^\d+동$", f["properties"].get("buld_nm_dc") or "")
            and (
                (rd and f["properties"].get("rd_nm") == rd and f["properties"].get("buld_no") == no)
                or f["properties"].get("buld_nm") == row["apt_nm"]
            )
        ]
        if not dongs:
            nomatch += 1
            print(f"■ {row['apt_nm']} ({households:.0f}세대) — 건물 매칭 실패")
            if args.debug_failures:
                for c in summarize_candidates(feats):
                    print(f"   후보: {c}")
            rows.append(
                {
                    "apt_nm": row["apt_nm"],
                    "rdnmadr": row["rdnmadr"],
                    "households": f"{households:.0f}",
                    "geomarket": " | ".join(sorted(truth)),
                    "point_hits": " | ".join(sorted(hits)),
                    "building_hits": "",
                    "dong_count": "0",
                    "verdict": "건물 매칭 실패",
                }
            )
            continue

        per = defaultdict(list)
        for f in dongs:
            c = shape(f["geometry"]).centroid
            p = Point(*to_5186.transform(c.x, c.y))
            hit = [names[i] for i in tree.query(p) if geoms[i].contains(p)]
            per[hit[0] if hit else "(없음)"].append(f["properties"]["buld_nm_dc"])

        found = set(per)
        verdict = "동별로 갈림 → Geomarket 옳음" if len(found) > 1 else "단일 학구 → 점 판정 옳음"
        if len(found) > 1:
            split_real += 1
        else:
            agree_point += 1
        print(f"■ {row['apt_nm']} ({households:.0f}세대, {len(dongs)}개 동) — {verdict}")
        print(f"   Geomarket : {sorted(truth)}")
        print(f"   건물 판정  : {[f'{k}({len(v)}동)' for k, v in per.items()]}")
        rows.append(
            {
                "apt_nm": row["apt_nm"],
                "rdnmadr": row["rdnmadr"],
                "households": f"{households:.0f}",
                "geomarket": " | ".join(sorted(truth)),
                "point_hits": " | ".join(sorted(hits)),
                "building_hits": " | ".join(f"{k}({len(v)}동)" for k, v in per.items()),
                "dong_count": str(len(dongs)),
                "verdict": verdict,
            }
        )

    print("\n" + "=" * 60)
    print(f"동별로 실제 갈림 (Geomarket 옳음) : {split_real}")
    print(f"단일 학구 (점 판정 옳음)          : {agree_point}")
    print(f"건물 매칭 실패                    : {nomatch}")
    resolved = split_real + agree_point
    total = resolved + nomatch
    if total:
        print(f"판정 성공률                       : {resolved}/{total} ({resolved / total:.1%})")
    if resolved:
        print(f"성공 표본 중 동별 분리            : {split_real}/{resolved} ({split_real / resolved:.1%})")

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=[
                    "apt_nm",
                    "rdnmadr",
                    "households",
                    "geomarket",
                    "point_hits",
                    "building_hits",
                    "dong_count",
                    "verdict",
                ],
            )
            writer.writeheader()
            writer.writerows(rows)
        print(f"CSV 저장: {args.out}")


if __name__ == "__main__":
    main()
