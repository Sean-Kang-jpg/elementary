export interface EtlSchedule {
  schedule_id: string
  source_name: string
  display_name: string
  data_domain: 'school' | 'apartment' | 'school_zone'
  cadence_unit: 'daily' | 'weekly' | 'monthly' | 'annual' | 'manual'
  cadence_value: number
  max_age_hours: number
  scope_regions: string[]
  enabled: boolean
  last_run_id: string | null
  last_success_at: string | null
  next_due_at: string | null
  owner_note: string | null
}

export interface EtlRun {
  run_id: string
  pipeline_name: string
  pipeline_version: string
  status: 'started' | 'completed' | 'failed'
  trigger_type: 'manual' | 'scheduled' | 'retry'
  attempt_number: number
  scope: { regions?: string[]; domains?: string[] }
  row_counts: Record<string, number>
  source_as_of: Record<string, string>
  started_at: string
  completed_at: string | null
  error_summary: { message?: string } | null
}

export interface EtlSnapshot {
  snapshot_id: string
  run_id: string | null
  source_name: string
  source_as_of: string
  original_filename: string
  byte_size: number
  row_count: number | null
  status: 'archived' | 'validated' | 'rejected' | 'expired'
  retain_until: string
  created_at: string
}

export interface EtlRunCheck {
  run_id: string
  check_name: string
  scope_name: string
  status: 'pass' | 'warn' | 'fail'
  metric_value: number | null
  metric_unit: string | null
  details: Record<string, unknown>
  checked_at: string
}

export interface EtlMonitoringData {
  schedules: EtlSchedule[]
  runs: EtlRun[]
  snapshots: EtlSnapshot[]
  checks: EtlRunCheck[]
  fetchedAt: Date
}
