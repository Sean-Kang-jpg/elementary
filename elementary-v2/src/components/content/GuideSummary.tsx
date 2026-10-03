import type { GuideSummary as Summary } from '../../content'

/**
 * A guide's one-glance diagram, drawn from the `summary` in its front matter.
 * Text rather than an image, so a crawler and a screen reader read it too, and
 * correcting it is editing a line of markdown. scripts/build-shell-pages.mjs
 * writes the same markup into the static page.
 *
 * steps: numbered, in order. timeline: each step carries its date. checks: a set
 * with no order.
 */
export default function GuideSummary({ summary }: { summary: Summary }) {
  const List = summary.kind === 'checks' ? 'ul' : 'ol'
  return (
    <figure className={`guide-summary guide-summary--${summary.kind}`}>
      <figcaption>{summary.title}</figcaption>
      <List className="guide-summary__items">
        {summary.items.map((item, index) => (
          <li key={`${index}-${item.title}`} className="guide-summary__item">
            <span className="guide-summary__marker" aria-hidden="true">
              {summary.kind === 'checks' ? '✓' : index + 1}
            </span>
            <span className="guide-summary__body">
              {item.when ? <span className="guide-summary__when">{item.when}</span> : null}
              <strong>{item.title}</strong>
              {item.text ? <small>{item.text}</small> : null}
            </span>
          </li>
        ))}
      </List>
    </figure>
  )
}
