import { generateKeyPairSync } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { signWxPayMessage } from '../../../server/utils/wxPaySignature'

const config = vi.hoisted(() => new Map<string, unknown>())
let verifyWxPayNotifySignature: typeof import('../../../server/utils/wxPay')['verifyWxPayNotifySignature']

beforeAll(async () => {
  vi.doMock('../../../server/utils/configs', () => ({
    getConfigValue: vi.fn(async (key: string, fallback: unknown) => config.has(key) ? config.get(key) : fallback)
  }))
  ;({ verifyWxPayNotifySignature } = await import('../../../server/utils/wxPay'))
})

describe('verifyWxPayNotifySignature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const publicKeyId = 'PUB_KEY_ID_TEST'
  const timestamp = '1700000000'
  const nonce = 'notify-nonce'
  const rawBody = '{"id":"notify-test"}'

  config.set('wx.pay.enabled', true)
  config.set('wx.appid', 'wx-test')
  config.set('wx.pay.mchid', '1900000001')
  config.set('wx.pay.serialNo', 'MERCHANT_SERIAL')
  config.set('wx.pay.privateKey', '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----')
  config.set('wx.pay.apiv3Key', '12345678901234567890123456789012')
  config.set('wx.pay.notifyUrl', 'https://example.com/api/wx/pay/notify')
  config.set('wx.pay.publicKeyId', publicKeyId)
  config.set('wx.pay.publicKey', publicPem)

  it('accepts a valid notification signed with the configured WeChat Pay public key', async () => {
    const signature = signWxPayMessage(`${timestamp}\n${nonce}\n${rawBody}\n`, privatePem)
    await expect(verifyWxPayNotifySignature({ timestamp, nonce, signature, serial: publicKeyId }, rawBody)).resolves.toBe(true)
  })

  it('rejects a notification when the public key ID does not match', async () => {
    const signature = signWxPayMessage(`${timestamp}\n${nonce}\n${rawBody}\n`, privatePem)
    await expect(verifyWxPayNotifySignature({ timestamp, nonce, signature, serial: 'PUB_KEY_ID_OTHER' }, rawBody)).resolves.toBe(false)
  })
})
