import { createSign, createVerify } from 'node:crypto'

/** Sign a WeChat Pay API v3 message with the merchant API private key. */
export function signWxPayMessage(message: string, privateKey: string): string {
  return createSign('RSA-SHA256').update(message).sign(privateKey, 'base64')
}

/** Verify a WeChat Pay API v3 signature with a PEM public key or certificate. */
export function verifyWxPayMessage(message: string, signature: string, publicKey: string): boolean {
  try {
    return createVerify('RSA-SHA256').update(message).verify(publicKey, signature, 'base64')
  } catch (error) {
    console.error('[wxpay] signature verification failed:', error)
    return false
  }
}
