import policy from '../../content/privacy.json'

/**
 * 개인정보처리방침 (MEASUREMENT_PLAN 5절).
 *
 * GA4가 방문 정보를 Google로 보내므로 고지가 필요하다. 이 페이지와 GA4는 같이
 * 배포한다 — 고지 없이 수집이 먼저 나가면 안 된다. 운영자가 정하는 값은
 * content/privacy.json에 있다.
 *
 * 법률 자문을 거친 문서가 아니다. 공개 전 요건은 운영자가 확인한다.
 */
const value = (input: string | number | null) => (input === null || input === '' ? '미정' : String(input))

export default function PrivacyPage() {
  return (
    <section className="app-destination app-page privacy-page" aria-labelledby="privacy-title">
      <article className="privacy-page__inner">
        <h1 id="privacy-title">개인정보처리방침</h1>
        <p className="privacy-page__meta">시행일 {value(policy.effectiveDate)}</p>

        <p>
          어디초는 회원가입이 없으며, 이름·전화번호·이메일처럼 개인을 직접 알아볼 수 있는 정보를 받지 않습니다.
          서비스가 어떻게 쓰이는지 알기 위해 Google 애널리틱스를 사용하며, 이 문서는 그 내용과 거부 방법을 설명합니다.
        </p>

        <h2>1. 자동으로 수집되는 정보</h2>
        <ul>
          <li>방문한 페이지의 주소와 제목</li>
          <li>검색창에 입력한 검색어(학교명·아파트명 등)와 결과 개수</li>
          <li>상세 정보 보기, 즐겨찾기 추가, 공유 같은 화면 이용 기록</li>
          <li>기기·운영체제·브라우저 종류, 화면 크기, 대략적인 접속 지역(국가·도시 수준)</li>
          <li>방문을 구분하기 위한 쿠키 등 온라인 식별자</li>
        </ul>
        <p>검색창에는 개인정보를 입력하지 마세요. 입력한 검색어는 통계로 전송됩니다.</p>

        <h2>2. 이용 목적</h2>
        <p>어떤 기능이 얼마나 쓰이는지 파악해 서비스를 개선하는 통계 분석에만 씁니다. 개인을 식별하거나 맞춤형 광고에 쓰지 않습니다.</p>

        <h2>3. 보유 기간</h2>
        <p>수집 후 {value(policy.retentionMonths)}개월이 지나면 Google 애널리틱스의 보관 설정에 따라 자동으로 삭제됩니다.</p>

        <h2>4. 처리 위탁 및 국외 이전</h2>
        <dl>
          <dt>받는 자</dt><dd>Google LLC (미국) · 연락처 https://support.google.com/policies</dd>
          <dt>이전 항목</dt><dd>1항의 정보</dd>
          <dt>이전 시기와 방법</dt><dd>서비스를 이용하는 시점에 인터넷을 통해 전송</dd>
          <dt>목적과 보유 기간</dt><dd>2항과 3항과 같음</dd>
          <dt>거부 방법과 효과</dt><dd>5항의 방법으로 거부할 수 있으며, 거부해도 모든 기능을 그대로 쓸 수 있습니다.</dd>
        </dl>

        <h2>5. 수집을 거부하는 방법</h2>
        <ul>
          <li>브라우저 설정에서 쿠키를 차단합니다.</li>
          <li>Google 애널리틱스 차단 부가 기능(https://tools.google.com/dlpage/gaoptout)을 설치합니다.</li>
        </ul>

        <h2>6. 이용자 기기에만 저장되는 정보</h2>
        <p>
          즐겨찾기, 최근 검색 기록, 입학 프로필(아이의 입학 연도, 관심 학교 유형, 이사 계획)과 입학 준비
          체크리스트의 체크 상태는 이용자 브라우저의 저장소에만 보관되며 어디초나 제3자에게 전송되지 않습니다.
          브라우저의 사이트 데이터 삭제로 언제든 지울 수 있습니다. 아이의 이름이나 생년월일은 묻지 않습니다.
        </p>

        <h2>7. 따봉 기록</h2>
        <p>
          '우리 아이 커리큘럼'에서 따봉을 처음 누르면, 이름·연락처 없이 무작위로 만든 익명 식별자가 이 브라우저에
          만들어집니다. 서버에는 그 식별자, 따봉을 누른 카드·아이템, 누른 시각만 저장되며, 로그인 처리 과정에서
          접속 IP 주소가 기록될 수 있습니다. 같은 사람이 같은 대상에 두 번 누르지 못하게 하고 따봉 수를 세는 데에만
          씁니다. 누가 무엇에 눌렀는지는 공개하지 않고 합계만 보여줍니다.
        </p>
        <dl>
          <dt>받는 자</dt><dd>Supabase Inc. (데이터 보관: 싱가포르) · 따봉 기록 저장</dd>
          <dt>받는 자</dt><dd>Cloudflare, Inc. (미국) · 자동 등록(로봇) 확인을 위해 브라우저 정보와 IP 주소를 처리</dd>
          <dt>이전 시기와 방법</dt><dd>따봉을 누르는 시점에 인터넷을 통해 전송</dd>
          <dt>보유 기간</dt><dd>따봉을 취소하면 그 기록은 바로 지워집니다. 나머지는 서비스 운영 기간 동안 보관하며, 아래 연락처로 삭제를 요청할 수 있습니다.</dd>
          <dt>거부 방법과 효과</dt><dd>따봉을 누르지 않으면 아무것도 만들어지거나 전송되지 않습니다. 따봉 외의 모든 기능은 그대로 쓸 수 있습니다.</dd>
        </dl>

        <h2>8. 개인정보 보호책임자</h2>
        <p>{value(policy.officerName)} · {value(policy.officerEmail)}</p>
        <p>개인정보 관련 문의와 열람·삭제 요청은 위 연락처로 보내 주세요.</p>

        <h2>9. 변경</h2>
        <p>이 방침이 바뀌면 이 페이지에 시행일과 함께 게시합니다.</p>
      </article>
    </section>
  )
}
