import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createFunnelMeasurement, measurementScreenKey, type FunnelParams, type MeasuredScreen } from './funnelMeasurement.ts'

const screen = (pathname: string, timetable?: MeasuredScreen['timetable']): MeasuredScreen => ({
  pathname, search: '', pageLocation: `https://wherecho.co.kr${pathname}`, pageTitle: 'QA', timetable,
})
const week = (schoolId: string | null, schoolReady = true): MeasuredScreen['timetable'] => ({ face: 'week', schoolId, schoolReady, selectionMethod: 'route' })
const fixture = () => {
  const events: Array<{ event: string; params: FunnelParams }> = []
  return { events, observer: createFunnelMeasurement((event, params) => events.push({ event, params })) }
}

describe('displayed funnel screens', () => {
  it('counts timeline, resolved week, school changes and history returns, not rerenders or UTM changes', () => {
    const { observer, events } = fixture()
    const timeline = { face: 'timeline' as const, schoolId: null, schoolReady: false, selectionMethod: 'route' as const }
    observer.screen(screen('/', undefined))
    observer.screen(screen('/timetable', timeline))
    observer.screen({ ...screen('/timetable', timeline), search: '?utm_source=x' })
    observer.screen(screen('/timetable', week('B000001')))
    observer.screen(screen('/timetable', week('B000001')))
    observer.screen(screen('/timetable', week('B000002')))
    observer.screen(screen('/timetable', timeline))
    assert.equal(events.filter(e => e.event === 'page_view').length, 5)
    assert.deepEqual(events.filter(e => e.event === 'timetable_view').map(e => e.params.face), ['timeline', 'week', 'week', 'timeline'])
    assert.equal(events.filter(e => e.event === 'timetable_school_pick').length, 2)
    assert.equal(measurementScreenKey('/timetable', '?school=B000001&utm_source=x', week('B000001')),
      measurementScreenKey('/timetable', '?face=week&school=B000001', week('B000001')))
  })

  it('waits for valid school resolution and distinguishes user selection from restored selection', () => {
    const { observer, events } = fixture()
    observer.screen(screen('/school/example--B000001'))
    observer.markSelection('B000001', 'restore')
    observer.screen(screen('/timetable', week('B000001', false)))
    observer.screen(screen('/timetable', week('B000001')))
    observer.screen(screen('/timetable', week('B000001')))
    observer.markSelection('B000002', 'user')
    observer.screen(screen('/timetable', week('B000002')))
    const picks = events.filter(e => e.event === 'timetable_school_pick')
    assert.deepEqual(picks.map(e => e.params.selection_method), ['restore', 'user'])
    assert.equal(picks[0].params.entry_point, 'school_detail')
    assert.equal(events.filter(e => e.event === 'timetable_view').length, 2)
  })

  it('never transmits local school identifiers or arbitrary query parameters', () => {
    const { observer, events } = fixture()
    observer.screen(screen('/timetable', week('private-child-name')))
    assert.ok(events.filter(e => e.event !== 'page_view').every(e => !('school_id' in e.params)))
    assert.equal(measurementScreenKey('/guide/x', '?year=2027&utm_campaign=private'), '/guide/x?year=2027')
    assert.equal(measurementScreenKey('/guide/x', '?year=private'), '/guide/x')
  })
})

describe('successful and failed timetable writes', () => {
  it('creates only after a successful write, then records first edit once across remounts and retry', () => {
    const { observer, events } = fixture()
    assert.throws(() => observer.write('B000001', 'create', () => { throw new Error('private error') }))
    observer.write('B000001', 'create', () => undefined)
    assert.throws(() => observer.write('B000001', 'edit', () => { throw new Error('quota') }))
    observer.write('B000001', 'edit', () => undefined)
    observer.write('B000001', 'edit', () => undefined)
    assert.deepEqual(events.map(e => e.event), ['timetable_save_failure', 'timetable_draft_create', 'timetable_first_edit', 'timetable_save_failure', 'timetable_save_success', 'timetable_save_success'])
    assert.equal(events.filter(e => e.event === 'timetable_first_edit').length, 1)
    assert.ok(!JSON.stringify(events).includes('private error'))
    assert.ok(events.every(e => e.params.measurement_version === 'fnl-1'))
  })

  it('cannot turn an analytics failure into a failed product write', () => {
    const observer = createFunnelMeasurement(() => { throw new Error('blocked transport') })
    assert.equal(observer.write('B000001', 'edit', () => 'saved'), 'saved')
  })
})
