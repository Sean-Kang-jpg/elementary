"""Canonical region registry for the nationwide expansion (N0-N4).

Every production path that needs to know which regions exist, what they are
called, how their addresses start, or where their coordinates may fall reads
this module instead of holding its own region list.

The registry deliberately distinguishes verified facts from assumptions:
`school_name_prefix_status` and `bounds_source` say whether a value was
confirmed against collected data. Assumed values must be confirmed by the
region's EDA pass before they are used in production matching.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

REGISTRY_PATH = Path(__file__).with_name("region_registry.json")

CAPITAL_REGIONS = ("서울특별시", "경기도", "인천광역시")


class RegionScopeError(ValueError):
    """Raised when a scope names a region the registry does not define."""


@dataclass(frozen=True)
class Bounds:
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float

    def contains(self, latitude: float, longitude: float) -> bool:
        return (
            self.min_lat <= latitude <= self.max_lat
            and self.min_lng <= longitude <= self.max_lng
        )


@dataclass(frozen=True)
class Region:
    canonical_name: str
    short_name: str
    aliases: tuple[str, ...]
    address_prefixes: tuple[str, ...]
    legal_dong_code: str
    legacy_legal_dong_codes: tuple[str, ...]
    neis_office_code: str
    education_office: str
    education_office_aliases: tuple[str, ...]
    school_name_prefix: str | None
    school_name_prefix_coverage_pct: float
    has_city_level: bool
    bounds: Bounds
    bounds_source: str
    center: tuple[float, float]
    center_source: str
    wave: str
    status: str
    elementary_school_count: int | None = None
    education_support_office_count: int | None = None
    region_notes: str | None = None

    @property
    def is_production(self) -> bool:
        return self.status == "production"

    @property
    def has_school_name_prefix(self) -> bool:
        """Whether any school in the region carries the region prefix.

        Coverage is never 100%: 대구 reaches 96.6% and 부산 only 1.3%. The prefix
        is therefore a matching variant, not a rule, and both forms of a label
        must be accepted.
        """
        return bool(self.school_name_prefix) and self.school_name_prefix_coverage_pct > 0

    def name_variants(self, name: str) -> tuple[str, ...]:
        """Both forms of a school or school-zone name: with and without the prefix."""
        text = str(name or "").strip()
        if not text:
            return ()
        if not self.has_school_name_prefix:
            return (text,)
        prefix = self.school_name_prefix or ""
        if text.startswith(prefix):
            return (text, text[len(prefix):])
        return (text, f"{prefix}{text}")

    @property
    def legal_dong_codes(self) -> tuple[str, ...]:
        return (self.legal_dong_code, *self.legacy_legal_dong_codes)


@dataclass(frozen=True)
class RegionScope:
    """One unit of expansion work: a whole region, or named cities inside it."""

    region: Region
    cities: tuple[str, ...] = ()

    @property
    def label(self) -> str:
        if not self.cities:
            return self.region.canonical_name
        return f"{self.region.canonical_name} / {', '.join(self.cities)}"

    def includes_address(self, address: str) -> bool:
        text = str(address or "").strip()
        if not text.startswith(tuple(self.region.address_prefixes)):
            return False
        if not self.cities:
            return True
        remainder = text
        for prefix in self.region.address_prefixes:
            if remainder.startswith(prefix):
                remainder = remainder[len(prefix):].strip()
                break
        return remainder.startswith(tuple(self.cities))


@dataclass(frozen=True)
class MergedSourceRegion:
    """A source value that does not map onto exactly one registry region.

    `전남광주통합특별시` is the current case: 광주시 and 전라남도 merged on
    2026-07-01, so one K-apt `시도` value covers two registry regions. It is
    resolved by 시군구 (the five 광주 구) or by the row's own road address,
    never by treating it as an alias of either half.
    """

    source_value: str
    sigungu_map: dict[str, str]
    default_region: str
    observed_spellings: tuple[str, ...] = ()
    address_prefixes: tuple[str, ...] = ()
    education_offices: tuple[str, ...] = ()
    official_name: str | None = None
    effective_from: str | None = None
    education_office_merges: bool = False
    note: str | None = None

    def matches(self, value: str) -> bool:
        """Whether a source value is this merged region, under any spelling."""
        normalized = _normalize(value)
        candidates = {self.source_value, self.official_name or "", *self.observed_spellings}
        return normalized in {_normalize(name) for name in candidates if name}

    def region_name_for(self, sigungu: str | None) -> str:
        return self.sigungu_map.get(_normalize(sigungu), self.default_region)

    def matches_office(self, office: str) -> bool:
        normalized = _normalize(office)
        return normalized in {_normalize(name) for name in self.education_offices}

    def region_name_for_address(self, address: str) -> str | None:
        """Split a merged address by the token that follows the region name."""
        text = str(address or "").strip()
        for prefix in self.address_prefixes:
            if text.startswith(prefix):
                remainder = text[len(prefix):].strip().split()
                return self.region_name_for(remainder[0] if remainder else None)
        return None


class RegionRegistry:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.registry_version: str = payload["registry_version"]
        self.updated: str = payload["updated"]
        self.merged_source_regions: tuple[MergedSourceRegion, ...] = tuple(
            MergedSourceRegion(
                source_value=row["source_value"],
                sigungu_map={_normalize(k): v for k, v in row.get("sigungu_map", {}).items()},
                default_region=row["default_region"],
                observed_spellings=tuple(row.get("observed_spellings", ())),
                address_prefixes=tuple(row.get("address_prefixes", ())),
                education_offices=tuple(row.get("education_offices", ())),
                official_name=row.get("official_name"),
                effective_from=row.get("effective_from"),
                education_office_merges=bool(row.get("education_office_merges", False)),
                note=row.get("note"),
            )
            for row in payload.get("merged_source_regions", ())
        )
        self.regions: tuple[Region, ...] = tuple(
            _build_region(row) for row in payload["regions"]
        )
        self._by_canonical = {region.canonical_name: region for region in self.regions}
        self._by_alias: dict[str, Region] = {}
        for region in self.regions:
            for alias in (region.canonical_name, region.short_name, *region.aliases):
                self._by_alias.setdefault(_normalize(alias), region)
        self._by_neis = {region.neis_office_code: region for region in self.regions}
        self._by_office: dict[str, Region] = {}
        for region in self.regions:
            for office in (region.education_office, *region.education_office_aliases):
                self._by_office.setdefault(_normalize(office), region)
        self._by_legal_dong: dict[str, Region] = {}
        for region in self.regions:
            for code in region.legal_dong_codes:
                self._by_legal_dong.setdefault(code, region)

    def __len__(self) -> int:
        return len(self.regions)

    def __iter__(self):
        return iter(self.regions)

    @property
    def production_regions(self) -> tuple[Region, ...]:
        return tuple(region for region in self.regions if region.is_production)

    def get(self, name: str) -> Region:
        """Resolve a canonical name, short name, or alias.

        A merged source value is refused rather than guessed at: it covers more
        than one region, so callers must use `resolve_source_region()` with the
        row's 시군구 or road address.
        """
        region = self._by_alias.get(_normalize(name))
        if region is None:
            merged = self.merged_source_region(name)
            if merged is not None:
                raise RegionScopeError(
                    f"{name!r} is a merged source value covering more than one region; "
                    "use resolve_source_region() with 시군구 or a road address"
                )
            raise RegionScopeError(f"unknown region: {name!r}")
        return region

    def by_neis_office_code(self, code: str) -> Region:
        region = self._by_neis.get(str(code or "").strip().upper())
        if region is None:
            raise RegionScopeError(f"unknown NEIS office code: {code!r}")
        return region

    def by_education_office(self, office: str) -> Region | None:
        """A merged office covers two regions, so it resolves to neither."""
        return self._by_office.get(_normalize(office))

    def merged_office(self, office: str) -> MergedSourceRegion | None:
        return next((row for row in self.merged_source_regions if row.matches_office(office)), None)

    def by_legal_dong_code(self, code: str) -> Region | None:
        """Accept a full legal-dong code or just its two-digit region prefix."""
        return self._by_legal_dong.get(str(code or "").strip()[:2])

    def region_for_address(self, address: str) -> Region | None:
        """Identify a region from the start of an address.

        Only `address_prefixes` are considered, so `경기도 광주시` never reads as
        광주광역시. The longest prefix wins. A merged post-2026-07-01 address is
        split by the district that follows the merged region name.
        """
        text = str(address or "").strip()
        if not text:
            return None
        best: tuple[int, Region] | None = None
        for region in self.regions:
            for prefix in region.address_prefixes:
                if text.startswith(prefix) and (best is None or len(prefix) > best[0]):
                    best = (len(prefix), region)
        if best:
            return best[1]
        for merged in self.merged_source_regions:
            region_name = merged.region_name_for_address(text)
            if region_name:
                return self.get(region_name)
        return None

    def merged_source_region(self, value: str) -> MergedSourceRegion | None:
        return next((row for row in self.merged_source_regions if row.matches(value)), None)

    def resolve_source_region(
        self,
        sido_value: str,
        sigungu: str | None = None,
        road_address: str | None = None,
    ) -> Region:
        """Resolve a source `시도` value, including post-merger values.

        A merged value such as `전남광주통합특별시` covers two registry regions,
        so it is split by 시군구; a road address, which the sources still write
        with the pre-merger names, is used first when one is given.
        """
        merged = self.merged_source_region(sido_value)
        if merged is None:
            return self.get(sido_value)
        if road_address:
            region = self.region_for_address(road_address)
            if region is not None:
                return region
        return self.get(merged.region_name_for(sigungu))

    def canonicalize_address(self, address: str) -> str:
        """Rewrite a merged region prefix to the canonical region name.

        Sources migrated to the 2026-07-01 merger at different times, so the
        same school reads as `전라남도 목포시 ...` in one and
        `전남광주통합특별시 목포시 ...` in another. Address matching has to
        compare them on equal terms.
        """
        text = str(address or "").strip()
        if not text:
            return text
        for merged in self.merged_source_regions:
            for prefix in merged.address_prefixes:
                if text.startswith(prefix):
                    remainder = text[len(prefix):].strip()
                    region_name = merged.region_name_for(remainder.split()[0] if remainder else None)
                    return f"{region_name} {remainder}".strip()
        return text

    def scope_includes_address(self, scope: RegionScope, address: str) -> bool:
        """Whether an address falls in a scope, merged region names included.

        `RegionScope.includes_address` only knows its own region's prefixes;
        this also resolves a merged post-2026-07-01 address such as
        `전남광주통합특별시 목포시 ...` before applying the city filter.
        """
        text = str(address or "").strip()
        if not text:
            return False
        if scope.includes_address(text):
            return True
        region = self.region_for_address(text)
        if region is None or region.canonical_name != scope.region.canonical_name:
            return False
        if not scope.cities:
            return True
        for merged in self.merged_source_regions:
            for prefix in merged.address_prefixes:
                if text.startswith(prefix):
                    remainder = text[len(prefix):].strip()
                    return remainder.startswith(tuple(scope.cities))
        return False

    def scope(self, name: str, cities: Iterable[str] = ()) -> RegionScope:
        return RegionScope(self.get(name), tuple(cities))

    def scopes_from_manifest(self, scope_payload: dict[str, Any]) -> tuple[RegionScope, ...]:
        """Build scopes from a manifest `scope` block.

        Accepts the existing `{"regions": [...]}` shape and the city-filtered
        shape `{"regions": [{"region": "전라남도", "cities": ["목포시"]}]}`.
        """
        scopes: list[RegionScope] = []
        for entry in scope_payload.get("regions", []):
            if isinstance(entry, str):
                scopes.append(self.scope(entry))
                continue
            scopes.append(self.scope(entry["region"], entry.get("cities", ())))
        return tuple(scopes)


def _normalize(value: Any) -> str:
    return "".join(str(value or "").split())


def _build_region(row: dict[str, Any]) -> Region:
    bounds = row["bounds"]
    return Region(
        canonical_name=row["canonical_name"],
        short_name=row["short_name"],
        aliases=tuple(row.get("aliases", ())),
        address_prefixes=tuple(row.get("address_prefixes") or (row["canonical_name"],)),
        legal_dong_code=row["legal_dong_code"],
        legacy_legal_dong_codes=tuple(row.get("legacy_legal_dong_codes", ())),
        neis_office_code=row["neis_office_code"],
        education_office=row["education_office"],
        education_office_aliases=tuple(row.get("education_office_aliases", ())),
        school_name_prefix=row.get("school_name_prefix"),
        school_name_prefix_coverage_pct=float(row.get("school_name_prefix_coverage_pct", 0.0)),
        has_city_level=bool(row["has_city_level"]),
        bounds=Bounds(
            min_lat=float(bounds["min_lat"]),
            max_lat=float(bounds["max_lat"]),
            min_lng=float(bounds["min_lng"]),
            max_lng=float(bounds["max_lng"]),
        ),
        bounds_source=row["bounds_source"],
        center=(float(row["center"]["lat"]), float(row["center"]["lng"])),
        center_source=row["center_source"],
        wave=row["wave"],
        status=row["status"],
        elementary_school_count=row.get("elementary_school_count_20260320"),
        education_support_office_count=row.get("education_support_office_count"),
        region_notes=row.get("region_notes"),
    )


@lru_cache(maxsize=None)
def load_registry(path: str | Path = REGISTRY_PATH) -> RegionRegistry:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return RegionRegistry(payload)
