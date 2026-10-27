import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { signWxPayMessage, verifyWxPayMessage } from '../../../server/utils/wxPaySignature'

describe('wxPaySignature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const message = '1700000000\nnonce\n{"id":"test"}\n'

  it('verifies a signature created by the matching private key', () => {
    const signature = signWxPayMessage(message, privatePem)
    expect(verifyWxPayMessage(message, signature, publicPem)).toBe(true)
  })

  it('rejects a modified message', () => {
    const signature = signWxPayMessage(message, privatePem)
    expect(verifyWxPayMessage(`${message}tampered`, signature, publicPem)).toBe(false)
  })

  it('rejects an invalid public key without throwing', () => {
    const signature = signWxPayMessage(message, privatePem)
    expect(verifyWxPayMessage(message, signature, 'not-a-public-key')).toBe(false)
  })
})
