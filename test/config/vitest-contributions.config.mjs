import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'));
const viteRequire = createRequire(nuxtRequire.resolve('@nuxt/vite-builder/package.json'));
const { default: vuePlugin } = await import(pathToFileURL(viteRequire.resolve('@vitejs/plugin-vue')).href);
const root = fileURLToPath(new URL('../../', import.meta.url));
const smsTests = ['recordReuse', 'refundAccounting'].map(name => 'modules/sms/test/' + name + '.test.ts').filter(name => existsSync(root + name));
export default {
  plugins: [vuePlugin()],
  resolve: { alias: { '~~': root, '~': root + 'app', vue: nuxtRequire.resolve('vue'), h3: nuxtRequire.resolve('h3') } },
  test: { environment: 'node', globals: true, pool: 'threads', include: [
    'test/unit/composables/crudHooks.test.ts', 'test/unit/composables/useExcelExport.test.ts', 'test/unit/composables/crudReuse.test.ts', 'test/unit/composables/businessTable.test.ts',
    'test/unit/server/devReadiness.test.ts', 'test/unit/server/core/permissions.test.ts',
    'test/unit/server/core/modelGateway.test.ts', 'test/unit/server/core/agent.test.ts', ...smsTests
  ] }
};
