import { useEffect, useState } from 'react'

import { usePlugin } from '../../contexts/plugin-context'
import { VaultIndexStatus } from '../../core/rag/VaultIndexScheduler'

const IDLE_STATUS: VaultIndexStatus = { kind: 'idle' }

export function HeaderVaultIndexStatus() {
  const plugin = usePlugin()
  const [status, setStatus] = useState<VaultIndexStatus>(
    () => plugin.vaultIndexScheduler?.getStatus() ?? IDLE_STATUS,
  )

  useEffect(() => {
    return plugin.vaultIndexScheduler?.subscribe(setStatus)
  }, [plugin])

  const label =
    status.kind === 'idle'
      ? 'Index ready'
      : status.kind === 'scheduled'
        ? 'Index queued'
        : status.kind === 'indexing'
          ? 'Indexing'
          : 'Index failed'

  const title =
    status.kind === 'idle'
      ? 'Vault index is ready'
      : status.kind === 'scheduled'
        ? `Vault index update queued: ${status.reason}`
        : status.kind === 'indexing'
          ? getIndexingTitle(status)
          : `Vault index failed: ${status.message}`

  return (
    <span
      className={`cc-vault-index-status cc-vault-index-status--${status.kind}`}
      title={title}
      aria-label={title}
    >
      <span className="cc-vault-index-status-dot" />
      <span className="cc-vault-index-status-label">{label}</span>
    </span>
  )
}

function getIndexingTitle(
  status: Extract<VaultIndexStatus, { kind: 'indexing' }>,
) {
  if (
    status.totalChunks === undefined ||
    status.completedChunks === undefined
  ) {
    return 'Vault index is updating'
  }
  return `Vault index is updating: ${status.completedChunks}/${status.totalChunks} chunks${
    status.waitingForRateLimit ? ' · waiting for rate limit' : ''
  }`
}
