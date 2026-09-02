export type AppMetricName = 'school-map-load' | 'school-apartment-load'

export interface AppPerformanceMetric {
  name: AppMetricName
  durationMs: number
  status: 'success' | 'error'
  recordedAt: string
  context: Record<string, string | number | boolean>
}

declare global {
  interface Window {
    __ELEMENTARY_PERFORMANCE__?: AppPerformanceMetric[]
  }
}

export const recordPerformanceMetric = (
  name: AppMetricName,
  startedAt: number,
  status: AppPerformanceMetric['status'],
  context: AppPerformanceMetric['context'] = {},
) => {
  const metric: AppPerformanceMetric = {
    name,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    status,
    recordedAt: new Date().toISOString(),
    context,
  }
  window.__ELEMENTARY_PERFORMANCE__ = [
    ...(window.__ELEMENTARY_PERFORMANCE__ || []),
    metric,
  ].slice(-50)
  window.dispatchEvent(new CustomEvent('elementary:performance', { detail: metric }))
  return metric
}
