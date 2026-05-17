import * as Popover from '@radix-ui/react-popover'
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Coins,
  Cpu,
  Info,
} from 'lucide-react'

import { ResponseUsage } from '../../types/llm/response'

type LLMResponseInfoProps = {
  usage: ResponseUsage | null
  estimatedPrice: number | null
  model: string | null
}

export default function LLMResponseInfoPopover({
  usage,
  estimatedPrice,
  model,
}: LLMResponseInfoProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="clickable-icon">
          <Info size={12} />
        </button>
      </Popover.Trigger>
      {usage ? (
        <Popover.Content className="cc-popover-content cc-llm-info-content">
          <div className="cc-llm-info-header">LLM Response Information</div>
          <div className="cc-llm-info-tokens">
            <div className="cc-llm-info-tokens-header">Token Count</div>
            <div className="cc-llm-info-tokens-grid">
              <div className="cc-llm-info-token-row">
                <ArrowUp className="cc-llm-info-icon--input" />
                <span>Input:</span>
                <span className="cc-llm-info-token-value">
                  {usage.prompt_tokens}
                </span>
              </div>
              <div className="cc-llm-info-token-row">
                <ArrowDown className="cc-llm-info-icon--output" />
                <span>Output:</span>
                <span className="cc-llm-info-token-value">
                  {usage.completion_tokens}
                </span>
              </div>
              <div className="cc-llm-info-token-row cc-llm-info-token-total">
                <ArrowRightLeft className="cc-llm-info-icon--total" />
                <span>Total:</span>
                <span className="cc-llm-info-token-value">
                  {usage.total_tokens}
                </span>
              </div>
            </div>
          </div>
          <div className="cc-llm-info-footer-row">
            <Coins className="cc-llm-info-icon--footer" />
            <span>Estimated Price:</span>
            <span className="cc-llm-info-footer-value">
              {estimatedPrice === null
                ? 'Not available'
                : `$${estimatedPrice.toFixed(4)}`}
            </span>
          </div>
          <div className="cc-llm-info-footer-row">
            <Cpu className="cc-llm-info-icon--footer" />
            <span>Model:</span>
            <span className="cc-llm-info-footer-value cc-llm-info-model">
              {model ?? 'Not available'}
            </span>
          </div>
        </Popover.Content>
      ) : (
        <Popover.Content className="cc-popover-content">
          <div>Usage statistics are not available for this model</div>
        </Popover.Content>
      )}
    </Popover.Root>
  )
}
