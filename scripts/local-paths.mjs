import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
// Separate each checkout's logs and PID state; no runtime data is checked in.
const projectId = createHash('sha256').update(projectRoot).digest('hex').slice(0, 12);
export const localHome = path.resolve(process.env.NUXT_ADMIN_LOCAL_HOME || path.join(os.homedir(), '.nuxt-admin', projectId));
export const localState = path.join(localHome, 'state');
export const demoData = path.join(localHome, 'datasets');
