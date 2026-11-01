"""Tag an academy with the school levels its NEIS course list names.

The frontyard list puts institutions a grade-1 parent can use above the rest
(docs/operations/ACADEMY_SIGNALS_PLAN.md). NEIS has no target-grade column, but
an academy's own course list (LE_CRSE_LIST_NM, '초등수학A,중등수학A') and the item
names in its fee disclosure (PSNBY_THCC_CNTNT, '초등영어:200000, ...') often say
it. Tags:

    lower      초1·2 or 저학년 named         elem       초등 named
    preschool  유아·유치 named               secondary  중등·고등·입시 named
    adult      성인·일반인·고시·편입 named

'lower' always comes with 'elem'. An academy can carry several tags, and none
when its courses do not say ('피아노', '보습'), which is the common case: say
"초등 과정 등록", never "1학년 대상".

What the 2026-10-07 snapshot taught, and why the rules look like this:

- NEIS course *categories* carry level words that say nothing about the academy:
  '실용외국어(유아/초·중·고)' and '독서실(유아/초·중·고)' are fixed labels (16,000
  academies), and the '(중)' in '예능(중)', '기타(중)', '기예(중)', '인문사회(중)' is
  NEIS's middle classification, '(소)' its small one. They are removed before
  matching. The adult categories ('어학(성인)', '성인고시', '독서실(일반인)') do say
  something and are matched.
- '초' alone is not 초등: '초급', '초견' (sight reading) and '기초' are music and
  art levels, and so are '중급' and '고급'. 초 counts only as '초등', '초1'..'초6',
  '(초)' outside courses graded that way (instruments, 미술, 바둑), or '초·중'.
- '1학년' counts as lower only in an item that also says 초등. '고등1학년' and
  '중등B(2학년)' are common, and '(1,2학년)' split at its comma leaves '2학년)'.
- A whole item '입시' or '입시·논술' is a NEIS category copied into the list and is
  dropped; '피아노입시' and '미술입시' are courses and count as secondary.
- Left out on purpose: '아동', '주니어' and '키즈' (no grade), a bare '초' or '초A'
  (as often 초급 as 초등), and '초수학'-style joins (a few dozen academies).
- Academy names are matched for '초등' and '저학년' only; a name holding a school
  name ('서현초앞') would otherwise read as a level.
"""

from __future__ import annotations

import re

LEVEL_ORDER = ("lower", "elem", "preschool", "secondary", "adult")

# NEIS category labels whose level words describe the category, not the academy.
CATEGORY_NOISE = re.compile(
    r"\((?:유아\s*/\s*)?초\s*[·・.]\s*중\s*[·・.]\s*고\)"
    r"|(?:예능|기타|기예|인문사회|독서실|특수교육|컴퓨터)\((?:중|소)\)"
)
# NEIS course categories copied into the list as whole items: '입시' here is the
# category every 보습학원 can be filed under, not a course for 입시 students.
CATEGORY_ITEMS = {"입시", "입시·논술", "입시.논술"}

# Courses graded 초급/중급/고급, where '(초)' and '(중)' mean the grade, not the school.
GRADED = re.compile(r"피아노|바이엘|바이올린|첼로|비올라|플룻|플루트|기타|드럼|우쿨렐레|성악|가야금|해금|체르니|미술|바둑")

# '기초1' and '최초' hold 초 without meaning 초등; '초2회' is twice a week.
LOWER = re.compile(r"저학년|\(저\)|예비\s*초|(?<![기최])초\s*[12](?![0-9회])")
# '1학년' counts only in an item that also says 초등 ('초등1~2학년'): '고등1학년' is
# common, and '(1,2학년)' split at its comma leaves a bare '2학년)' of any level.
LOWER_GRADE = re.compile(r"(?<![0-9])[12]\s*학년|1\s*[·・~\-]\s*2\s*학년")
ELEM = re.compile(
    r"초등|(?<![기최])초\s*[1-6](?![0-9회])|(?<![기최])초\s*[·・/]?\s*중(?!급)|[/·・]\s*초(?=\s*[)/·・]|$)"
)
# NEIS cuts long course lists off, so '수학(초' at the end of an item counts too.
ELEM_BRACKET = re.compile(r"\(초(?:[A-Za-z0-9]?\)|$)")
PRESCHOOL = re.compile(r"유아|유치|(?<![0-9])[5-7]\s*세")
SECONDARY = re.compile(
    r"중등|고등|중학|고교|수능|입시|내신|(?<![가-힣])[중고]\s*[1-3](?![0-9회])|(?<![기최])초\s*[·・/]?\s*중(?!급)"
)
SECONDARY_BRACKET = re.compile(r"\([중고](?:[A-Za-z0-9]?\)|$)")
ADULT = re.compile(r"성인|일반인|(?<!중)고시|편입|공무원")

NAME_ELEM = re.compile(r"초등")
NAME_LOWER = re.compile(r"저학년")


def course_items(course_list: str, fee_text: str) -> list[str]:
    """The academy's own course names: its course list plus its fee item names."""
    items = [item.strip() for item in CATEGORY_NOISE.sub("", course_list or "").split(",")]
    for entry in (fee_text or "").split(","):
        name = entry.split(":", 1)[0].strip()
        if name:
            items.append(CATEGORY_NOISE.sub("", name).strip())
    return [item for item in items if item and item not in CATEGORY_ITEMS]


def level_evidence(course_list: str, fee_text: str = "", name: str = "") -> dict[str, list[str]]:
    """Each tag with the course items (or the name) that gave it, for review."""
    found: dict[str, list[str]] = {}

    def add(tag: str, item: str) -> None:
        bucket = found.setdefault(tag, [])
        if item not in bucket:
            bucket.append(item)

    for item in course_items(course_list, fee_text):
        graded = bool(GRADED.search(item))
        secondary = bool(SECONDARY.search(item) or (not graded and SECONDARY_BRACKET.search(item)))
        elem = bool(ELEM.search(item) or (not graded and ELEM_BRACKET.search(item)))
        if LOWER.search(item) or (elem and not secondary and LOWER_GRADE.search(item)):
            add("lower", item)
        if elem:
            add("elem", item)
        if PRESCHOOL.search(item):
            add("preschool", item)
        if secondary:
            add("secondary", item)
        if ADULT.search(item):
            add("adult", item)
    if name and NAME_ELEM.search(name):
        add("elem", name)
    if name and NAME_LOWER.search(name):
        add("lower", name)
    if "lower" in found and "elem" not in found:
        found["elem"] = list(found["lower"])
    return {tag: found[tag] for tag in LEVEL_ORDER if tag in found}


def classify_levels(course_list: str, fee_text: str = "", name: str = "") -> list[str]:
    return list(level_evidence(course_list, fee_text, name))
