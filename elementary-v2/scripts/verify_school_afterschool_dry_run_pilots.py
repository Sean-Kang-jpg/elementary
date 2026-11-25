"""Reproduce SW item 8's two offline cases from the committed gate inputs."""

import json
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

from etl.load_school_afterschool import build, load_period_estimates, school_record, table_rows
from scripts.school_afterschool_dry_run import KEYS, SLOTS, SUMMARY, dump

ROOT = Path(__file__).resolve().parents[1]
PIVOT = ROOT / "docs/research/pivot"
DONGPA, YUNJUNG = "B000026106", "B000002016"
SNAPSHOT_DATE = "2026-11-26"


def local_baseline():
    args = shlex.split((ROOT / "etl/afterschool_load_args.txt").read_text(encoding="utf-8"))

    def paths(flag):
        return [ROOT / args[i + 1] for i, arg in enumerate(args) if arg == flag]

    gates = [
        PIVOT / f"p1_{region}_{day}"
        for region, day in (("anyang_gwacheon", "20261111"), ("dongtan", "20261117"), ("giheung", "20261112"),
                            ("hanam", "20261117"), ("yeongtong", "20261117"))
    ]
    records, _ = build(paths("--outputs") + gates, paths("--custom-outputs"), paths("--afterschool-outputs"),
                       load_period_estimates(paths("--period-estimates")), paths("--slot-reviews"))
    return table_rows(records, SNAPSHOT_DATE, True, True)


def pilot_rows(school_id):
    def row(kind, name, section, grade, day, start, end, term, line):
        return [kind, name, None, section, grade, "table" if kind == "맞춤형" else "row",
                day, start, end, "true", "학기", term, None, line]

    if school_id == DONGPA:
        # SW item 8, school notice 1346766, five classroom timetables in section 2.
        activities = (
            "독서놀이 조물공작소 놀이체육 음악놀이 창작미술",
            "창작미술 음악놀이 독서놀이 생활체육 보드게임",
            "놀이체육 독서놀이 창작미술 보드게임 조물공작소",
            "상상아트 음악놀이 조물공작소 독서놀이 놀이체육",
            "놀이체육 보드게임 상상아트 음악놀이 조물공작소",
        )
        rows = []
        for section, names in enumerate(activities, 1):
            for day, name in zip("월화수목금", names.split()):
                hours = ("13:00", "14:20") if day in "월금" else ("13:50", "15:10")
                rows.append(row("맞춤형", name, str(section), "1~2", day, *hours, "2026 2학기", 2))
        # SW item 8's samples from the annual plan, distinct from actual third-quarter enrollment.
        for name, grade, start, end, line in (
            ("축구", "1~2", "13:00", "14:20", 64),
            ("바둑", "1~2", "13:00", "14:20", 66),
            ("바둑", "1~6", "14:30", "15:50", 67),
        ):
            rows.append(row("방과후", name, None, grade, "월", start, end, "2026 연간 계획", line))
        return rows
    activities = ("실내체육", "놀이미술", "놀이수학", "창의놀이", "동화구연&책놀이")
    rows = []
    for day, name in zip("월화수목금", activities):
        hours = ("12:50", "14:50") if day in "월금" else ("13:50", "15:50")
        rows.append(row("맞춤형", name, None, "1~2", day, *hours, "2026 연간 계획", 5))
    return rows


def verify(school_id, baseline, expected):
    record = school_record({"school_id": school_id, "rows": pilot_rows(school_id)})
    rows = table_rows([record], SNAPSHOT_DATE, True, True)
    if school_id == YUNJUNG:
        rows = {SLOTS: rows[SLOTS]}
        assert len(rows[SLOTS]) == 5
    evidence = {
        DONGPA: "SW #8, 2학기 운영 공지 §2 및 학교알리미 방과후 운영계획(안) §Ⅳ 표본",
        YUNJUNG: "SW #8, 학교알리미 방과후·맞춤형교실 운영 계획 PDF 5쪽",
    }
    candidate = {"school_id": school_id, "tables": {
        table: {"rows": items, "state": "partial_reviewed", "evidence": evidence[school_id]}
        for table, items in rows.items()
    }}
    with tempfile.TemporaryDirectory() as directory:
        original = Path(directory) / "baseline.json"
        reviewed = Path(directory) / "candidate.json"
        next_baseline = Path(directory) / "next-baseline.json"
        original.write_text(dump(baseline), encoding="utf-8")
        reviewed.write_text(dump(candidate), encoding="utf-8")
        command = [sys.executable, str(ROOT / "scripts/school_afterschool_dry_run.py"),
                   "--school-id", school_id, "--candidate", str(reviewed)]
        first_output = subprocess.check_output([*command, "--baseline", str(original)])
        first = json.loads(first_output)
        next_baseline.write_text(dump(first["proposed_baseline"]), encoding="utf-8")
        repeat = json.loads(subprocess.check_output([*command, "--baseline", str(next_baseline)]))
        assert first_output == subprocess.check_output([*command, "--baseline", str(original)])
    proposed = first["proposed_baseline"]
    for table, adds in zip(KEYS, expected):
        assert first["counts"][table] == {"added": adds, "modified": 0, "deleted": 0}
        assert not first["coverage"][table]["held_candidates"]
        assert not any(repeat["counts"][table].values())
        assert [row for row in proposed[table] if row["school_id"] != school_id] == [
            row for row in baseline[table] if row["school_id"] != school_id
        ]
    print(school_id, dump(first["counts"]), "replay=0, original diff identical, off-target intact")


def main():
    baseline = local_baseline()
    assert tuple(map(len, baseline.values())) == (840, 29713, 13469, 1508)
    assert all(row["school_id"] != DONGPA for row in baseline[SUMMARY])
    verify(DONGPA, baseline, (1, 28, 7, 0))
    assert tuple(sum(row["school_id"] == YUNJUNG for row in baseline[table]) for table in KEYS) == (1, 62, 33, 1)
    verify(YUNJUNG, baseline, (0, 0, 0, 0))


if __name__ == "__main__":
    main()
