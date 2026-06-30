# 右上角头像 + 个人中心 设计

日期:2026-06-30 · 分支:`feat/account-avatar-profile`(基于 master f16392c)

## 目标

1. 右上角把纯文字用户名换成**头像 Avatar**(有图显图、无图显姓名首字母色块)。
2. 头像下拉新增「**个人资料**」入口,可改本人 头像 / 姓名(中·英)/ 邮箱 / 手机号,以及改密码。
3. 默认密码(123456)员工:头像显示**红点角标**提醒改密;并保留现有「首次登录强制改密弹窗」。改密成功后角标 + 弹窗一起消失。

判定「该改密」依据 `employees.must_change_password` 字段(不比对字面 123456)。

## 改动清单

### DB(packages/db)
- `employees` 加列 `avatarPath varchar("avatar_path", 500)`(nullable)。
- `drizzle-kit generate` 生成 migration **0040**。
- 一次性脚本 `packages/db/src/scripts/markDefaultPassword.ts`:`UPDATE employees SET must_change_password = true`(不写进 schema migration,避免 prod 重跑误伤已改密用户;dev 跑一次、发 prod 时再手动跑)。package.json 加 `db:mark-default-pw` 脚本。

### shared(packages/shared/src/schemas/auth.ts)
- 新增 `updateProfileSchema`:
  - `name` string trim min1
  - `name_en` string trim 可空(空串转 null)
  - `email` string trim min1(登录名,沿用 login 的「不强制邮箱格式」口径,仅非空 + 唯一)
  - `phone` string trim 可空
- 导出 `UpdateProfileInput`。

### 后端(apps/api/src/routes/auth.ts)
- `publicEmployee()` 增加 `phone`、`avatar`(= avatarPath 为空则 null,否则 `"/" + avatarPath`)。
- 新增 `PATCH /auth/me`(`preHandler: app.authenticate`):校验 `updateProfileSchema`;email 唯一性校验(排除自己);更新 name/nameEn/email/phone + updatedAt;返回 `{ user: publicEmployee(...) }`。
- 新增 `POST /auth/avatar`(`preHandler: app.authenticate`,multipart):取第一个 file part → `saveUpload(part, { subjectType: "employee_avatar", subjectId: request.user.id, uploadedBy: request.user.id })` → 把 `document.storagePath` 写进 `employees.avatarPath` → 返回 `{ user: publicEmployee(...) }`。仅接受 image/* mime。

### 前端(apps/web)
- `api/client.ts`:`User` 类型加 `phone: string | null`、`avatar: string | null`;新增 `updateProfile(input)`(PATCH /auth/me)、`uploadAvatar(file)`(POST /auth/avatar,FormData)。
- `layout/AppShell.tsx`:`Menu.Target` 用 `<Indicator>`(`disabled={!user?.must_change_password}` color red)包 `<Avatar src={user?.avatar} radius="xl" size={32}>{首字母}</Avatar>`;下拉加 `Menu.Item 个人资料` → `navigate("/account/profile")`,保留「修改密码」「登出」。现有强制弹窗不动。
- 新页面 `pages/account/AccountProfilePage.tsx`:Mantine `Tabs`(照 element-admin 版式)——
  - Tab「个人信息」:头像上传(`FileButton` + 预览 + 红点提示「建议上传头像」)+ name/name_en/email/phone 表单 + 保存按钮;保存/上传成功后 `invalidateQueries(["auth","me"])`。
  - Tab「修改密码」:复用 `<ChangePasswordForm onSuccess=... />`。
- `App.tsx`:`account/password` 旁加 `<Route path="account/profile" element={<AccountProfilePage />} />`。

## 验证
- 在 worktree:`pnpm -r typecheck`(或各包 build)通过、`drizzle-kit generate` 产出 0040、前端 `vite build` 通过。
- 部署到 dev-bh 验证需协调并发会话(dev 主 checkout 当前在 feat/ica-bulk-import),不擅自切主 checkout 分支。

## 非目标(YAGNI)
- 头像裁剪 / 多尺寸缩略图。
- 邮箱改动的二次确认 / 验证邮件。
- HR 端代改头像。
