import {
  CalibrationDirective,
  CalibrationResult,
} from '../../core/kogcat/calibrate'

import {
  getPassiveCalibrationView,
  shouldComposeKogcatAdvisor,
} from './useKogCatCalibration'

function resultFor(directive: Partial<CalibrationDirective>): CalibrationResult {
  return {
    directive: {
      should_emit: false,
      placement: 'none',
      phrasing: '',
      inline_refs: [],
      ...directive,
    },
  }
}

describe('KogCat calibration mode decisions', () => {
  test('quick mode stays passive when directive is idle', () => {
    const idle = resultFor({ should_emit: false, placement: 'none' })
    expect(shouldComposeKogcatAdvisor(idle, 'quick')).toBe(false)
    expect(getPassiveCalibrationView(idle)).toEqual({ kind: 'checked' })
  })

  test('advisor mode composes a primary KogCat answer even for idle directive', () => {
    const idle = resultFor({ should_emit: false, placement: 'none' })
    expect(shouldComposeKogcatAdvisor(idle, 'advisor')).toBe(true)
  })

  test('quick mode composes an advisor note when directive triggers rewrite', () => {
    const calibrate = resultFor({
      should_emit: true,
      placement: 'inline',
      phrasing: 'Kogcat 校准：参见 [X]',
    })
    expect(shouldComposeKogcatAdvisor(calibrate, 'quick')).toBe(true)
  })

  test('suffix placement renders the flag_gap view, not advisor', () => {
    const gap = resultFor({ should_emit: true, placement: 'suffix' })
    expect(shouldComposeKogcatAdvisor(gap, 'quick')).toBe(false)
    expect(getPassiveCalibrationView(gap)).toEqual({ kind: 'flag_gap' })
  })

  test('answer mode (front + primary_mode=kb) renders the reinforce view', () => {
    const answer = resultFor({
      should_emit: true,
      placement: 'front',
      extras: { primary_mode: 'kb' },
    })
    expect(shouldComposeKogcatAdvisor(answer, 'quick')).toBe(false)
    expect(getPassiveCalibrationView(answer)).toEqual({ kind: 'reinforce' })
  })
})
