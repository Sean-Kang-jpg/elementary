import { RULE_LABELS, type ContentRule } from '../../content'

/**
 * 이 글이 어디에, 언제 기준으로 맞는지 (P1-04). 전국이 같은 절차인지 지역마다 다른지를
 * 먼저 보여 줘야 서울 예시를 우리 지역 날짜로 읽지 않는다. 빌드의 정적 HTML도 같은 모양이다.
 */
export default function AppliesTo({ rule, basisYear }: { rule: ContentRule; basisYear: number }) {
  return (
    <p className="content-applies">
      <span className={`content-applies__chip content-applies__chip--${rule}`}>{RULE_LABELS[rule]}</span>
      <span className="content-applies__chip">{basisYear}학년도 기준</span>
    </p>
  )
}
