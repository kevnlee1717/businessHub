# businessHub 部署踩坑(deploy pitfalls)

## 🟥 改前端后只 build 不重启 → 线上黑屏(stale index.html)

**症状**:`pnpm --filter @bh/web build` 后,刷新 `bh.youjia.sg` 整页黑屏/白屏,控制台报 JS 加载失败(请求一个不存在的 `assets/index-<旧hash>.js`,返回的是 HTML)。

**真因**:
- 生产是单进程 systemd `bh-prod`(`tsx src/server.ts`),用 `@fastify/static` serve `apps/web/dist`。
- `apps/api/src/app.ts` 在**启动时** `const indexHtml = readFileSync(webIndex)` 把 `index.html` **读进内存缓存**,SPA 兜底(setNotFoundHandler)一直发这份缓存。
- vite build 会生成**新 hash 文件名**并**删掉旧 hash 文件**(emptyOutDir)。
- 于是:老进程内存里的旧 index.html 仍让浏览器去要旧 hash 的 JS,但那个文件已被删 → 404 → 兜底返回 HTML → JS 执行失败 → 黑屏。

**修法 / 铁律**:**改前端 build 完必须重启**,两步绑死:
```bash
cd ~/project/businessHub
pnpm --filter @bh/web build
XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart bh-prod
```
重启后验证(可选):
```bash
JS=$(grep -o 'index-[A-Za-z0-9_-]*\.js' apps/web/dist/index.html | head -1)
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3011/assets/$JS"   # 期望 200
```

**API 改源码同理**:`start` 跑 `tsx src/server.ts`(非 dist),重启即生效,无需单独 build。

**注意**:`db:migrate` 跑的是本地 cc docker postgres(`businesshub-db-1`),按当前部署该库即生产共用库 —— migration 一旦在本地跑了,生产也就生效了。新 migration 记得连同 `migrations/meta/` 一起 commit,别只 commit `.sql`。
