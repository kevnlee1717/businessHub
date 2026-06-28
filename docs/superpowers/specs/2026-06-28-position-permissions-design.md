# 岗位即权限单元:合并 role 与 position(设计)

日期:2026-06-28
状态:已确认设计,待实现(实现等并发的招聘会话清场后做迁移与合并)

## 背景与目标

系统当前有两个重叠概念:
- **role(角色)**:权限引擎。固定枚举(owner/admin/accountant/clerk/sales/teacher/principal/photographer),权限写死在 `packages/shared/src/permissions.ts` 的 `ROLE_PERMISSIONS`,不可在界面编辑。JWT、`loadAuthContext`、各处权限校验、seed、owner 特判都 key 在 role 上。
- **position(岗位)**:HR 头衔表(`positions`:id/name/name_en/note)。只是标签,不带权限。被薪资模板(`compensation` 模板按 `position_id`)引用。

**目标(用户决策:一步到位彻底合并)**:让**岗位**成为**唯一**的、可在界面编辑的权限单元;退休写死的 role 枚举。

## 决策汇总

1. 岗位当唯一权限模板(合并角色)。
2. 每个岗位可编辑:**功能权限**(取自现有 `permissionCatalog`)+ **数据范围**(all/company/self)。
3. **超管(owner)**:内置固定岗位,恒等全权限,不可编辑/删除(防锁死)。
4. **保留单人调权**:岗位打底 + 员工级 `employeePermissionOverrides`(加/减)。

## 数据模型

`positions` 表新增列:
- `permissions text[] not null default '{}'` —— 功能权限码列表(catalog 的 permission key)
- `data_scope`(复用 `dataScopeEnum`:all/company/self)`not null default 'self'`
- `is_system boolean not null default false` —— 内置超管岗,不可编辑/删除
- `sort_order integer not null default 0`

`employees` 表:
- `position_id` 成为权限来源,**必填**(超管挂内置超管岗)。
- `role` 列:**退休**。过渡期保留为 nullable 兼容旧代码引用点,最终删除(分两步:本次停止用它判权,后续迁移删列)。
- `data_scope` 列:员工有效数据范围 = 岗位.data_scope(单人 override 仍可覆盖);保留列以兼容,但来源改为岗位。

`employeePermissionOverrides`:**不变**。

`permissionCatalog`(permissions.ts):继续作为"可勾选权限清单"的唯一来源,岗位编辑 UI 据此渲染分组勾选。

## 权限解析(后端)

- `getEffectivePermissions`:从 `ROLE_PERMISSIONS[role] + overrides` 改为 **`position.permissions + overrides(grant) − overrides(revoke)`**。
- **超管岗**(`is_system=true`):恒等 `allPermissions`,忽略其 permissions 列(或直接特判)。
- `loadAuthContext`:每请求按 `employee.position_id` 读岗位 permissions + data_scope + 该员工 overrides,实时解析。**改岗位即时生效,无需重登**。
- JWT:不再依赖 role 判权(仍可带 id/email)。
- `ROLE_PERMISSIONS` 硬编码退休 → 变成 seed/迁移时写入各岗位初始权限。
- owner 特判(如 `canAssignOwner`)→ 改为按 `is_system` 岗位判断。

## UI(React + Mantine,照 element-admin)

- **岗位页(PositionsPage)**:`编辑`/`新增` 弹窗加入"功能权限"(按 `permissionCatalog` 分组勾选)+ "数据范围"下拉。超管岗整行只读、置灰。
- **用户授权页(PermissionsPage)**:把"选 role + dataScope + overrides"改为"选**岗位** + 单人加减权限";数据范围继承岗位(可被 override)。移除 role 下拉与 `roleLabels`。
- 全站 role 相关 UI(role 标签等)移除或改岗位。

## 现有数据迁移(dev 库先;发布时 prod 库)

1. 建内置「超管」岗位(`is_system=true`, all),把 owner(admin@bh.local)挂上。
2. 现有岗位按其对应角色的 `ROLE_PERMISSIONS` 回填 `permissions` + `data_scope`:
   - 文员 → clerk 权限 / self
   - 会计 → accountant 权限 / company
   - 主管 → admin 权限 / all
   - 摄影 → photographer 权限 / self
   - 主播 → 自定(参照 sales/photographer)/ self
3. 每个员工按现 role→岗位 映射设 `position_id`(dev 上角色已理顺,基本对齐)。

## 落地约束 / 顺序

- **并发**:`businessHub-dev` 另一个会话正活跃做招聘模块(频繁生成迁移、改 locales/schema)。本重构的**迁移生成 + 应用 dev 库 + 合并回 master** 必须等其清场后做,避免迁移撞号、`_journal.json` 与 `locales/*.json` 合并冲突。
- 在独立 worktree `feat/position-permissions` 写全部代码,充分 typecheck + 后端 curl 测权限矩阵(各岗位能/不能访问对应模块),先 dev 验证,再发 prod(prod 库单独跑迁移 + 数据回填)。
- 代码用 codex 写。

## 验收

- 岗位页可勾选权限 + 选数据范围,保存即生效;超管岗不可改。
- 用户授权页按岗位分配 + 单人加减。
- 后端权限校验完全走岗位(role 不再参与判权);超管不可被锁死。
- 既有员工权限在迁移后与改造前等价(按角色→岗位映射)。
