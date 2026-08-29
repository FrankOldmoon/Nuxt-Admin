import {
  defineNuxtModule,
  createResolver,
  addComponentsDir,
  addImportsDir,
  addServerScanDir,
  addPlugin,
  addLayout,
  resolvePath,
} from "@nuxt/kit";

export default defineNuxtModule({
  meta: { name: "module-blog", configKey: "moduleBlog" },
  setup(_options, nuxt) {
    const enabled = process.env.NUXT_MODULE_BLOG === "true";
    if (!enabled) return;
    const { resolve } = createResolver(import.meta.url);

    addComponentsDir({ path: resolve("./components") });

    addLayout(resolve("./layouts/default.vue"), "default");

    addImportsDir(resolve("./composables"));
    addImportsDir(resolve("./utils"));

    // 注册 pages（合并到主 pages）
    nuxt.hook("pages:extend", (pages) => {
      pages.push({
        name: "blog-list",
        path: "/blogs",
        file: resolve("./pages/blogs.vue"),
      });
    });

    // 注册 server 路由 / utils / middleware / plugins / tasks
    addServerScanDir(resolve("./server"));
    // 注册客户端 plugin：恢复登录态
    addPlugin(resolve("./plugins/index.ts"));
  },
});
