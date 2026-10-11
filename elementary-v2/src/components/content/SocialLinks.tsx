import { useEffect, useState } from 'react'
import { Clapperboard, ExternalLink, Images, Instagram } from 'lucide-react'
import { getSocialLinks, POST_TYPE_LABELS, type SocialLink, type SocialTargetType } from '../../services/socialService'
import { track } from '../../utils/analytics'

/**
 * 이 페이지에 연결된 어디초 인스타그램 게시물 (SQL 27). 링크 카드만 둔다 — 인스타그램 임베드는
 * 외부 스크립트·추적을 불러오고 게시물이 지워지면 깨진다. 연결이 없으면 아무것도 그리지 않는다.
 */
export default function SocialLinks({ targetType, targetKey, compact = false }: { targetType: SocialTargetType; targetKey: string; compact?: boolean }) {
  const [links, setLinks] = useState<SocialLink[]>([])

  useEffect(() => {
    let active = true
    setLinks([])
    void getSocialLinks(targetType, targetKey).then((result) => {
      if (active) setLinks(result)
    })
    return () => { active = false }
  }, [targetType, targetKey])

  if (!links.length) return null
  return (
    <section className={`social-links ${compact ? 'social-links--compact' : ''}`} aria-labelledby={`social-links-${targetType}`} data-testid="social-links">
      <h2 id={`social-links-${targetType}`}><Instagram size={16} aria-hidden="true" />인스타그램에서 보기</h2>
      <ul>
        {links.map((link) => {
          const Icon = link.post_type === 'reel' ? Clapperboard : Images
          return (
            <li key={link.link_id}>
              <a
                href={link.post_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('open_social_link', { item_type: targetType, item_id: targetKey, post_type: link.post_type })}
              >
                <Icon size={17} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <strong>{link.title || `어디초 ${POST_TYPE_LABELS[link.post_type]}`}</strong>
                  <small>{POST_TYPE_LABELS[link.post_type]} · 인스타그램</small>
                </span>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
