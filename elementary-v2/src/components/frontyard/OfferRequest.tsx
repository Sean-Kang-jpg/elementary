import privacy from '../../content/privacy.json'

/**
 * [모집해요] 등록 요청. 학원 글은 운영자가 학원 본인인지 확인한 뒤에만 공개한다 — 익명 사용자가 학원
 * 이름으로 바로 올리면 사칭을 막을 수 없다(FRONTYARD_PLAN 6절). 지도 학원 자료에 기관 키가 실리기
 * 전까지는 메일로 받고, 운영자가 SQL 33의 함수로 올린다.
 */
export default function OfferRequest({ schoolName, onClose }: { schoolName: string | null; onClose: () => void }) {
  const subject = `[학교앞마당 모집해요] ${schoolName ?? ''} 등록 요청`.trim()
  const body = [
    '학원·기관 이름:',
    '교육청 등록번호(학원·교습소) 또는 사업자등록번호:',
    '대상 학교:',
    '대상 학년:',
    '수업 요일·시간:',
    '비용:',
    '차량 운행 여부:',
    '모집 마감일:',
    '상담 받을 대표 전화 또는 홈페이지:',
  ].join('\n')
  const mailto = `mailto:${privacy.officerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return (
    <section className="frontyard-composer my-card" aria-labelledby="offer-title">
      <h2 id="offer-title">학원·기관 소식 올리기</h2>
      <p className="my-help">학원·기관의 수업과 모집 안내는 <b>운영자가 학원 본인인지 확인한 뒤</b> ‘모집해요’로 게시돼요. 아래 양식으로 요청해 주시면 등록번호를 대조하고 대표 전화로 확인해 올려 드려요.</p>
      <ul className="frontyard-offer-steps">
        <li>등록번호와 대표 전화로 학원 본인 확인</li>
        <li>대상 학교 여러 곳에 함께 노출할 수 있어요</li>
        <li>수업 요일·시간을 적으면 부모가 시간표에 바로 담을 수 있어요</li>
      </ul>
      <div className="frontyard-composer__buttons">
        <button type="button" className="my-button" onClick={onClose}>닫기</button>
        <a className="my-button my-button--primary" href={mailto}>메일로 등록 요청</a>
      </div>
    </section>
  )
}
