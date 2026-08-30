import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isEtlAdmin, loadEtlMonitoringData } from '../../services/monitoringService'
import type { EtlMonitoringData, EtlRun, EtlSchedule } from '../../types/monitoring'
import './etlMonitoring.css'

type AccessState = 'loading' | 'signed-out' | 'forbidden' | 'ready'
type Health = 'healthy' | 'due' | 'disabled' | 'unknown'

const cadenceLabels: Record<EtlSchedule['cadence_unit'], string> = {
  daily: '일',
  weekly: '주',
  monthly: '월',
  annual: '년',
  manual: '수동',
}

const domainLabels: Record<EtlSchedule['data_domain'], string> = {
  school: '학교',
  apartment: '아파트',
  school_zone: '학구도',
}

const shortRegion = (region: string) => region.replace('특별시', '').replace('광역시', '').replace('도', '')

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const scheduleHealth = (schedule: EtlSchedule): Health => {
  if (!schedule.enabled) return 'disabled'
  if (!schedule.next_due_at || !schedule.last_success_at) return 'unknown'
  return new Date(schedule.next_due_at).getTime() < Date.now() ? 'due' : 'healthy'
}

const runDuration = (run: EtlRun) => {
  if (!run.completed_at) return '-'
  const seconds = Math.max(0, Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`
}

function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const result = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (result.error) {
      setError('로그인 정보를 확인해주세요.')
      return
    }
    onSuccess()
  }

  return (
    <main className="etl-login-shell">
      <form className="etl-login-panel" onSubmit={submit}>
        <div className="etl-brand-mark">ETL</div>
        <h1>데이터 운영 모니터</h1>
        <label>
          이메일
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
        <label>
          비밀번호
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="etl-login-error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? '확인 중' : '로그인'}</button>
        <a href="/">학교 지도</a>
      </form>
    </main>
  )
}

function StatusPill({ status }: { status: string }) {
  return <span className={`etl-status etl-status-${status}`}>{status}</span>
}

function Dashboard({ data, onRefresh, onSignOut, refreshing }: {
  data: EtlMonitoringData
  onRefresh: () => void
  onSignOut: () => void
  refreshing: boolean
}) {
  const enabledSchedules = data.schedules.filter((schedule) => schedule.enabled)
  const dueCount = enabledSchedules.filter((schedule) => scheduleHealth(schedule) !== 'healthy').length
  const latestRun = data.runs[0]
  const storageBytes = data.snapshots
    .filter((snapshot) => snapshot.status !== 'expired')
    .reduce((sum, snapshot) => sum + snapshot.byte_size, 0)
  const failedChecks = data.checks.filter((check) => check.status === 'fail').length

  const latestSnapshots = useMemo(() => {
    const bySource = new Map<string, EtlMonitoringData['snapshots'][number]>()
    data.snapshots.forEach((snapshot) => {
      if (!bySource.has(snapshot.source_name)) bySource.set(snapshot.source_name, snapshot)
    })
    return Array.from(bySource.values())
  }, [data.snapshots])

  return (
    <main className="etl-dashboard">
      <header className="etl-topbar">
        <div>
          <p>Elementary Data Operations</p>
          <h1>ETL 모니터링</h1>
        </div>
        <div className="etl-topbar-actions">
          <span className="etl-live"><i />{formatDateTime(data.fetchedAt.toISOString())} 갱신</span>
          <button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? '갱신 중' : '새로고침'}</button>
          <a href="/">학교 지도</a>
          <button type="button" className="secondary" onClick={onSignOut}>로그아웃</button>
        </div>
      </header>

      <section className="etl-kpis" aria-label="운영 요약">
        <article><span>활성 일정</span><b>{enabledSchedules.length}</b><small>{dueCount === 0 ? '모두 정상' : `${dueCount}건 확인 필요`}</small></article>
        <article><span>최근 실행</span><b>{latestRun?.status === 'completed' ? '정상' : latestRun?.status || '-'}</b><small>{latestRun ? runDuration(latestRun) : '실행 없음'}</small></article>
        <article><span>원천 보관</span><b>{formatBytes(storageBytes)}</b><small>{data.snapshots.filter((item) => item.status === 'validated').length}개 검증 파일</small></article>
        <article><span>실패 검사</span><b>{failedChecks}</b><small>{data.checks.length}개 최근 지표</small></article>
      </section>

      <section className="etl-section">
        <div className="etl-section-heading"><div><span>Cadence & Scope</span><h2>주기·범위별 업데이트 상태</h2></div><b>{enabledSchedules.length - dueCount}/{enabledSchedules.length} 정상</b></div>
        <div className="etl-table-wrap">
          <table>
            <thead><tr><th>원천</th><th>도메인</th><th>주기</th><th>대상 지역</th><th>최근 성공</th><th>다음 예정</th><th>상태</th></tr></thead>
            <tbody>{data.schedules.map((schedule) => {
              const health = scheduleHealth(schedule)
              const cadence = schedule.cadence_unit === 'manual' ? '수동' : `${schedule.cadence_value}${cadenceLabels[schedule.cadence_unit]}`
              return <tr key={schedule.schedule_id}>
                <td><strong>{schedule.display_name}</strong><small>{schedule.source_name}</small></td>
                <td>{domainLabels[schedule.data_domain]}</td>
                <td>{cadence}</td>
                <td><div className="etl-scope-list">{schedule.scope_regions.map((region) => <span key={region}>{shortRegion(region)}</span>)}</div></td>
                <td>{formatDateTime(schedule.last_success_at)}</td>
                <td>{formatDateTime(schedule.next_due_at)}</td>
                <td><StatusPill status={health} /></td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="etl-section">
        <div className="etl-section-heading"><div><span>Run History</span><h2>최근 실행</h2></div><b>{data.runs.length}건</b></div>
        <div className="etl-run-strip" aria-label="최근 실행 상태">{data.runs.slice(0, 16).reverse().map((run) => <i key={run.run_id} className={run.status} title={`${formatDateTime(run.started_at)} ${run.status}`} />)}</div>
        <div className="etl-table-wrap">
          <table>
            <thead><tr><th>시작시각</th><th>상태</th><th>실행 방식</th><th>범위</th><th>처리 행</th><th>소요시간</th></tr></thead>
            <tbody>{data.runs.slice(0, 12).map((run) => <tr key={run.run_id}>
              <td><strong>{formatDateTime(run.started_at)}</strong><small>{run.pipeline_version}</small></td>
              <td><StatusPill status={run.status} /></td>
              <td>{run.trigger_type}{run.attempt_number > 1 ? ` · ${run.attempt_number}차` : ''}</td>
              <td>{(run.scope.regions || []).map(shortRegion).join(' · ') || '-'}</td>
              <td>{Object.values(run.row_counts).reduce((sum, count) => sum + Number(count), 0).toLocaleString()}</td>
              <td>{runDuration(run)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <div className="etl-split">
        <section className="etl-section">
          <div className="etl-section-heading"><div><span>Sources</span><h2>원천 스냅샷</h2></div><b>{latestSnapshots.length}개 원천</b></div>
          <div className="etl-table-wrap"><table><thead><tr><th>원천</th><th>기준일</th><th>크기</th><th>상태</th></tr></thead><tbody>
            {latestSnapshots.map((snapshot) => <tr key={snapshot.snapshot_id}><td><strong>{snapshot.source_name}</strong><small>{snapshot.original_filename}</small></td><td>{snapshot.source_as_of}</td><td>{formatBytes(snapshot.byte_size)}</td><td><StatusPill status={snapshot.status} /></td></tr>)}
          </tbody></table></div>
        </section>
        <section className="etl-section">
          <div className="etl-section-heading"><div><span>Quality Gates</span><h2>최근 검증 지표</h2></div><b>{failedChecks === 0 ? '통과' : `${failedChecks} 실패`}</b></div>
          <div className="etl-check-list">{data.checks.slice(0, 10).map((check) => <div key={`${check.run_id}-${check.check_name}-${check.scope_name}`}><StatusPill status={check.status} /><span>{check.check_name.replace('row_count:', '')}</span><b>{check.metric_value?.toLocaleString() ?? '-'} {check.metric_unit || ''}</b></div>)}</div>
        </section>
      </div>
    </main>
  )
}

export default function EtlMonitoringPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [access, setAccess] = useState<AccessState>('loading')
  const [data, setData] = useState<EtlMonitoringData | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError('')
    try {
      const admin = await isEtlAdmin()
      if (!admin) {
        setAccess('forbidden')
        return
      }
      setData(await loadEtlMonitoringData())
      setAccess('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session)
      if (authData.session) void load()
      else setAccess('signed-out')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setAccess('signed-out')
    })
    return () => listener.subscription.unsubscribe()
  }, [load])

  useEffect(() => {
    if (access !== 'ready') return
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [access, load])

  if (access === 'loading') return <main className="etl-center-state">연결 확인 중</main>
  if (access === 'signed-out' || !session) return <SignIn onSuccess={() => void load()} />
  if (access === 'forbidden') return <main className="etl-center-state"><div><h1>접근 권한 없음</h1><p>{session.user.email}</p><button type="button" onClick={() => void supabase.auth.signOut()}>로그아웃</button></div></main>
  if (error || !data) return <main className="etl-center-state"><div><h1>모니터링 조회 실패</h1><p>{error}</p><button type="button" onClick={() => void load()}>다시 시도</button></div></main>
  return <Dashboard data={data} onRefresh={() => void load()} onSignOut={() => void supabase.auth.signOut()} refreshing={refreshing} />
}
