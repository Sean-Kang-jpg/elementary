"""Deterministic MOLIT apartment-trade linkage primitives.

Raw rows stay private.  This module deliberately returns decisions and evidence;
it never mutates an existing crosswalk.  A confirmed ``aptSeq`` mapping is reused
only while the incoming official address still agrees with its recorded evidence.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable


MATCHER_VERSION = "molit-apartment-v2"
DETERMINISTIC_TIERS = {
    "confirmed_apt_seq",
    "official_parcel_name",
    "unique_official_parcel",
    "road_address_name",
}


def normalize_name(value: str | None) -> str:
    text = re.sub(r"\s+", "", value or "").lower()
    return re.sub(r"(?:아파트|apt\.?|주상복합)$", "", text)


def normalize_number(value: str | None, width: int = 4) -> str:
    digits = re.sub(r"\D", "", value or "")
    return str(int(digits or "0")).zfill(width)


def official_legal_code(row: dict[str, str]) -> str:
    full = (row.get("legal_dong_code") or "").strip()
    if len(full) == 10 and full.isdigit():
        return full
    sgg = value(row, "sggCd", "법정동시군구코드")
    umd = value(row, "umdCd", "법정동읍면동코드")
    if len(sgg) == 5 and len(umd) == 5 and sgg.isdigit() and umd.isdigit():
        return sgg + umd
    return ""


def parcel_key(row: dict[str, str]) -> tuple[str, str, str] | None:
    code = official_legal_code(row)
    if not code:
        return None
    bonbun = value(row, "bonbun", "본번")
    bubun = value(row, "bubun", "부번")
    if not bonbun:
        # ``apt_cd`` is opaque.  Its apparent numeric segments do not reproduce
        # legal parcel numbers across the production master, so never parse it.
        # The legal-dong code is authoritative; the number is extracted only
        # from the source's standard legal-address field.
        address = (row.get("legal_address") or "").replace("번지", "")
        matches = list(re.finditer(r"(?:산\s*)?(\d+)(?:-(\d+))?", address))
        if matches:
            match = matches[-1]
            bonbun, bubun = match.group(1), match.group(2) or "0"
    if not bonbun:
        return None
    return code, normalize_number(bonbun), normalize_number(bubun)


def road_key(row: dict[str, str]) -> tuple[str, str, str] | None:
    name = value(row, "roadNm", "도로명")
    bonbun = value(row, "roadNmBonbun", "도로명건물본번호코드")
    bubun = value(row, "roadNmBubun", "도로명건물부번호코드")
    if name and bonbun:
        return re.sub(r"\s+", "", name), normalize_number(bonbun, 5), normalize_number(bubun, 5)
    address = (row.get("road_address") or row.get("kapt_road_address") or "").strip()
    match = re.search(r"\s([^\s]+(?:로|길))\s+(\d+)(?:-(\d+))?", address)
    if not match:
        return None
    return match.group(1), normalize_number(match.group(2), 5), normalize_number(match.group(3), 5)


def value(row: dict[str, str], *names: str) -> str:
    for name in names:
        if row.get(name):
            return str(row[name]).strip()
    return ""


def aliases(row: dict[str, str]) -> set[str]:
    names = {row.get("apt_nm", ""), row.get("latest_known_name", ""), row.get("kapt_name", "")}
    try:
        names.update(json.loads(row.get("name_aliases") or "[]"))
    except (json.JSONDecodeError, TypeError):
        pass
    return {name for item in names if (name := normalize_name(item))}


@dataclass(frozen=True)
class Candidate:
    canonical_complex_id: str
    apt_cd_list: tuple[str, ...]
    names: frozenset[str]
    parcel_keys: frozenset[tuple[str, str, str]]
    road_keys: frozenset[tuple[str, str, str]]


@dataclass(frozen=True)
class Decision:
    status: str
    tier: str
    canonical_complex_id: str | None
    candidate_ids: tuple[str, ...]
    evidence: dict[str, Any]

    @property
    def deterministic(self) -> bool:
        return self.status == "confirmed" and self.tier in DETERMINISTIC_TIERS


def collapse_master(rows: Iterable[dict[str, str]]) -> list[Candidate]:
    """Collapse atom rows before judging ambiguity.

    Multiple ``apt_cd`` rows can describe one management complex.  Counting
    those rows as separate candidates was the v1 profiler's main ambiguity bug.
    """
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        complex_id = (row.get("canonical_complex_id") or "").strip()
        if not complex_id:
            continue
        item = grouped.setdefault(
            complex_id,
            {"apt_cd": set(), "names": set(), "parcels": set(), "roads": set()},
        )
        if row.get("apt_cd"):
            item["apt_cd"].add(row["apt_cd"])
        item["names"].update(aliases(row))
        if key := parcel_key(row):
            item["parcels"].add(key)
        if key := road_key(row):
            item["roads"].add(key)
    return [
        Candidate(
            canonical_complex_id=complex_id,
            apt_cd_list=tuple(sorted(data["apt_cd"])),
            names=frozenset(data["names"]),
            parcel_keys=frozenset(data["parcels"]),
            road_keys=frozenset(data["roads"]),
        )
        for complex_id, data in sorted(grouped.items())
    ]


def overlay_missing_master_atoms(
    primary_rows: Iterable[dict[str, str]],
    supplement_rows: Iterable[dict[str, str]],
) -> list[dict[str, str]]:
    """Append only supplement atoms absent from the authoritative master.

    Concatenating complete historical masters can resurrect stale groupings and
    make one ``apt_cd`` belong to two current candidates.  Supplements are only
    allowed to fill genuinely missing atoms (typically newly issued K-apt rows).
    """
    primary = list(primary_rows)
    known_atoms = {row.get("apt_cd", "") for row in primary if row.get("apt_cd")}
    additions: list[dict[str, str]] = []
    for row in supplement_rows:
        atom = row.get("apt_cd", "")
        if atom and atom not in known_atoms:
            additions.append(row)
            known_atoms.add(atom)
    return [*primary, *additions]


class Linker:
    def __init__(self, candidates: Iterable[Candidate], confirmed_apt_seq: dict[str, dict[str, Any]] | None = None):
        self.candidates = {candidate.canonical_complex_id: candidate for candidate in candidates}
        self.confirmed_apt_seq = confirmed_apt_seq or {}
        self.parcels: dict[tuple[str, str, str], set[str]] = defaultdict(set)
        self.roads: dict[tuple[str, str, str], set[str]] = defaultdict(set)
        self.names: dict[tuple[str, str], set[str]] = defaultdict(set)
        for candidate in self.candidates.values():
            for key in candidate.parcel_keys:
                self.parcels[key].add(candidate.canonical_complex_id)
                for name in candidate.names:
                    self.names[(key[0][:5], name)].add(candidate.canonical_complex_id)
            for key in candidate.road_keys:
                self.roads[key].add(candidate.canonical_complex_id)

    def decide(self, trade: dict[str, str]) -> Decision:
        apt_seq = value(trade, "aptSeq")
        parcel = parcel_key(trade)
        road = road_key(trade)
        name = normalize_name(value(trade, "aptNm", "아파트"))
        evidence = {"matcher_version": MATCHER_VERSION, "apt_seq": apt_seq, "parcel_key": parcel, "road_key": road}

        prior = self.confirmed_apt_seq.get(apt_seq) if apt_seq else None
        if prior:
            prior_id = str(prior["canonical_complex_id"])
            expected_parcel = tuple(prior.get("parcel_key") or ())
            if expected_parcel and parcel and expected_parcel != parcel:
                return Decision("review", "apt_seq_address_conflict", None, (prior_id,), evidence)
            return Decision("confirmed", "confirmed_apt_seq", prior_id, (prior_id,), evidence)

        parcel_ids = set(self.parcels.get(parcel, ())) if parcel else set()
        exact = {item for item in parcel_ids if name and name in self.candidates[item].names}
        if len(exact) == 1:
            item = next(iter(exact))
            return Decision("confirmed", "official_parcel_name", item, (item,), evidence)
        if len(parcel_ids) == 1:
            item = next(iter(parcel_ids))
            return Decision("confirmed", "unique_official_parcel", item, (item,), evidence)

        road_ids = set(self.roads.get(road, ())) if road else set()
        road_exact = {item for item in road_ids if name and name in self.candidates[item].names}
        if len(road_exact) == 1:
            item = next(iter(road_exact))
            return Decision("confirmed", "road_address_name", item, (item,), evidence)

        district = value(trade, "sggCd", "법정동시군구코드")
        name_ids = set(self.names.get((district, name), ())) if district and name else set()
        candidates = tuple(sorted(exact or parcel_ids or road_exact or road_ids or name_ids))
        if len(name_ids) == 1:
            # Useful evidence, but never auto-confirm: same-name redevelopment and
            # renamed complexes are exactly where false positives are expensive.
            return Decision("review", "unique_district_name", None, tuple(name_ids), evidence)
        return Decision("review", "ambiguous" if candidates else "unmatched", None, candidates, evidence)


def decimal_value(value_text: str) -> Decimal:
    try:
        return Decimal(value_text.replace(",", "").strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError(f"invalid decimal value: {value_text!r}") from exc


def trade_fingerprint(row: dict[str, str]) -> str:
    """A comparison fingerprint, not a transaction identifier.

    Equal fingerprints are retained with occurrence ordinals by the collector;
    identical legitimate trades must not collapse into one row.
    """
    fields = (
        value(row, "aptSeq"), value(row, "dealYear"), value(row, "dealMonth"),
        value(row, "dealDay"), value(row, "excluUseAr"), value(row, "floor"),
        value(row, "dealAmount"), value(row, "aptDong"), value(row, "dealingGbn"),
    )
    return "|".join(fields)


def area_band(area: Decimal) -> str:
    if area < Decimal("60"):
        return "under_60"
    if area < Decimal("85"):
        return "60_to_84_9999"
    if area < Decimal("102"):
        return "85_to_101_9999"
    return "102_plus"
