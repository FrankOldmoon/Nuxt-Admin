import { getConfigValue } from '~~/server/utils/configs'
import { isAlipayEnabled } from '~~/server/utils/alipay'
import { getCreditPackages } from '~~/server/utils/credits'

// GET /api/credits/packages — price list plus the perks the page needs to
// explain the product (monthly member allowance, whether self-serve is on).
export default defineEventHandler(async () => {
  const [packages, memberMonthly, alipayEnabled] = await Promise.all([
    getCreditPackages(),
    getConfigValue<number>('credits.memberMonthly', 30),
    isAlipayEnabled()
  ])
  return {
    packages,
    memberMonthly: Math.max(0, Math.floor(Number(memberMonthly) || 0)),
    alipayEnabled
  }
})
