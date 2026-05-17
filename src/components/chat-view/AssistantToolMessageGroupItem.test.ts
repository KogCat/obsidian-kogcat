import { resolveKogcatContent } from './kogcat-content-resolver'
import { type KogCatMessageState } from './useKogCatCalibration'

const baseState: KogCatMessageState = {
  view: { kind: 'idle' },
  showAdvisor: false,
  original: 'Original answer',
  advisorAnswer: null,
  calibration: null,
}

describe('resolveKogcatContent', () => {
  test('keeps the original answer stable when Quick Answer has an advisor card', () => {
    const state: KogCatMessageState = {
      ...baseState,
      view: {
        kind: 'advisor',
        intensity: 'supplement',
        advisorAnswer: 'KogCat answer',
      },
      advisorAnswer: 'KogCat answer',
    }

    expect(resolveKogcatContent('Original answer', state)).toBe(
      'Original answer',
    )
  })

  test('shows the KogCat response as primary content in Advisor Answer', () => {
    const state: KogCatMessageState = {
      ...baseState,
      view: {
        kind: 'advisor_primary',
        advisorAnswer: 'KogCat answer',
      },
      advisorAnswer: 'KogCat answer',
    }

    expect(resolveKogcatContent('Original answer', state)).toBe('KogCat answer')
  })

  test('does not stream partial advisor content over the original answer', () => {
    const state: KogCatMessageState = {
      ...baseState,
      view: { kind: 'composing_advisor' },
      advisorAnswer: 'Partial',
    }

    expect(resolveKogcatContent('Original answer', state)).toBe(
      'Original answer',
    )
  })
})
