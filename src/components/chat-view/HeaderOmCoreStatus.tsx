import { useEffect, useState } from 'react'

import { usePlugin } from '../../contexts/plugin-context'
import type { OmCoreStatus } from '../../core/om-core/lifecycle'

export function HeaderOmCoreStatus() {
  const plugin = usePlugin()
  const [status, setStatus] = useState<OmCoreStatus>(
    plugin.omCore?.getStatus() ?? { kind: 'stopped' },
  )

  useEffect(() => {
    const lifecycle = plugin.omCore
    if (!lifecycle) return
    return lifecycle.subscribe(setStatus)
  }, [plugin])

  const colorVar =
    status.kind === 'running'
      ? 'var(--color-green)'
      : status.kind === 'failed'
        ? 'var(--color-red)'
        : status.kind === 'starting'
          ? 'var(--color-yellow)'
          : 'var(--text-muted)'

  const label =
    status.kind === 'running'
      ? 'Ready'
      : status.kind === 'failed'
        ? 'Error'
        : status.kind === 'starting'
          ? 'Starting'
          : 'Offline'

  const title =
    status.kind === 'running'
      ? `om-core v${status.version ?? '?'} · ${plugin.omCore?.getEndpoint() ?? ''}`
      : status.kind === 'failed'
        ? `om-core failed: ${status.message}`
        : `om-core ${status.kind}`

  return (
    <span className="cc-om-core-status" title={title} aria-label={title}>
      <span
        className="cc-om-core-status-dot"
        style={{ backgroundColor: colorVar }}
      />
      <span className="cc-om-core-status-label">{label}</span>
    </span>
  )
}
