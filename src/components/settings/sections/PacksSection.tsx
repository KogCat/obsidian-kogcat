import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { App, FileSystemAdapter, Notice, TFile } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import {
  PackApiError,
  PackInfoResult,
  PackLockEntry,
  packInfo,
  packInstall,
  packList,
  packUninstall,
  packUpgrade,
} from '../../../core/om-core/packs'
import { OmCoreAuth } from '../../../core/om-core/transport'
import SmartComposerPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ConfirmModal } from '../../modals/ConfirmModal'

type Props = {
  app: App
  plugin: SmartComposerPlugin
}

function vaultBasePath(app: App): string {
  const adapter = app.vault.adapter
  if (adapter instanceof FileSystemAdapter) return adapter.getBasePath()
  return ''
}

export function PacksSection({ app, plugin }: Props) {
  const { t } = useTranslation(['settings', 'modal', 'notice'])
  const [auth, setAuth] = useState<OmCoreAuth | null>(null)
  const [packs, setPacks] = useState<Record<string, PackLockEntry>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [ompackFiles, setOmpackFiles] = useState<TFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [installing, setInstalling] = useState(false)

  const loadPacks = useCallback(async (a: OmCoreAuth) => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await packList(a)
      setPacks(result.packs)
      if (result.error) setLoadError(result.error)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const a = plugin.omCore?.getAuth() ?? null
    setAuth(a)
    if (a) loadPacks(a)
    else setLoading(false)

    const files = app.vault.getFiles().filter((f) => f.extension === 'ompack')
    setOmpackFiles(files)
    if (files.length > 0) setSelectedFile(files[0].path)
  }, [plugin, app, loadPacks])

  const runUpgrade = useCallback(
    async (a: OmCoreAuth, absPath: string) => {
      try {
        const plan = await packUpgrade(a, absPath, { dry_run: true })
        const s = plan.plan_summary
        const planMsg = s?.is_empty
          ? t('modal:upgradePack.summaryEmpty')
          : t('modal:upgradePack.summary', {
              migrations: s?.migrations ?? 0,
              markdownEdits: s?.markdown_edits ?? 0,
              dbEdits: s?.db_edits ?? 0,
            })

        new ConfirmModal(app, {
          title: t('modal:upgradePack.title', {
            name: plan.name,
            oldVersion: plan.old_version,
            newVersion: plan.new_version,
          }),
          message: planMsg,
          ctaText: t('modal:upgradePack.cta'),
          onConfirm: async () => {
            try {
              const result = await packUpgrade(a, absPath, { yes: true })
              new Notice(
                t('notice:pack.upgraded', {
                  name: result.name,
                  version: result.new_version,
                }),
              )
              if (result.warnings.length > 0)
                new Notice(
                  t('notice:pack.warnings', {
                    warnings: result.warnings.join('; '),
                  }),
                )
              await loadPacks(a)
            } catch (err) {
              new Notice(
                t('notice:pack.upgradeFailed', {
                  message: (err as Error).message,
                }),
              )
            }
          },
        }).open()
      } catch (e) {
        new Notice(
          t('notice:pack.upgradeFailed', { message: (e as Error).message }),
        )
      }
    },
    [app, loadPacks, t],
  )

  const handleInstallOrUpgrade = useCallback(async () => {
    if (!auth || !selectedFile) return
    const base = vaultBasePath(app)
    if (!base) {
      new Notice(t('notice:pack.vaultPathUnresolved'))
      return
    }
    const absPath = `${base}/${selectedFile}`
    setInstalling(true)
    try {
      const result = await packInstall(auth, absPath)
      if (result.noop) {
        new Notice(
          t('notice:pack.alreadyInstalled', {
            name: result.name,
            version: result.version,
          }),
        )
      } else {
        new Notice(
          t('notice:pack.installed', {
            name: result.name,
            version: result.version,
            nodes: result.stats.nodes,
            edges: result.stats.edges,
          }),
        )
        if (result.warnings.length > 0)
          new Notice(
            t('notice:pack.warnings', {
              warnings: result.warnings.join('; '),
            }),
          )
      }
      await loadPacks(auth)
    } catch (e) {
      if (e instanceof PackApiError && e.code === 'PACK_VERSION_CONFLICT') {
        await runUpgrade(auth, absPath)
      } else {
        new Notice(
          t('notice:pack.installFailed', { message: (e as Error).message }),
        )
      }
    } finally {
      setInstalling(false)
    }
  }, [auth, selectedFile, app, loadPacks, runUpgrade, t])

  const packNames = Object.keys(packs)

  return (
    <div className="cc-settings-section">
      <div className="cc-settings-header">{t('settings:packs.header')}</div>

      {!auth ? (
        <div className="cc-settings-desc">
          {t('settings:packs.engineUnavailable')}
        </div>
      ) : loading ? (
        <div className="cc-settings-desc">{t('settings:packs.loading')}</div>
      ) : loadError ? (
        <div className="cc-settings-desc">
          {t('settings:packs.error', { message: loadError })}
        </div>
      ) : (
        <>
          <div className="cc-mcp-servers-container">
            {packNames.length > 0 ? (
              packNames.map((name) => (
                <PackRow
                  key={name}
                  name={name}
                  entry={packs[name]}
                  auth={auth}
                  app={app}
                  onDone={() => loadPacks(auth)}
                />
              ))
            ) : (
              <div className="cc-mcp-servers-empty">
                {t('settings:packs.noPacks')}
              </div>
            )}
          </div>

          <div className="cc-settings-sub-header-container" style={{ marginTop: '12px' }}>
            {ompackFiles.length > 0 ? (
              <>
                <ObsidianDropdown
                  value={selectedFile}
                  options={Object.fromEntries(
                    ompackFiles.map((f) => [f.path, f.name]),
                  )}
                  onChange={setSelectedFile}
                />
                <ObsidianButton
                  text={
                    installing
                      ? t('settings:packs.installing')
                      : t('settings:packs.installOrUpgrade')
                  }
                  onClick={handleInstallOrUpgrade}
                />
              </>
            ) : (
              <div className="cc-settings-desc">
                <Trans
                  i18nKey="settings:packs.noFiles"
                  components={{ code: <code /> }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PackRow({
  name,
  entry,
  auth,
  app,
  onDone,
}: {
  name: string
  entry: PackLockEntry
  auth: OmCoreAuth
  app: App
  onDone: () => void
}) {
  const { t } = useTranslation(['settings', 'modal', 'notice', 'pack', 'common'])
  const [isOpen, setIsOpen] = useState(false)
  const [info, setInfo] = useState<PackInfoResult | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)

  const toggleExpand = useCallback(async () => {
    if (!isOpen && !info) {
      setLoadingInfo(true)
      try {
        const result = await packInfo(auth, name)
        setInfo(result)
      } catch {
        // ignore — expand will show nothing
      } finally {
        setLoadingInfo(false)
      }
    }
    setIsOpen((v) => !v)
  }, [isOpen, info, auth, name])

  const handleUninstall = useCallback(() => {
    new ConfirmModal(app, {
      title: t('modal:uninstallPack.title', { name }),
      message: t('modal:uninstallPack.message', { name }),
      ctaText: t('modal:uninstallPack.cta'),
      onConfirm: async () => {
        try {
          await packUninstall(auth, name, true)
          new Notice(t('notice:pack.uninstalled', { name }))
          onDone()
        } catch (e) {
          new Notice(
            t('notice:pack.uninstallFailed', {
              message: (e as Error).message,
            }),
          )
        }
      },
    }).open()
  }, [name, auth, app, onDone, t])

  const manifest = info?.manifest as Record<string, unknown> | undefined
  const stats = manifest?.stats as Record<string, number> | undefined

  return (
    <div className="cc-mcp-server">
      <div className="cc-mcp-server-row">
        <div className="cc-mcp-server-name">{name}</div>
        <div
          className="cc-mcp-server-status"
          style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}
        >
          {entry.version}
        </div>
        <div
          className="cc-mcp-server-toggle"
          style={{ fontSize: '0.8em', color: 'var(--text-faint)' }}
        >
          {entry.installed_at
            ? new Date(entry.installed_at).toLocaleDateString()
            : ''}
        </div>
        <div className="cc-mcp-server-actions">
          <button
            onClick={handleUninstall}
            className="clickable-icon"
            aria-label={t('modal:uninstallPack.cta')}
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={toggleExpand}
            className="clickable-icon"
            aria-label={isOpen ? t('common:close') : t('common:open')}
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="cc-server-expanded-info">
          {loadingInfo ? (
            <div>{t('settings:packs.loading')}</div>
          ) : stats ? (
            <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
              {t('pack:stats', {
                nodes: stats.nodes ?? 0,
                edges: stats.edges ?? 0,
                vectors: stats.vectors ?? 0,
              })}
              {entry.pinned ? t('pack:pinnedSuffix') : ''}
            </div>
          ) : (
            <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
              {t('settings:packs.noManifest')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
