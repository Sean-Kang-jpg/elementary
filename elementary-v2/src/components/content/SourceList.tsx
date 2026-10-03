import type { Source } from '../../content'

/** Sources and the date they were last checked (trust principle 4: show the reference date). */
export default function SourceList({ sources, verifiedAt }: { sources: Source[]; verifiedAt: string }) {
  return (
    <aside className="content-sources" aria-label="근거 자료">
      <h2>근거 자료</h2>
      <ul>
        {sources.map((source) => (
          <li key={source.url + source.label}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
          </li>
        ))}
      </ul>
      <p>내용 확인일 {verifiedAt}</p>
    </aside>
  )
}
