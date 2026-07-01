# 宣传册并入文档 tab + 侧边栏分成菜单调整

日期：2026-07-01
分支：`feat/brochure-tab-and-menu`

## 目标

两个纯前端调整，一起做：

1. **宣传册 → 文档模块的一个 tab**：把独立的 `/brochure` 模块搬进 `/documents` 页面作为一个 tab，删掉侧边栏独立入口。
2. **侧边栏分成菜单调整**：把财务下的「销售提成 / 我的提成 / 外部提成」移到「业务分成人员」组下，并把「业务分成人员」改名「业务分成」。

后端路由、DB 表、权限常量定义全部 0 改动。

## 任务 1：宣传册 tab

- `pages/documents/DocumentsLayout.tsx`：`tabs` 静态数组新增 `brochure` 项（位置在 `categories 分类` 之前）。因需按权限显示，改成组件内用 `useAuth().can("brochure.view")` 过滤该 tab。label key `documents.tabs.brochure`。
- `App.tsx`：`documents` 嵌套路由内新增 `<Route path="brochure" element={<BrochurePage/>} />`；删除顶层独立 `<Route path="brochure">`，改为顶层 `/brochure → /documents/brochure` 的 `Navigate` 重定向（保旧书签）。
- `layout/AppShell.tsx`：删除侧边栏 `{ to: "/brochure", key: "nav.brochure", perm: "brochure.view" }`。
- `layout/routeTitles.ts`：删除独立 `/brochure` 标题项。
- `pages/brochure/BrochurePage.tsx`：外层 `<Box p={20}>` 去掉 padding，与其它 documents tab 内容对齐。
- i18n：`documents.tabs.brochure` = 宣传册 / Brochures。

权限边界：宣传册 tab 用 `brochure.view` 控制，与现状一致；所有角色预设里 `brochure.view` 从不脱离 `document.view` 出现，故删掉独立入口不会锁死任何预设用户。

## 任务 2：分成菜单调整

- `layout/AppShell.tsx`：把 `nav.finance_commission`(/finance/commission)、`nav.finance_my_commission`(/finance/my-commission, perm commission.view_own)、`nav.finance_external_commission`(/finance/external-commission) 三项从 `nav.finance.children` 移入 `nav.business_finance.children`（接在 deal_parties / external_parties 后）。路由地址不变。
- i18n：`nav.business_finance`：中文「业务分成人员」→「业务分成」；英文「Commission Personnel」→「Business Commission」。

权限中性：两个组都是 `finance.view` gate，移动不改变可见性。

## 验证

pnpm build 通过；部署 dev-bh，在 dev-bh.youjia.sg 冒烟：文档页出现宣传册 tab 且功能正常、侧边栏无独立宣传册、三项提成出现在「业务分成」组下、旧 `/brochure` 链接重定向到 `/documents/brochure`。未发 prod、未 push origin，等用户确认。
