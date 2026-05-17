import { ChevronDown, ChevronUp } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'

import DotLoader from '../common/DotLoader'

import { ObsidianMarkdown } from './ObsidianMarkdown'

const AssistantMessageReasoning = memo(function AssistantMessageReasoning({
  reasoning,
}: {
  reasoning: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showLoader, setShowLoader] = useState(false)
  const previousReasoning = useRef(reasoning)

  useEffect(() => {
    if (
      previousReasoning.current !== reasoning &&
      previousReasoning.current !== ''
    ) {
      setShowLoader(true)
      previousReasoning.current = reasoning
      const timer = setTimeout(() => {
        setShowLoader(false)
      }, 1000)
      return () => clearTimeout(timer)
    }
    previousReasoning.current = reasoning
  }, [reasoning])

  const handleToggle = () => {
    setIsExpanded((current) => !current)
  }

  return (
    <div className="cc-assistant-message-metadata">
      <div
        className="cc-assistant-message-metadata-toggle"
        onClick={handleToggle}
      >
        <span>Reasoning {showLoader && <DotLoader />}</span>
        {isExpanded ? (
          <ChevronUp className="cc-assistant-message-metadata-toggle-icon" />
        ) : (
          <ChevronDown className="cc-assistant-message-metadata-toggle-icon" />
        )}
      </div>
      {isExpanded && (
        <div className="cc-assistant-message-metadata-content">
          <ObsidianMarkdown content={reasoning} scale="xs" />
        </div>
      )}
    </div>
  )
})

export default AssistantMessageReasoning
