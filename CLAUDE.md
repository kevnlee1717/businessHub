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
