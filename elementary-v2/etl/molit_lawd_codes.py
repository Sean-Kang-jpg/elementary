"""MOLIT district-code transitions that affect transaction collection.

The apartment trade API accepts the first five digits of the current legal-dong
code.  Operational apartment masters intentionally retain their source-period
legal codes, so collection uses the effective code while matching canonicalizes
it back to the master-era code.  Keep transitions explicit and dated; never
infer them from names.
"""

from __future__ import annotations


GWANGJU_JEONNAM_EFFECTIVE_MONTH = "202607"

# Official MOIS legal-dong transition published for 2026-07-01.
GWANGJU_JEONNAM_OLD_TO_NEW = {
    "46110": "12110",  # Mokpo-si
    "46130": "12130",  # Yeosu-si
    "46150": "12150",  # Suncheon-si
    "46170": "12170",  # Naju-si
    "46230": "12190",  # Gwangyang-si
    "29110": "12210",  # Gwangju Dong-gu
    "29140": "12240",  # Gwangju Seo-gu
    "29155": "12270",  # Gwangju Nam-gu
    "29170": "12300",  # Gwangju Buk-gu
    "29200": "12330",  # Gwangju Gwangsan-gu
    "46710": "12710",  # Damyang-gun
    "46720": "12720",  # Gokseong-gun
    "46730": "12730",  # Gurye-gun
    "46770": "12740",  # Goheung-gun
    "46780": "12750",  # Boseong-gun
    "46790": "12760",  # Hwasun-gun
    "46800": "12770",  # Jangheung-gun
    "46810": "12780",  # Gangjin-gun
    "46820": "12790",  # Haenam-gun
    "46830": "12800",  # Yeongam-gun
    "46840": "12810",  # Muan-gun
    "46860": "12820",  # Hampyeong-gun
    "46870": "12830",  # Yeonggwang-gun
    "46880": "12840",  # Jangseong-gun
    "46890": "12850",  # Wando-gun
    "46900": "12860",  # Jindo-gun
    "46910": "12870",  # Sinan-gun
}

GWANGJU_JEONNAM_NEW_TO_OLD = {
    new_code: old_code for old_code, new_code in GWANGJU_JEONNAM_OLD_TO_NEW.items()
}


def effective_lawd_code(master_code: str, month: str) -> str:
    """Return the code accepted by MOLIT for the requested YYYYMM."""
    if month >= GWANGJU_JEONNAM_EFFECTIVE_MONTH:
        return GWANGJU_JEONNAM_OLD_TO_NEW.get(master_code, master_code)
    return master_code


def canonical_master_lawd_code(source_code: str) -> str:
    """Translate a current MOLIT code to the legal-code generation in master."""
    return GWANGJU_JEONNAM_NEW_TO_OLD.get(source_code, source_code)

