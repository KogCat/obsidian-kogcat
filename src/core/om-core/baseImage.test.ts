import { baseImageStatus } from './baseImage'
import * as transport from './transport'

jest.mock('./transport', () => ({
  requestOmCore: jest.fn(),
}))

const mockReq = transport.requestOmCore as jest.MockedFunction<
  typeof transport.requestOmCore
>
const auth: transport.OmCoreAuth = {
  transport: 'uds',
  target: '/tmp/om.sock',
  token: 't',
}

describe('baseImage client', () => {
  beforeEach(() => mockReq.mockReset())

  test('baseImageStatus GETs the read-only status route', async () => {
    mockReq.mockResolvedValue({
      status: 200,
      text: '{}',
      json: {
        state: 'installed',
        installed_version: '1.0.0',
        channel_version: '1.0.0',
      },
    })
    const res = await baseImageStatus(auth)
    expect(mockReq).toHaveBeenCalledWith(auth, {
      path: '/v1/kb/base-image/status',
    })
    expect(res.state).toBe('installed')
    expect(res.installed_version).toBe('1.0.0')
  })

  test('older sidecar without the endpoint degrades to unknown', async () => {
    mockReq.mockResolvedValue({
      status: 404,
      text: 'not found',
      json: undefined,
    })
    const res = await baseImageStatus(auth)
    expect(res.state).toBe('unknown')
    expect(res.installed_version).toBeNull()
  })
})
