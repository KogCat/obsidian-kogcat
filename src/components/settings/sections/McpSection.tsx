import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  Edit,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { App } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSettings } from '../../../contexts/settings-context'
import { McpManager } from '../../../core/mcp/mcpManager'
import SmartComposerPlugin from '../../../main'
import {
  McpServerState,
  McpServerStatus,
  McpTool,
} from '../../../types/mcp.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddMcpServerModal,
  EditMcpServerModal,
} from '../modals/McpServerFormModal'

type McpSectionProps = {
  app: App
  plugin: SmartComposerPlugin
}

export function McpSection({ app, plugin }: McpSectionProps) {
  const { t } = useTranslation('settings')
  const [mcpManager, setMcpManager] = useState<McpManager | null>(null)
  const [mcpServers, setMcpServers] = useState<McpServerState[]>([])

  useEffect(() => {
    const initMCPManager = async () => {
      const mcpManager = await plugin.getMcpManager()
      setMcpManager(mcpManager)
      setMcpServers(mcpManager.getServers())
    }
    initMCPManager()
  }, [plugin])

  useEffect(() => {
    if (mcpManager) {
      const unsubscribe = mcpManager.subscribeServersChange((servers) => {
        setMcpServers(servers)
      })
      return () => {
        unsubscribe()
      }
    }
  }, [mcpManager])

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('mcp.header')}</div>

      <div className="cc-settings-desc cc-settings-callout">
        <strong>{t('mcp.warningLabel')}</strong> {t('mcp.warning')}
      </div>

      {mcpManager?.disabled ? (
        <div className="cc-settings-sub-header-container">
          <div className="cc-settings-sub-header">{t('mcp.notSupported')}</div>
        </div>
      ) : (
        <>
          <div className="cc-settings-sub-header-container">
            <div className="cc-settings-sub-header">{t('mcp.subHeader')}</div>
            <ObsidianButton
              text={t('mcp.addServer')}
              onClick={() => new AddMcpServerModal(app, plugin).open()}
            />
          </div>

          <div className="cc-mcp-servers-container">
            <div className="cc-mcp-servers-header">
              <div>{t('mcp.table.server')}</div>
              <div>{t('mcp.table.status')}</div>
              <div>{t('mcp.table.enabled')}</div>
              <div>{t('mcp.table.actions')}</div>
            </div>
            {mcpServers.length > 0 ? (
              mcpServers.map((server) => (
                <McpServerComponent
                  key={server.name}
                  server={server}
                  app={app}
                  plugin={plugin}
                />
              ))
            ) : (
              <div className="cc-mcp-servers-empty">{t('mcp.noServers')}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function McpServerComponent({
  server,
  app,
  plugin,
}: {
  server: McpServerState
  app: App
  plugin: SmartComposerPlugin
}) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation(['modal', 'common'])
  const [isOpen, setIsOpen] = useState(false)

  const handleEdit = useCallback(() => {
    new EditMcpServerModal(app, plugin, server.name).open()
  }, [server.name, app, plugin])

  const handleDelete = useCallback(() => {
    new ConfirmModal(app, {
      title: t('modal:deleteMcpServer.title'),
      message: t('modal:deleteMcpServer.message', { name: server.name }),
      ctaText: t('modal:deleteMcpServer.cta'),
      onConfirm: async () => {
        await setSettings({
          ...settings,
          mcp: {
            ...settings.mcp,
            servers: settings.mcp.servers.filter((s) => s.id !== server.name),
          },
        })
      },
    }).open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.name, settings, setSettings, app])

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      setSettings({
        ...settings,
        mcp: {
          ...settings.mcp,
          servers: settings.mcp.servers.map((s) =>
            s.id === server.name ? { ...s, enabled } : s,
          ),
        },
      })
    },
    [settings, setSettings, server.name],
  )

  return (
    <div className="cc-mcp-server">
      <div className="cc-mcp-server-row">
        <div className="cc-mcp-server-name">{server.name}</div>
        <div className="cc-mcp-server-status">
          <McpServerStatusBadge status={server.status} />
        </div>
        <div className="cc-mcp-server-toggle">
          <ObsidianToggle
            value={server.config.enabled}
            onChange={handleToggleEnabled}
          />
        </div>
        <div className="cc-mcp-server-actions">
          <button
            onClick={handleEdit}
            className="clickable-icon"
            aria-label={t('common:edit')}
          >
            <Edit size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="clickable-icon"
            aria-label={t('common:delete')}
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="clickable-icon"
            aria-label={isOpen ? t('common:close') : t('common:open')}
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {isOpen && <ExpandedServerInfo server={server} />}
    </div>
  )
}

function ExpandedServerInfo({ server }: { server: McpServerState }) {
  const { t } = useTranslation('settings')
  if (
    server.status === McpServerStatus.Disconnected ||
    server.status === McpServerStatus.Connecting
  ) {
    return null
  }

  return (
    <div className="cc-server-expanded-info">
      {server.status === McpServerStatus.Connected && (
        <div>
          <div className="cc-server-expanded-info-header">
            {t('mcp.tool.toolsHeader')}
          </div>
          <div className="cc-server-tools-container">
            {server.tools.map((tool) => (
              <McpToolComponent key={tool.name} tool={tool} server={server} />
            ))}
          </div>
        </div>
      )}
      {server.status === McpServerStatus.Error && (
        <div>
          <div className="cc-server-expanded-info-header">
            {t('mcp.tool.errorHeader')}
          </div>
          <div className="cc-server-error-message">
            {server.error.message}
          </div>
        </div>
      )}
    </div>
  )
}

function McpServerStatusBadge({ status }: { status: McpServerStatus }) {
  const { t } = useTranslation('settings')
  const statusConfig = {
    [McpServerStatus.Connected]: {
      icon: <Check size={16} />,
      label: t('mcp.status.connected'),
      statusClass: 'cc-mcp-server-status-badge--connected',
    },
    [McpServerStatus.Connecting]: {
      icon: <Loader2 size={16} className="spinner" />,
      label: t('mcp.status.connecting'),
      statusClass: 'cc-mcp-server-status-badge--connecting',
    },
    [McpServerStatus.Error]: {
      icon: <X size={16} />,
      label: t('mcp.status.error'),
      statusClass: 'cc-mcp-server-status-badge--error',
    },
    [McpServerStatus.Disconnected]: {
      icon: <CircleMinus size={14} />,
      label: t('mcp.status.disconnected'),
      statusClass: 'cc-mcp-server-status-badge--disconnected',
    },
  }

  const { icon, label, statusClass } = statusConfig[status]

  return (
    <div className={`cc-mcp-server-status-badge ${statusClass}`}>
      {icon}
      <div className="cc-mcp-server-status-badge-label">{label}</div>
    </div>
  )
}

function McpToolComponent({
  tool,
  server,
}: {
  tool: McpTool
  server: McpServerState
}) {
  const { settings, setSettings } = useSettings()
  const { t } = useTranslation('settings')

  const toolOption = server.config.toolOptions[tool.name]
  const disabled = toolOption?.disabled ?? false
  const allowAutoExecution = toolOption?.allowAutoExecution ?? false

  const handleToggleEnabled = (enabled: boolean) => {
    const toolOptions = server.config.toolOptions
    toolOptions[tool.name] = {
      disabled: !enabled,
      allowAutoExecution: allowAutoExecution,
    }
    setSettings({
      ...settings,
      mcp: {
        ...settings.mcp,
        servers: settings.mcp.servers.map((s) =>
          s.id === server.name
            ? {
                ...s,
                toolOptions: toolOptions,
              }
            : s,
        ),
      },
    })
  }

  const handleToggleAutoExecution = (autoExecution: boolean) => {
    const toolOptions = { ...server.config.toolOptions }
    toolOptions[tool.name] = {
      ...toolOptions[tool.name],
      allowAutoExecution: autoExecution,
    }
    setSettings({
      ...settings,
      mcp: {
        ...settings.mcp,
        servers: settings.mcp.servers.map((s) =>
          s.id === server.name
            ? {
                ...s,
                toolOptions: toolOptions,
              }
            : s,
        ),
      },
    })
  }

  return (
    <div className="cc-mcp-tool">
      <div className="cc-mcp-tool-info">
        <div className="cc-mcp-tool-name">{tool.name}</div>
        <div className="cc-mcp-tool-description">{tool.description}</div>
      </div>
      <div className="cc-mcp-tool-toggle">
        <span className="cc-mcp-tool-toggle-label">{t('mcp.tool.enabled')}</span>
        <ObsidianToggle
          value={!disabled}
          onChange={(value) => handleToggleEnabled(value)}
        />
      </div>
      <div className="cc-mcp-tool-toggle">
        <span className="cc-mcp-tool-toggle-label">{t('mcp.tool.autoExecute')}</span>
        <ObsidianToggle
          value={allowAutoExecution}
          onChange={(value) => handleToggleAutoExecution(value)}
        />
      </div>
    </div>
  )
}
