# E05 LLM 추출 지시서 (하위 에이전트·`claude -p` 공용)

입력: `etl/runtime/llm_extraction/inputs/<school_id>.txt`. 학교마다 `[CLOCK]`(학교교육과정 시정표 부분)과 `[CARE]`(방과후·돌봄 계획의 돌봄 문구)가 있다. **이 파일 외에는 아무것도 읽지 않는다.**

학교마다 아래 JSON 객체 하나를 만든다. 대상은 **초등학교 1학년, 1학기(입학 학기) 학기 중 평일**이다.

```json
{
  "school_id": "B000000000",
  "clock": {
    "found": true,
    "grade1_column": "표에서 1학년에 해당하는 열·표 이름을 원문 그대로 (예: '1~2학년', '1,4 학년'). 구분이 없으면 '공통'",
    "p4_end": "HH:MM",
    "lunch_start": "HH:MM",
    "lunch_end": "HH:MM",
    "lunch_position": "after_p4 | before_p4",
    "p5_end": "HH:MM",
    "p5_end_inferred": false,
    "evidence": {
      "p4": "4교시 시각이 적힌 원문 조각 그대로",
      "lunch": "점심 시각이 적힌 원문 조각 그대로",
      "p5": "5교시 시각이 적힌 원문 조각 그대로"
    },
    "note": "판단이 필요했던 점 한 줄, 없으면 null"
  },
  "care": {
    "status": "stated | unknown",
    "afternoon_end": "HH:MM",
    "extended_end": "HH:MM 또는 null",
    "extended_condition": "연장의 조건을 원문 표현 그대로 짧게, 없으면 null",
    "morning": "HH:MM-HH:MM 또는 null",
    "grades": "예: '1~2', 없으면 null",
    "evidence": "오후 돌봄 종료 시각이 적힌 원문 조각 그대로",
    "note": null
  }
}
```

## 규칙

시정(clock)
- 학년별로 열이나 표가 나뉘면 **1학년이 속한 것**을 쓴다. 학기별로 다르면 1학기를 쓴다.
- `lunch_position`: 1학년 점심이 4교시 **뒤**면 `after_p4`, 4교시 **앞**(예: 3교시 후 점심, 그다음 4교시)이면 `before_p4`.
- `p4_end`은 1학년 4교시가 끝나는 시각이다. 블록 수업("3·4교시 10:40~12:00", "2블록(3,4교시)")이면 블록 종료 시각이다.
- `p5_end`은 1학년 5교시가 끝나는 시각이다. 5교시가 블록 안에 있고 시각이 따로 없으면, 블록 시작부터 40분을 더한 값을 쓰고 `p5_end_inferred: true`로 둔다. 이때 `evidence.p5`에는 블록이 적힌 원문을 쓴다.
- 정규 일과표가 없고 행사 일정표뿐이면 `found: false`로 두고 나머지 시각은 null이다.
- 문서에 없는 값은 만들지 않는다. 모르면 null이다.

돌봄(care)
- `afternoon_end`는 학기 중 오후(기본) 돌봄의 종료다. 방학·자율휴업일·아침·틈새(연계형)·방과후 프로그램 시간은 쓰지 않는다.
- 기본과 별도로 저녁돌봄·연장반·"최소 1실 19시" 같은 연장이 있으면 `extended_end`와 `extended_condition`에 쓴다. 기본 종료가 그 시각 하나뿐이면(예: "방과후~19:00") `afternoon_end`에만 쓴다.
- 기본 종료 시각이 적혀 있지 않고 연장 시각만 있으면 `status: "unknown"`이다. 기본 시각을 추정하지 않는다.
- 학급마다 다르면 1학년 반의 시각을 쓴다. 1학년 반을 알 수 없으면 가장 이른 종료를 `afternoon_end`, 가장 늦은 종료를 `extended_end`로 두고 `extended_condition`에 반 이름을 쓴다.
- 담당자 이름, 전화번호는 어떤 필드에도 옮기지 않는다.

`evidence`는 반드시 입력 파일에 있는 문자열을 **그대로 복사**한다(공백만 하나로 줄여도 된다). 검증기는 이 문자열이 원문에 있는지, 그 안에 해당 시각이 들어 있는지 확인한다.
