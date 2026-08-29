import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { getConfigValue } from './configs'

interface MailConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

let cachedTransporter: Transporter | null = null
let cachedSignature = ''

async function loadMailConfig(): Promise<MailConfig> {
  const [host, port, secure, user, pass, from] = await Promise.all([
    getConfigValue('mail.host', ''),
    getConfigValue<number>('mail.port', 587),
    getConfigValue<boolean>('mail.secure', false),
    getConfigValue('mail.user', ''),
    getConfigValue('mail.pass', ''),
    getConfigValue('mail.from', 'no-reply@example.com')
  ])
  return { host, port, secure, user, pass, from }
}

/** Whether SMTP host is configured; other fields may still be empty for open relays */
export async function isMailConfigured(): Promise<boolean> {
  const cfg = await loadMailConfig()
  return cfg.host.trim().length > 0
}

async function getTransporter(): Promise<Transporter> {
  const cfg = await loadMailConfig()
  const signature = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`
  if (cachedTransporter && signature === cachedSignature) {
    return cachedTransporter
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user || cfg.pass
      ? { user: cfg.user, pass: cfg.pass }
      : undefined
  })
  cachedSignature = signature
  return cachedTransporter
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface SendResetEmailResult {
  sent: boolean
  error?: string
}

/** Shared email send helper; returns whether it was delivered */
async function sendMail(
  toEmail: string,
  subject: string,
  buildContent: (cfg: MailConfig) => { html: string, text: string }
): Promise<SendResetEmailResult> {
  const cfg = await loadMailConfig()
  if (!cfg.host) {
    return { sent: false, error: 'SMTP host not configured' }
  }
  const transporter = await getTransporter()
  const { html, text } = buildContent(cfg)
  try {
    await transporter.sendMail({ from: cfg.from, to: toEmail, subject, text, html })
    return { sent: true }
  } catch (e) {
    return { sent: false, error: (e as Error).message }
  }
}

/** Send a password reset email; returns whether it was delivered */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
  opts: { username?: string, ttlMinutes: number } = { ttlMinutes: 30 }
): Promise<SendResetEmailResult> {
  const username = opts.username || toEmail
  const safeResetUrl = escapeHtml(resetUrl)
  const safeUsername = escapeHtml(username)

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">`,
    `<h2 style="margin:0 0 8px;font-size:20px;">Reset your password</h2>`,
    `<p style="margin:0 0 16px;color:#374151;">Hi ${safeUsername},</p>`,
    `<p style="margin:0 0 16px;color:#374151;">We received a request to reset your password. Click the button below to choose a new one. This link expires in ${opts.ttlMinutes} minutes.</p>`,
    `<p style="margin:0 0 16px;text-align:center;">`,
    `<a href="${safeResetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">Reset password</a>`,
    `</p>`,
    `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link:</p>`,
    `<p style="margin:0 0 24px;word-break:break-all;color:#4f46e5;font-size:13px;">${safeResetUrl}</p>`,
    `<p style="margin:0;color:#6b7280;font-size:13px;">If you didn't request a password reset, you can safely ignore this email.</p>`,
    `</body></html>`
  ].join('')

  const text = [
    'Reset your password',
    '',
    `Hi ${username},`,
    '',
    `We received a request to reset your password. Open the link below to choose a new one. This link expires in ${opts.ttlMinutes} minutes.`,
    '',
    resetUrl,
    '',
    'If you didn\'t request a password reset, you can safely ignore this email.'
  ].join('\n')

  return sendMail(toEmail, 'Reset your password', () => ({ html, text }))
}

/** Send an email verification email; returns whether it was delivered */
export async function sendEmailVerificationEmail(
  toEmail: string,
  verifyUrl: string,
  opts: { username?: string, ttlMinutes: number } = { ttlMinutes: 1440 }
): Promise<SendResetEmailResult> {
  const username = opts.username || toEmail
  const safeVerifyUrl = escapeHtml(verifyUrl)
  const safeUsername = escapeHtml(username)
  const ttlHours = Math.max(1, Math.round(opts.ttlMinutes / 60))

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111827;max-width:560px;margin:0 auto;padding:24px;">`,
    `<h2 style="margin:0 0 8px;font-size:20px;">Verify your email</h2>`,
    `<p style="margin:0 0 16px;color:#374151;">Hi ${safeUsername},</p>`,
    `<p style="margin:0 0 16px;color:#374151;">Please confirm your email address by clicking the button below. This link expires in ${ttlHours} hour(s).</p>`,
    `<p style="margin:0 0 16px;text-align:center;">`,
    `<a href="${safeVerifyUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">Verify email</a>`,
    `</p>`,
    `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">If the button doesn't work, copy and paste this link:</p>`,
    `<p style="margin:0 0 24px;word-break:break-all;color:#16a34a;font-size:13px;">${safeVerifyUrl}</p>`,
    `<p style="margin:0;color:#6b7280;font-size:13px;">If you didn't create an account, you can safely ignore this email.</p>`,
    `</body></html>`
  ].join('')

  const text = [
    'Verify your email',
    '',
    `Hi ${username},`,
    '',
    `Please confirm your email address by opening the link below. This link expires in ${ttlHours} hour(s).`,
    '',
    verifyUrl,
    '',
    'If you didn\'t create an account, you can safely ignore this email.'
  ].join('\n')

  return sendMail(toEmail, 'Verify your email', () => ({ html, text }))
}
