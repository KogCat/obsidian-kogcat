import { type KogCatMessageState } from './useKogCatCalibration'

// Quick Answer keeps R stable and places KogCat in a card. Advisor Answer makes
// KogCat the primary visible response after the advisor answer is ready.
export function resolveKogcatContent(
  raw: string,
  state?: KogCatMessageState,
): string {
  if (!state) return raw
  switch (state.view.kind) {
    case 'advisor_primary':
      return state.view.advisorAnswer
    default:
      return raw
  }
}
