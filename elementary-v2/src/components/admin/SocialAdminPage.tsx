import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isEtlAdmin } from '../../services/monitoringService'
import {
  addSocialLink,
  deleteSocialLink,
  listAllSocialLinks,
  normalizeInstagramUrl,
  parseTarget,
  POST_TYPE_LABELS,
  setSocialLinkVisible,
  type SocialLink,
  type SocialPostType,
} from '../../services/socialService'
import { SignIn } from './EtlMonitoringPage'
import './etlMonitoring.css'

type Access = 'loading' | 'signed-out' | 'forbidden' | 'ready'

const TARGET_PATH: Record<string, (key: string) => string> = {
  school: (key) => `/school/${key}`,
  learn: (key) => `/learn/${key}`,
  guide: (key) => `/guide/${key}`,
  area: (key) => key,
}

/**
 * /admin/social — 우리 인스타그램 게시물을 어디초 페이지에 잇는 관리 화면 (SQL 27).
 * etl_admin_users에 등록된 계정만 쓸 수 있다(쓰기 권한은 RLS가 막는다). 저장하면 배포 없이 바로 보인다.
 */
export default function SocialAdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<Access>('loading')
  const [links, setLinks] = useState<SocialLink[]>([])
  const [notDeployed, setNotDeployed] = useState(false)
  const [error, setError] = useState('')
  const [postInput, setPostInput] = useState('')
  const [targetInput, setTargetInput] = useState('')
  const [postType, setPostType] = useState<SocialPostType>('carousel')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const post = useMemo(() => (postInput ? normalizeInstagramUrl(postInput) : null), [postInput])
  const target = useMemo(() => (targetInput ? parseTarget(targetInput) : null), [targetInput])

  const load = useCallback(async () => {
    setError('')
    try {
      if (!(await isEtlAdmin())) {
        setAccess('forbidden')
        return
      }
      const result = await listAllSocialLinks()
      setLinks(result.links)
      setNotDeployed(result.notDeployed)
      setAccess('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
      setAccess('ready')
    }
  }, [])

  useEffect(() => {
    document.title = '인스타그램 연결 관리 | 어디초'
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) void load()
      else setAccess('signed-out')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) setAccess('signed-out')
    })
    return () => listener.subscription.unsubscribe()
  }, [load])

  // 릴스 주소면 유형을 릴스로 맞춘다. 게시물 주소(/p/)는 캐러셀·단일 게시물을 사람이 고른다.
  useEffect(() => {
    if (post?.kind === 'reel') setPostType('reel')
    else if (post?.kind === 'p' && postType === 'reel') setPostType('carousel')
  }, [post, postType])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!post || !target) return
    setSaving(true)
    setError('')
    try {
      await addSocialLink({ post_url: post.url, post_type: postType, target_type: target.type, target_key: target.key, title: title.trim() || null })
      setPostInput('')
      setTitle('')
      await load()
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String((saveError as { message?: string }).message ?? saveError)
      setError(message.includes('duplicate') ? '같은 게시물이 이미 이 페이지에 연결돼 있습니다.' : message)
    } finally {
      setSaving(false)
    }
  }

  const act = async (action: () => Promise<void>) => {
    setError('')
    try {
      await action()
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String((actionError as { message?: string }).message ?? actionError))
    }
  }

  if (access === 'loading') return <main className="etl-center-state">연결 확인 중</main>
  if (access === 'signed-out' || !session) return <SignIn onSuccess={() => void load()} mark="IG" title="인스타그램 연결 관리" />
  if (access === 'forbidden') {
    return <main className="etl-center-state"><div><h1>접근 권한 없음</h1><p>{session.user.email}</p><button type="button" onClick={() => void supabase.auth.signOut()}>로그아웃</button></div></main>
  }

  return (
    <main className="social-admin">
      <header className="social-admin__header">
        <h1>인스타그램 연결 관리</h1>
        <button type="button" onClick={() => void supabase.auth.signOut()}>로그아웃</button>
      </header>

      {notDeployed ? (
        <p className="social-admin__warning" role="alert">social_links 테이블이 아직 없습니다. SQL 27을 적용한 뒤 다시 열어 주세요.</p>
      ) : null}

      <form className="social-admin__form" onSubmit={submit}>
        <label>
          인스타그램 게시물 주소
          <input value={postInput} onChange={(event) => setPostInput(event.target.value)} placeholder="https://www.instagram.com/p/… 또는 /reel/…" required />
          <small>{postInput ? (post ? `저장될 주소: ${post.url}` : '게시물(/p/)이나 릴스(/reel/) 주소가 아닙니다.') : '공유 메뉴의 링크 복사를 그대로 붙여 넣어도 됩니다.'}</small>
        </label>
        <label>
          연결할 어디초 페이지 주소
          <input value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="https://wherecho.co.kr/school/…--B000002704" required />
          <small>{targetInput ? (target ? `${target.type} · ${target.label}` : '학교 상세, 학습 글(/learn/…), 가이드(/guide/…) 주소만 받습니다.') : '학교는 이름이 아니라 주소 끝의 학교 ID로 연결됩니다.'}</small>
        </label>
        <label>
          유형
          <select value={postType} onChange={(event) => setPostType(event.target.value as SocialPostType)}>
            {(Object.keys(POST_TYPE_LABELS) as SocialPostType[]).map((type) => <option key={type} value={type}>{POST_TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        <label>
          제목 (선택, 80자)
          <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 80))} placeholder="카드에 보일 한 줄. 비우면 '어디초 캐러셀'" />
        </label>
        <button type="submit" disabled={!post || !target || saving || notDeployed}>{saving ? '저장 중' : '연결하기'}</button>
        {error ? <p className="social-admin__error" role="alert">{error}</p> : null}
      </form>

      <h2>연결된 게시물 {links.length}</h2>
      <table className="social-admin__table">
        <thead><tr><th>페이지</th><th>게시물</th><th>유형</th><th>제목</th><th>보이기</th><th /></tr></thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.link_id} className={link.visible ? '' : 'is-hidden'}>
              <td><a href={TARGET_PATH[link.target_type](link.target_key)} target="_blank" rel="noopener noreferrer">{link.target_type} · {link.target_key}</a></td>
              <td><a href={link.post_url} target="_blank" rel="noopener noreferrer">{link.post_url.replace('https://www.instagram.com', '')}</a></td>
              <td>{POST_TYPE_LABELS[link.post_type]}</td>
              <td>{link.title ?? '—'}</td>
              <td><button type="button" onClick={() => void act(() => setSocialLinkVisible(link.link_id, !link.visible))}>{link.visible ? '보임' : '숨김'}</button></td>
              <td><button type="button" onClick={() => { if (window.confirm('이 연결을 지울까요?')) void act(() => deleteSocialLink(link.link_id)) }}>지우기</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
