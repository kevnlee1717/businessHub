# businessHub 项目规则(Claude 必读)

## 🎨 页面/UI 一律照 vue-element-admin 设计语言

**所有页面的布局、版式、组件用法,统一遵循 vue-element-admin 的设计语言。**
做页面 / 改造页面前,**先读 `docs/design-system/element-admin-reference.md`**:
- §3 选标准页面骨架(列表/CRUD、表单、详情、分页)
- §4 组件映射表:需要的组件 → 对应的 Mantine 实现
- 拿不准原版怎么写 → grep `docs/design-system/element-admin-ref-src/`(MIT 源码快照)

技术栈是 **React 18 + Mantine 7**(不是 Vue):抄的是它的**视觉与版式语言**,用 Mantine 落地,不直接搬 `.vue` 代码。
新增可复用模式时回写进该参考文档,让它持续生长。

## 🔒 prod / dev 双环境铁律

日常开发**只动 `~/project/businessHub-dev`**(改它、build、`restart bh-dev`、在 `dev-bh.youjia.sg` 验证)。
**绝不在 `~/project/businessHub`(prod 树,员工真在用)上直接改/测。** 确认 dev OK 后再按 `docs/runbooks/deploy-pitfalls.md` 的流程发布到 prod。

## 🚀 当用户说"更新到 prod"时的铁律(默认部署语义)

用户说"更新到 prod / 发布到 prod / 推 prod"时,**一律按这套来,不必再问**:

1. **只推代码 + 附件**:`git pull` 拉 dev 已 push 的代码、`rsync -a` 附加 uploads(附加不删)。
2. **数据库只同步"结构"(schema),绝不同步"数据内容"**:
   - 只做 DDL / migration —— 让 prod 库的表结构、字段、枚举、索引对齐新代码。
   - **绝不把 dev 的行数据(业务数据、员工、案件、课程内容……)灌进 prod。** prod 的数据是员工真在用的活数据,只增不覆盖。
3. **发布前检查 prod 现有数据是否需要"就地整理"以适配新代码**:
   - 新代码若改了字段含义 / 加了 NOT NULL / 改了枚举取值 / 拆分或重命名列,**prod 里的存量行**可能不满足新约束 → 会让页面或接口崩。
   - 这类要写**数据迁移(在 prod 库就地 UPDATE / 回填 / 转换存量行)**,而不是从 dev 拷数据。发布前先想清楚"老数据在新代码下会不会炸",需要回填的先回填。
4. **绝不把 dev 的数据内容推往 prod。** 这是硬红线。(runbook §65 那次"全量含数据 dev→prod"是一次性特殊操作,**不是**"更新到 prod"的默认含义,别照抄。)

> 一句话:**代码/附件全推,库只对结构,存量数据就地适配,dev 数据永不进 prod。**
> 具体命令与坑见 `docs/runbooks/deploy-pitfalls.md`。
