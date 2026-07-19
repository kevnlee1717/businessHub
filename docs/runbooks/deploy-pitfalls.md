# businessHub 部署踩坑(deploy pitfalls)

## 🔒 prod / dev 双环境(2026-06-28 起,员工真用 prod)

**两套完全独立,库/进程/附件永不交叉:**

| | prod(生产,员工真用) | dev(开发) |
|---|---|---|
| 域名 | `bh.youjia.sg` | `dev-bh.youjia.sg` |
| 代码树 | `~/project/businessHub` | `~/project/businessHub-dev` |
| 服务 | **系统级** systemd `bh-prod` :3011(`/etc/systemd/system/`,`sudo systemctl`) | systemd `--user bh-dev` :3012 |
| 数据库 | `businesshub` | `businesshub_dev` |
| 上传 | `~/project/businessHub/uploads` | `~/project/businessHub-dev/uploads` |
| 隧道 | frpc `[bh-prod]` 3011→byte:3099 | frpc `[bh-dev]` 3012→byte:3096 |
| nginx/SSL | byte `sites-enabled/bh` | byte `sites-enabled/dev-bh` |

**铁律:日常开发只动 `~/project/businessHub-dev`(改它、`restart bh-dev`、在 dev-bh 验证)。绝不在 `~/project/businessHub`(prod 树)上直接改/测,会影响真用户。**

**发布到 prod(确认 dev OK 后):**
```bash
cd ~/project/businessHub && git pull            # 拉 dev 已 push 的提交
pnpm --filter @bh/web build                     # 重建前端
sudo systemctl restart bh-prod                  # ⚠️ 系统级服务，不是 --user！
# 若有新 migration:对 prod 库单独 migrate(注意 DATABASE_URL=businesshub)
```
> dev 的 migration 跑在 `businesshub_dev`;发布时 prod 库 `businesshub` 要单独 migrate,别搞混 DATABASE_URL。

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
sudo systemctl restart bh-prod          # ⚠️ 系统级，不是 --user
```
重启后验证(可选):
```bash
JS=$(grep -o 'index-[A-Za-z0-9_-]*\.js' apps/web/dist/index.html | head -1)
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3011/assets/$JS"   # 期望 200
```

**API 改源码同理**:`start` 跑 `tsx src/server.ts`(非 dist),重启即生效,无需单独 build。

**注意**:`db:migrate` 跑的是本地 cc docker postgres(`businesshub-db-1`),按当前部署该库即生产共用库 —— migration 一旦在本地跑了,生产也就生效了。新 migration 记得连同 `migrations/meta/` 一起 commit,别只 commit `.sql`。

## 🟥 3011 端口"孤儿/崩溃循环"真因:曾存在两个同名 bh-prod 服务(2026-07-01 定位)

**症状**:`systemctl --user restart bh-prod` 后,`--user` 实例反复 `EADDRINUSE: 0.0.0.0:3011` 崩溃循环(`NRestarts` 飙到上万),但 `curl 127.0.0.1:3011` 仍 200;`systemctl --user stop` 后端口仍被占,像"杀不死的孤儿"。

**真因**:同时存在**系统级** `/etc/systemd/system/bh-prod.service`(`enabled`,`Restart=always`,真正占着 3011、跑在 `/system.slice`)和**用户级** `~/.config/systemd/user/bh-prod.service`(旧 runbook 让你 `--user restart` 的那个)。两者抢同一个 3011 →谁后起谁 EADDRINUSE。之前误当成"孤儿进程",其实是**另一个 systemd 服务**在跑。

**修法(已于 2026-07-01 处理)**:
- 权威服务 = **系统级** `bh-prod`。发布/重启一律 `sudo systemctl restart bh-prod`(不要再用 `--user`)。
- 用户级那个已 `systemctl --user disable/stop bh-prod` 停用。别再启它。
- 排查端口归属:`ss -ltnp | grep :3011` 拿 pid → `cat /proc/<pid>/cgroup`,`/system.slice/bh-prod.service` 才是对的;若落在 `user@1000` 说明又是用户级在抢。

## 📥 把 dev 数据推到 prod 但**保留 prod 员工登录账号**(2026-07-01 实操,⚠️一次性特殊操作)

> ⚠️ **这不是"更新到 prod"的默认流程。** 默认铁律见 `CLAUDE.md` §「当用户说"更新到 prod"时」:只推代码+附件、库只对结构、存量数据就地适配、**dev 数据永不进 prod**。下面这套"全量含数据 dev→prod"仅在用户明确要求"连数据一起覆盖 prod"时才用。

需求:代码 + 数据 + 附件全量 dev→prod,**唯独 `employees` 表保留 prod 原值**(员工可能已在 prod 改过密码)。

坑:`pg_dump --clean --exclude-table=employees` 会失败——`employees`(被排除但仍存在)依赖枚举类型(`role` 等),`DROP TYPE` 被挡;它对 `companies/positions/work_shifts` 的外键也挡住这些表的 `DROP TABLE`。

可行做法(全程 `psql --single-transaction -v ON_ERROR_STOP=1`,出错整体回滚,prod 不被改坏):
1. 先备份:`pg_dump businesshub | gzip > 备份`(留 `~/bh-prod-backups/`)。
2. 把 prod employees 存进一张**枚举转 text** 的临时表(dev dump 不会碰它,也不挡 `DROP TYPE`):
   `CREATE TABLE employees_prod_bak AS SELECT id, ..., role::text AS role, ... FROM employees;`
3. 全量 `pg_dump businesshub_dev --clean --if-exists`(含 employees)灌进 prod;开头加 `SET search_path TO public;` 供后续语句用(dump 会把 search_path 设空)。
4. `UPDATE employees e SET ...=r..., role=r.role::role, ... FROM employees_prod_bak r WHERE e.id=r.id;` 再 `DROP TABLE employees_prod_bak;`
   - 前提:两库 employees 的 **id 完全一致**(先核对);且 prod 员工引用的 position/company/shift id 在 dev 中都存在(否则外键校验失败)。
5. 附件:`rsync -a dev/uploads/ prod/uploads/`(附加不删,安全)。
6. 因是全量覆盖,prod 库 schema 已等于 dev(含最新 migration 记录),**无需再 db:migrate**。
