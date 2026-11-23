import { setTimeout as delay } from 'node:timers/promises';

// A listening port does not imply that the database and rendered pages are ready.
export async function probeReady(base, fetcher = fetch, signal, startPath = '/') {
  try {
    const options = () => ({ signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
    const health = await fetcher(base + '/api/health', options());
    if (!health.ok || (await health.json()).checks?.database !== 'ok') return false;
    const page = await fetcher(base + '/login?redirect=' + encodeURIComponent(startPath), options());
    if (!page.ok || !(await page.text()).includes('id="__nuxt"')) return false;
    const target = await fetcher(base + startPath, { ...options(), redirect: 'manual' });
    return target.status === 200 || (target.status === 302 && Boolean(target.headers.get('location')?.startsWith('/login?')));
  } catch { return false; }
}

export async function waitForReady(base, { signal, onProgress = () => {}, timeoutMs = 600000, startPath = '/' } = {}) {
  const started = Date.now();
  while (!signal?.aborted && Date.now() - started < timeoutMs) {
    if (await probeReady(base, fetch, signal, startPath)) return true;
    if (signal?.aborted) return false;
    onProgress(Math.round((Date.now() - started) / 1000));
    await delay(3000, undefined, { signal }).catch(() => {});
  }
  return false;
}
