import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { Loader2, PickaxeIcon, RefreshCw, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppProvider } from '../../../contexts/app-context'
import {
  DatabaseProvider,
  useDatabase,
} from '../../../contexts/database-context'
import {
  SettingsProvider,
  useSettings,
} from '../../../contexts/settings-context'
import { getEmbeddingModelClient } from '../../../core/rag/embedding'
import { t as tFn } from '../../../i18n'
import SmartComposerPlugin from '../../../main'
import { EmbeddingDbStats } from '../../../types/embedding'
import { IndexProgress } from '../../chat-view/QueryProgress'
import { ReactModal } from '../../common/ReactModal'

type EmbeddingDbManagerModalComponentWrapperProps = {
  app: App
  plugin: SmartComposerPlugin
}

export class EmbeddingDbManageModal extends ReactModal<EmbeddingDbManagerModalComponentWrapperProps> {
  constructor(app: App, plugin: SmartComposerPlugin) {
    super({
      app: app,
      Component: EmbeddingDbManagerModalComponentWrapper,
      props: { app, plugin },
      options: {
        title: tFn('modal:embeddingDbManage.title'),
      },
    })
    this.modalEl.style.width = '720px'
  }
}

function EmbeddingDbManagerModalComponentWrapper({
  app,
  plugin,
}: EmbeddingDbManagerModalComponentWrapperProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0, // Immediately garbage collect queries. It prevents memory leak on ChatView close.
      },
      mutations: {
        gcTime: 0, // Immediately garbage collect mutations. It prevents memory leak on ChatView close.
      },
    },
  })

  return (
    <AppProvider app={app}>
      <SettingsProvider
        settings={plugin.settings}
        setSettings={(newSettings) => plugin.setSettings(newSettings)}
        addSettingsChangeListener={(listener) =>
          plugin.addSettingsChangeListener(listener)
        }
      >
        <DatabaseProvider getDatabaseManager={() => plugin.getDbManager()}>
          <QueryClientProvider client={queryClient}>
            <EmbeddingDbManageModalComponent />
          </QueryClientProvider>
        </DatabaseProvider>
      </SettingsProvider>
    </AppProvider>
  )
}

function EmbeddingDbManageModalComponent() {
  const { getVectorManager } = useDatabase()
  const { settings } = useSettings()
  const { t } = useTranslation(['modal', 'notice'])
  const [indexProgressMap, setIndexProgressMap] = useState<
    Map<string, IndexProgress>
  >(new Map())

  const {
    data: stats = [],
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery<EmbeddingDbStats[]>({
    queryKey: ['embedding-db-stats'],
    queryFn: async () => {
      const dbStats = await (await getVectorManager()).getEmbeddingStats()

      const statsMap = new Map(dbStats.map((stat) => [stat.model, stat]))

      return settings.embeddingModels.map((embeddingModel) => ({
        model: embeddingModel.id,
        rowCount: statsMap.get(embeddingModel.id)?.rowCount ?? 0,
        totalDataBytes: statsMap.get(embeddingModel.id)?.totalDataBytes ?? 0,
      }))
    },
  })

  const handleRebuildIndex = async (modelId: string) => {
    try {
      const embeddingModel = getEmbeddingModelClient({
        settings,
        embeddingModelId: modelId,
      })

      await (
        await getVectorManager()
      ).updateVaultIndex(
        embeddingModel,
        {
          chunkSize: settings.ragOptions.chunkSize,
          excludePatterns: settings.ragOptions.excludePatterns,
          includePatterns: settings.ragOptions.includePatterns,
          reindexAll: true,
        },
        (progress) => {
          setIndexProgressMap((prev) => {
            const newMap = new Map(prev)
            newMap.set(modelId, progress)
            return newMap
          })
        },
      )
    } catch (error) {
      console.error(error)
      new Notice(t('notice:embedding.rebuildFailed'))
    } finally {
      setIndexProgressMap((prev) => {
        const newMap = new Map(prev)
        newMap.delete(modelId)
        return newMap
      })
      await refetch()
    }
  }

  const handleRemoveIndex = async (modelId: string) => {
    try {
      const embeddingModel = getEmbeddingModelClient({
        settings,
        embeddingModelId: modelId,
      })
      await (await getVectorManager()).clearAllVectors(embeddingModel)
    } catch (error) {
      console.error(error)
      new Notice(t('notice:embedding.removeFailed'))
    } finally {
      await refetch()
    }
  }

  if (isLoading) {
    return <div>{t('modal:embeddingDbManage.loading')}</div>
  }

  return (
    <div className="cc-settings-embedding-db-manage-root">
      <div className="cc-settings-embedding-db-manage-header">
        <button
          className="clickable-icon"
          aria-label={t('modal:embeddingDbManage.refresh')}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={16} className={clsx(isFetching && 'spinner')} />
        </button>

        <span className="cc-settings-embedding-db-manage-last-updated">
          {t('modal:embeddingDbManage.lastUpdated', {
            time: dayjs(dataUpdatedAt).format('YYYY-MM-DD HH:mm:ss'),
          })}
        </span>
      </div>
      <table className="cc-settings-embedding-db-manage-table">
        <thead>
          <tr>
            <th>{t('modal:embeddingDbManage.columns.model')}</th>
            <th>{t('modal:embeddingDbManage.columns.totalEmbeddings')}</th>
            <th>{t('modal:embeddingDbManage.columns.sizeMb')}</th>
            <th>{t('modal:embeddingDbManage.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((stat) => (
            <tr key={stat.model}>
              <td>{stat.model}</td>
              <td>{stat.rowCount}</td>
              <td>{(stat.totalDataBytes / 1000 / 1000).toFixed(2)}</td>
              {indexProgressMap.get(stat.model) ? (
                <td className="cc-settings-embedding-db-manage-actions-loading">
                  <Loader2 className="spinner" size={14} />
                  <div>
                    {Math.round(
                      ((indexProgressMap.get(stat.model)?.completedChunks ??
                        0) /
                        (indexProgressMap.get(stat.model)?.totalChunks ?? 1)) *
                        100,
                    )}
                    %
                  </div>
                </td>
              ) : (
                <td className="cc-settings-embedding-db-manage-actions">
                  <button
                    className="clickable-icon"
                    aria-label={t('modal:embeddingDbManage.actions.rebuild')}
                    onClick={() => handleRebuildIndex(stat.model)}
                  >
                    <PickaxeIcon size={16} />
                  </button>
                  <button
                    className="clickable-icon"
                    aria-label={t('modal:embeddingDbManage.actions.remove')}
                    onClick={() => handleRemoveIndex(stat.model)}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
