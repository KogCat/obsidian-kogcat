import fs from 'fs'
import path from 'path'

import {
  getCogAdvisorCardModel,
  getCogCalibrationActionModel,
  type CogCalibrationView,
} from './CogCalibrationStatus'

const cogCalibrationStatusSource = fs.readFileSync(
  path.join(__dirname, './CogCalibrationStatus.tsx'),
  'utf8',
)

describe('getCogCalibrationActionModel', () => {
  test('uses a passive status while calibration is in progress', () => {
    expect(getCogCalibrationActionModel({ kind: 'calibrating' })).toEqual({
      indicator: 'loading',
      toggleLabel: null,
    })
  })

  test('uses a passive checked status when KogCat completed with no supplement', () => {
    expect(getCogCalibrationActionModel({ kind: 'checked' })).toEqual({
      indicator: 'checked',
      toggleLabel: null,
    })
  })

  test('does not offer compare controls for advisor responses', () => {
    const view: CogCalibrationView = {
      kind: 'advisor',
      intensity: 'supplement',
      advisorAnswer: 'KogCat answer',
    }

    expect(getCogCalibrationActionModel(view)).toEqual({
      indicator: null,
      toggleLabel: null,
    })
  })

  test('models a supplement advisor card with reversible disclosure', () => {
    const view: CogCalibrationView = {
      kind: 'advisor',
      intensity: 'supplement',
      advisorAnswer: 'KogCat answer',
    }

    expect(getCogAdvisorCardModel(view, false)).toEqual({
      tone: 'supplement',
      expanded: false,
      title: 'advisor:card.supplement.title',
      summary: 'advisor:card.supplement.summary',
      actionLabel: 'advisor:card.view',
    })
    expect(getCogAdvisorCardModel(view, true)).toMatchObject({
      expanded: true,
      actionLabel: 'advisor:card.hide',
    })
  })

  test('models a caution advisor card for high-distance judgments', () => {
    const view: CogCalibrationView = {
      kind: 'advisor',
      intensity: 'caution',
      advisorAnswer: 'KogCat answer',
    }

    expect(getCogAdvisorCardModel(view, false)).toMatchObject({
      tone: 'caution',
      title: 'advisor:card.caution.title',
    })
  })

  test('renders expanded quick-mode advisor content as markdown', () => {
    expect(cogCalibrationStatusSource).toContain('ObsidianMarkdown')
    expect(cogCalibrationStatusSource).toContain(
      '<ObsidianMarkdown content={view.advisorAnswer} scale="xs" />',
    )
  })
})
