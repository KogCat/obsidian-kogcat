import { Wrench } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useMcp } from '../../contexts/mcp-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { McpManager } from '../../core/mcp/mcpManager'
import { McpSectionModal } from '../modals/McpSectionModal'

export function HeaderToolsButton() {
  const plugin = usePlugin()
  const app = useApp()
  const { settings } = useSettings()
  const { getMcpManager } = useMcp()

  const [mcpManager, setMcpManager] = useState<McpManager | null>(null)
  const [toolCount, setToolCount] = useState(0)

  const onClick = useCallback(() => {
    new McpSectionModal(app, plugin).open()
  }, [app, plugin])

  useEffect(() => {
    void (async () => {
      const m = await getMcpManager()
      setMcpManager(m)
      const tools = await m.listAvailableTools()
      setToolCount(tools.length)
    })()
  }, [getMcpManager])

  useEffect(() => {
    if (!mcpManager) return
    const unsubscribe = mcpManager.subscribeServersChange(async () => {
      const tools = await mcpManager.listAvailableTools()
      setToolCount(tools.length)
    })
    return () => {
      unsubscribe()
    }
  }, [mcpManager])

  const enabled = settings.chatOptions.enableTools
  const label = `Tools (${toolCount})${enabled ? '' : ' — disabled'}`

  return (
    <button
      onClick={onClick}
      className={`clickable-icon cc-header-tools${enabled ? '' : ' is-muted'}`}
      aria-label={label}
      title={label}
    >
      <Wrench size={18} />
      {toolCount > 0 && (
        <span className="cc-header-tools-count">{toolCount}</span>
      )}
    </button>
  )
}
