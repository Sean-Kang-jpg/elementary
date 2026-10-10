/**
 * 인스타그램 주소를 한 가지 모양으로 맞춘다: https://www.instagram.com/{p|reel}/{id}/
 * 공유 메뉴가 붙이는 ?igsh= 같은 꼬리와 /reels/ 표기를 걷어 낸다. 게시물이 아니면 null.
 */
export const normalizeInstagramUrl = (input: string): { url: string; kind: 'p' | 'reel' } | null => {
  let url: URL
  try {
    url = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`)
  } catch {
    return null
  }
  if (!/^(www\.)?instagram\.com$/i.test(url.hostname)) return null
  const match = url.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/)
  if (!match) return null
  const kind = match[1] === 'p' ? 'p' : 'reel'
  return { url: `https://www.instagram.com/${kind}/${match[2]}/`, kind }
}

