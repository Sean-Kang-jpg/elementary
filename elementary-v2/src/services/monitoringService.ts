import { supabase } from '../lib/supabase'
import type { EtlMonitoringData, EtlRun, EtlRunCheck, EtlSchedule, EtlSnapshot } from '../types/monitoring'

export async function isEtlAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_etl_admin')
  if (error) throw error
  return data === true
}

export async function loadEtlMonitoringData(): Promise<EtlMonitoringData> {
  const [schedulesResult, runsResult, snapshotsResult, checksResult] = await Promise.all([
    supabase.from('etl_schedules').select('*').order('display_name'),
    supabase.from('etl_runs').select('*').order('started_at', { ascending: false }).limit(30),
    supabase.from('etl_source_snapshots').select('*').order('created_at', { ascending: false }).limit(60),
    supabase.from('etl_run_checks').select('*').order('checked_at', { ascending: false }).limit(120),
  ])

  const error = schedulesResult.error || runsResult.error || snapshotsResult.error || checksResult.error
  if (error) throw error

  return {
    schedules: (schedulesResult.data || []) as EtlSchedule[],
    runs: (runsResult.data || []) as EtlRun[],
    snapshots: (snapshotsResult.data || []) as EtlSnapshot[],
    checks: (checksResult.data || []) as EtlRunCheck[],
    fetchedAt: new Date(),
  }
}
