"""Classify an academy into subject categories from its name and NEIS realm.

NEIS files 56% of academies under one realm, '입시.검정 및 보습', which the map
showed as a single '입시' colour. The subject is usually in the name instead
('○○영어교습소', '△△수학학원'), so this reads the name and tags each academy with
one or more subjects.

The output keys are the frontend's category keys (src/utils/academyCategories.ts)
and must stay in step with them:

    english  영어          math     수학          writing  국어·논술
    science  과학          coding   코딩          study    입시·종합
    language 외국어        arts     예능          sports   체육
    other    기타

Rules, in order:

- Academies in a study-type realm ('입시.검정 및 보습', '종합(대)', '인문사회(대)',
  '국제화') get every subject whose keywords appear in the name. '영수' means
  English and maths. A study-realm name with no subject keyword is 'study' -
  names like '이투스' or '○○학원' do not say, and guessing would be worse than
  saying so.
- '국제화' with no English keyword but another language is 'language'.
- Other realms keep their realm-level category, as the map did before.

Names only: the public serving rows carry name, type and realm, not the course
list, so the production backfill can use nothing else. Keeping one rule for the
build and the backfill keeps the two in step.
"""

from __future__ import annotations

import re

# Each subject's keywords. Latin-script keywords are matched case-insensitively.
# Left out on purpose, after checking the 2026-09-29 snapshot: '셈' (catches
# '어셈블리'), '책' ('산책'), '이엘' (unrelated initials), bare '폴리' ('개념폴리아'
# is a maths brand, '폴리오' a writing one), '사고력' (used for science too) and
# '문학' (inside '전문학원', which tagged every 영수전문학원 as writing).
SUBJECT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "english": (
        "영어", "잉글리시", "잉글리쉬", "english", "re:(?<!국)어학원", "토익", "토플", "텝스",
        "파닉스", "phonics", "ybm", "와이비엠", "윤선생", "igse", "아이지에스이",
        "청담어학", "폴리어학", "아이엘츠", "ielts", "리딩타운",
    ),
    "math": (
        "수학", "매쓰", "매스", "math", "연산", "수전문",
    ),
    "writing": (
        "논술", "독서", "re:(?<![중외한])국어", "글쓰기", "문해", "한우리", "리딩클럽",
    ),
    "science": (
        "과학", "사이언스", "science", "실험", "re:화학(?![원당])", "re:(?<!범)물리", "생명과학", "지구과학",
    ),
    "coding": (
        "코딩", "소프트웨어", "로봇", "컴퓨터",
    ),
}

# '영수' is shorthand for 영어+수학; '국영수' adds 국어.
COMBINED_SHORTHAND: dict[str, tuple[str, ...]] = {
    "국영수": ("writing", "english", "math"),
    "영수": ("english", "math"),
}

OTHER_LANGUAGES: tuple[str, ...] = (
    "중국어", "일본어", "스페인어", "프랑스어", "독일어", "러시아어", "베트남어", "아랍어",
    "한자", "외국어",
)

STUDY_REALMS = {"입시.검정 및 보습", "종합(대)", "인문사회(대)", "국제화"}

# Realm-level categories for everything that is not a study realm, as the
# frontend mapped them before subjects existed.
REALM_CATEGORY: tuple[tuple[str, str], ...] = (
    ("예능", "arts"),
    ("음악", "arts"),
    ("미술", "arts"),
    ("무용", "arts"),
    ("체육", "sports"),
    ("무도", "sports"),
    ("태권도", "sports"),
    ("정보", "coding"),
)

SUBJECT_ORDER = (
    "english", "math", "writing", "science", "coding", "study",
    "language", "arts", "sports", "other",
)


def _has(text: str, keyword: str) -> bool:
    # A few keywords sit inside other words and need a guard: 어학원 is inside
    # 국어학원, so it must not follow 국; 국어 is inside 중국어·외국어·한국어; 화학 is
    # inside 만화학원·영화학원·강화학원 (→ 원) and 이원화학당 (→ 당); 물리 inside
    # 범물리드웰 (대구 범물동).
    if keyword.startswith("re:"):
        return re.search(keyword[3:], text) is not None
    if re.fullmatch(r"[A-Za-z]+", keyword):
        return keyword.lower() in text.lower()
    return keyword in text


def classify(name: str, realm: str, institution_type: str = "") -> list[str]:
    """Subjects for one academy, in display order. Never empty."""
    name = name or ""
    realm = (realm or "").strip()

    # 체육도장 rows carry the sport as their realm ('검도', '유도', ...); the type
    # says what they are more reliably than any list of sports would.
    if (institution_type or "").strip() == "체육도장업":
        return ["sports"]

    if realm in STUDY_REALMS:
        found: set[str] = set()
        for shorthand, subjects in COMBINED_SHORTHAND.items():
            if shorthand in name:
                found.update(subjects)
        for subject, keywords in SUBJECT_KEYWORDS.items():
            if any(_has(name, keyword) for keyword in keywords):
                found.add(subject)
        if not found and realm == "국제화":
            found.add("language" if any(word in name for word in OTHER_LANGUAGES) else "english")
        if not found and any(word in name for word in OTHER_LANGUAGES):
            found.add("language")
        if not found:
            found.add("study")
        return [subject for subject in SUBJECT_ORDER if subject in found]

    for fragment, category in REALM_CATEGORY:
        if fragment in realm:
            return [category]
    return ["other"]
