import { OmCoreAuth, requestOmCore } from './transport'

// Mirrors om-core GET /v1/kb/base-image/status — free base knowledge image
// (whole-db swap). Consumption lives in om-core; this is display-only.

export type BaseImageStatus = {
  installed_version: string | null
  channel_version: string | null
  state: string // installed | absent | unknown
}

export async function baseImageStatus(
  auth: OmCoreAuth,
): Promise<BaseImageStatus> {
  const res = await requestOmCore(auth, { path: '/v1/kb/base-image/status' })
  if (res.status < 200 || res.status >= 300) {
    // Older sidecar without the endpoint → unknown, never break onboarding UX.
    return { installed_version: null, channel_version: null, state: 'unknown' }
  }
  const body = res.json as Partial<BaseImageStatus> | undefined
  return {
    installed_version: body?.installed_version ?? null,
    channel_version: body?.channel_version ?? null,
    state: body?.state ?? 'unknown',
  }
}
