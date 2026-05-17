import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TextareaAutosize from 'react-textarea-autosize'
import * as z from 'zod'

import { validateServerName } from '../../../core/mcp/tool-name-utils'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import {
  McpServerParameters,
  mcpServerParametersSchema,
} from '../../../types/mcp.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

type McpServerFormComponentProps = {
  plugin: SmartComposerPlugin
  onClose: () => void
  serverId?: string
}

export class AddMcpServerModal extends ReactModal<McpServerFormComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: McpServerFormComponent,
      props: { plugin },
      options: {
        title: tFn('modal:addMcpServer.addTitle'),
      },
    })
  }
}

export class EditMcpServerModal extends ReactModal<McpServerFormComponentProps> {
  constructor(app: App, plugin: SmartComposerPlugin, editServerId: string) {
    super({
      app: app,
      Component: McpServerFormComponent,
      props: { plugin, serverId: editServerId },
      options: {
        title: tFn('modal:addMcpServer.editTitle'),
      },
    })
  }
}

function McpServerFormComponent({
  plugin,
  onClose,
  serverId,
}: McpServerFormComponentProps) {
  const { t } = useTranslation(['modal', 'notice'])
  const existingServer = serverId
    ? plugin.settings.mcp.servers.find((server) => server.id === serverId)
    : undefined

  const [name, setName] = useState(existingServer?.id ?? '')
  const [parameters, setParameters] = useState(
    existingServer ? JSON.stringify(existingServer.parameters, null, 2) : '',
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const PARAMETERS_PLACEHOLDER = JSON.stringify(
    {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: '<YOUR_TOKEN>',
      },
    },
    null,
    2,
  )

  const handleSubmit = async () => {
    try {
      const serverName = name.trim()
      if (serverName.length === 0) {
        throw new Error(t('modal:addMcpServer.errors.nameRequired'))
      }
      validateServerName(serverName)

      if (
        plugin.settings.mcp.servers.find(
          (server) =>
            server.id === serverName && server.id !== existingServer?.id,
        )
      ) {
        throw new Error(t('modal:addMcpServer.errors.nameExists'))
      }

      if (parameters.trim().length === 0) {
        throw new Error(t('modal:addMcpServer.errors.parametersRequired'))
      }
      let parsedParameters: unknown
      try {
        parsedParameters = JSON.parse(parameters)
      } catch {
        throw new Error(t('modal:addMcpServer.errors.invalidJson'))
      }
      const validatedParameters: McpServerParameters = mcpServerParametersSchema
        .strict()
        .parse(parsedParameters)

      const newSettings = {
        ...plugin.settings,
        mcp: {
          ...plugin.settings.mcp,
          servers: existingServer
            ? plugin.settings.mcp.servers.map((server) =>
                server.id === existingServer.id
                  ? {
                      ...server,
                      id: serverName,
                      parameters: validatedParameters,
                    }
                  : server,
              )
            : [
                ...plugin.settings.mcp.servers,
                {
                  id: serverName,
                  parameters: validatedParameters,
                  toolOptions: {},
                  enabled: true,
                },
              ],
        },
      }

      await plugin.setSettings(newSettings)

      onClose()
    } catch (error) {
      if (error instanceof Error) {
        new Notice(error.message)
      } else {
        console.error(error)
        new Notice(t('notice:mcp.addFailed'))
      }
    }
  }

  const validateParameters = useCallback(
    (parameters: string) => {
      try {
        if (parameters.length === 0) {
          setValidationError(t('modal:addMcpServer.errors.parametersRequired'))
          return
        }
        const parsedParameters = JSON.parse(parameters)
        mcpServerParametersSchema.strict().parse(parsedParameters)
        setValidationError(null)
      } catch (error) {
        if (error instanceof SyntaxError) {
          setValidationError(t('modal:addMcpServer.errors.invalidJsonFormat'))
        } else if (error instanceof z.ZodError) {
          const formattedErrors = error.errors
            .map((err) => {
              const path = err.path.length > 0 ? `${err.path.join('.')}: ` : ''
              return `${path}${err.message}`
            })
            .join('\n')
          setValidationError(formattedErrors)
        } else {
          setValidationError(
            error instanceof Error
              ? error.message
              : t('modal:addMcpServer.errors.invalidParameters'),
          )
        }
      }
    },
    [t],
  )

  useEffect(() => {
    validateParameters(parameters)
  }, [parameters, validateParameters])

  return (
    <>
      <ObsidianSetting
        name={t('modal:addMcpServer.name')}
        desc={t('modal:addMcpServer.nameDesc')}
        required
      >
        <ObsidianTextInput
          value={name}
          onChange={(value: string) => setName(value)}
          placeholder={t('modal:addMcpServer.namePlaceholder')}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('modal:addMcpServer.parameters')}
        desc={t('modal:addMcpServer.parametersDesc')}
        className="cc-settings-textarea-header cc-settings-description-preserve-whitespace"
        required
      />
      <TextareaAutosize
        value={parameters}
        placeholder={PARAMETERS_PLACEHOLDER}
        onChange={(e) => setParameters(e.target.value)}
        className="cc-mcp-server-modal-textarea"
        maxRows={20}
        minRows={PARAMETERS_PLACEHOLDER.split('\n').length}
      />
      {validationError !== null ? (
        <div className="cc-mcp-server-modal-validation cc-mcp-server-modal-validation--error">
          {validationError}
        </div>
      ) : (
        <div className="cc-mcp-server-modal-validation cc-mcp-server-modal-validation--success">
          {t('modal:addMcpServer.valid')}
        </div>
      )}

      <ObsidianSetting>
        <ObsidianButton text={t('modal:addMcpServer.save')} onClick={handleSubmit} cta />
        <ObsidianButton text={t('modal:addMcpServer.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
