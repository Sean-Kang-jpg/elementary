import type { Source } from '../../content'

/**
 * Sources and the date they were last checked (trust principle 4: show the reference date).
 * 정부·교육청·법령 출처에는 '공식'을 붙여 언론 보도 같은 참고 자료와 구별한다(P1-04).
 */
export default function SourceList({ sources, verifiedAt }: { sources: Source[]; verifiedAt: string }) {
  return (
    <aside className="content-sources" aria-label="근거 자료">
      <h2>근거 자료</h2>
      <ul>
        {sources.map((source) => (
          <li key={source.url + source.label}>
            {source.official ? <span className="content-sources__official">공식</span> : null}
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
          </li>
        ))}
      </ul>
      <p>내용 확인일 {verifiedAt}</p>
    </aside>
  )
}
