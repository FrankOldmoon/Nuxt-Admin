import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { localState, localHome } from './local-paths.mjs';
import { probeReady, waitForReady } from './dev-readiness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
process.env.NUXT_TELEMETRY_DISABLED = '1';
const require = createRequire(path.join(root, 'package.json'));
const { Pool } = require('pg');
const mode = process.argv[2] || 'dev';
const base = 'http://127.0.0.1:3000';
const startPath = process.env.NUXT_DEV_START_PATH || '/';
if (!startPath.startsWith('/') || startPath.startsWith('//')) throw Error('NUXT_DEV_START_PATH must be a local path');
const startUrl = base + startPath;
const shutdown = new AbortController();
let child;
let databaseUrl;
let log;
let stage = '配置';
let stopping = false;

function portOpen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function checkDatabase() {
  const pool = new Pool({ connectionString: databaseUrl.toString(), connectionTimeoutMillis: 3000, query_timeout: 3000 });
  try { await pool.query('SELECT 1'); } finally { await pool.end(); }
}

function run(exe, args) {
  return new Promise((resolve, reject) => {
    // A separate process group prevents Nuxt's Ctrl+C from terminating PostgreSQL.
    const proc = spawn(exe, args, { stdio: 'ignore', detached: true, windowsHide: true });
    proc.once('error', reject);
    proc.once('exit', code => code === 0 ? resolve() : reject(Error(`命令退出码 ${code}`)));
  });
}

async function ensureDatabase() {
  try { await checkDatabase(); return; } catch (error) {
    // Auto-start is opt-in and only applies to an explicitly configured local cluster.
    const binary = process.env.NUXT_PG_CTL;
    const data = process.env.NUXT_PG_DATA;
    const port = Number(databaseUrl.port || 5432);
    const host = databaseUrl.hostname;
    if (!['127.0.0.1', 'localhost'].includes(host) || !binary || !data
      || !fs.existsSync(binary) || !fs.existsSync(path.join(data, 'PG_VERSION'))) throw error;
    if (!await portOpen(port, host)) {
      const pgLog = process.env.NUXT_PG_LOG || path.join(localHome, 'postgres.log');
      fs.mkdirSync(path.dirname(pgLog), { recursive: true });
      console.log('[1/3] PostgreSQL 未运行，正在后台启动已配置的本机数据库…');
      try { await run(binary, ['-D', data, '-l', pgLog, '-o', '-h ' + host + ' -p ' + port, '-w', '-t', '60', 'start']); }
      catch { throw Error('PostgreSQL 自动启动失败，请查看数据库日志：' + pgLog); }
    }
    console.log('[1/3] 等待数据库就绪…');
    for (let attempt = 0; attempt < 20; attempt++) {
      if (shutdown.signal.aborted) throw Error('启动已取消');
      try { await checkDatabase(); return; } catch (err) {
        if (err.code !== '57P03' && err.code !== 'ECONNREFUSED') throw err;
      }
      await delay(1500);
    }
    throw Error('数据库尚未就绪，请查看 PostgreSQL server.log 后重试');
  }
}

function openBrowser() {
  if (process.platform !== 'win32' || process.env.NUXT_DEV_OPEN_BROWSER === 'false') return;
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', startUrl], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.log('请手动打开：' + startUrl));
  browser.unref();
}

function clearState(pid) {
  const file = path.join(localState, 'dev-process.json');
  try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === pid) fs.unlinkSync(file); }
  catch (error) { if (error.code !== 'ENOENT') console.warn('进程状态清理失败，下次启动会重新检查。'); }
}

function stop() {
  if (stopping) return;
  stopping = true;
  shutdown.abort();
  if (child?.pid && child.exitCode === null) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.on('error', () => child.kill());
    } else child.kill('SIGTERM');
  }
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  if (!['dev', 'db:check', 'db:start'].includes(mode)) throw Error('Usage: local-dev.mjs [dev|db:check|db:start]');
  databaseUrl = new URL(process.env.DATABASE_URL);
  stage = '数据库';
  console.log('[1/3] 检查 PostgreSQL 连接…');
  if (mode === 'db:check') await checkDatabase(); else await ensureDatabase();
  console.log(`[1/3] 数据库就绪：${databaseUrl.hostname}:${databaseUrl.port || 5432}${databaseUrl.pathname}`);
  if (mode === 'dev') {
    stage = 'Nuxt';
    if (await portOpen(3000)) {
      if (await probeReady(base, fetch, shutdown.signal, startPath)) {
        console.log('已有服务就绪，无需重复启动：' + startUrl); openBrowser();
      } else throw Error('3000 端口已占用，但网页尚未就绪。请查看已有启动终端；不要重复启动。');
    } else {
      fs.mkdirSync(localState, { recursive: true });
      const logs = path.join(localHome, 'logs');fs.mkdirSync(logs, { recursive: true });
      const logPath = path.join(logs, `dev-${new Date().toISOString().replaceAll(':', '-')}.log`);
      log = fs.createWriteStream(logPath, { flags: 'a' });
      log.on('error', error => console.error('启动日志写入失败：' + error.message));
      console.log('[2/3] 正在编译，首次可能需要数分钟。请等待“网页已就绪”，期间不要重复启动。');
      console.log('启动日志：' + logPath);
      const entry = path.join(root, 'node_modules/nuxt/bin/nuxt.mjs');
      child = spawn(process.execPath, [entry, 'dev', '--host', '127.0.0.1', '--port', '3000'], { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], windowsHide: true });
      child.stdout.on('data', chunk => { process.stdout.write(chunk); log.write(chunk); });
      child.stderr.on('data', chunk => { process.stderr.write(chunk); log.write(chunk); });
      child.once('exit', code => { shutdown.abort(); clearState(child.pid); log.end(); process.exitCode = stopping ? 0 : code ?? 1; });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      fs.writeFileSync(path.join(localState, 'dev-process.json'), JSON.stringify({ pid: child.pid, entry, logPath }));
      let lastProgress = -15;
      const ready = await waitForReady(base, { signal: shutdown.signal, startPath, onProgress(seconds) {
        if (seconds - lastProgress >= 15) { console.log(`[2/3] 已等待 ${seconds} 秒，正在编译或初始化页面…`);lastProgress = seconds; }
      } });
      if (ready && !shutdown.signal.aborted) {
        console.log('[3/3] 网页已就绪：' + startUrl);
        console.log('保持此终端运行；Ctrl+C 停止应用，PostgreSQL 单独管理。');openBrowser();
      } else if (!shutdown.signal.aborted) console.error('等待网页就绪超时，进程仍在运行。请查看以上启动日志，不要重复启动。');
    }
  }
} catch (error) {
  console.error(`[${stage}] ${error.message}`);
  if (stage === '数据库') console.error('请检查数据库状态和 .env 中的 DATABASE_URL。');
  if (child) stop(); else log?.end();
  process.exitCode = 1;
}
