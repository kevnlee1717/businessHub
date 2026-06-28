# businessHub 设计系统 · vue-element-admin 参考

> **铁律(给 Claude / 任何做页面的人)**:本项目所有页面的**布局、版式、组件用法**一律照 vue-element-admin 的设计语言来。
> 不确定怎么排版 → 来这份文档找模式;需要某个组件 → 先在这份文档的「组件映射表」里找它的 Mantine 对应,再看 `element-admin-ref-src/` 里的原始实现。
>
> 我们用的是 **React 18 + Mantine 7**(不是 Vue)。所以**抄的是它的视觉与版式语言,不是 `.vue` 代码本身** —— 每个模式都已映射到 Mantine 实现。
>
> 来源:vue-element-admin(MIT),源码快照在同目录 `element-admin-ref-src/`(含 LICENSE)。原仓库 https://github.com/PanJiaChen/vue-element-admin

---

## 1. 设计 token(已落地到 `apps/web/src/theme.css`)

| 用途 | 值 | CSS 变量 |
|---|---|---|
| 内容区底色 | `#f0f2f5` | `--app-bg` |
| 卡片/面板 | `#ffffff` | `--app-surface` |
| 分隔线 | `#ebeef5` | `--app-line` |
| 次要文字 | `#909399` | `--app-muted` |
| 主题色 primary | `#1890ff`(hover `#40a9ff`) | `--mantine-primary-color-filled` |
| 侧栏背景 | `#304156` | `--side-bg` |
| 侧栏子菜单 | `#1f2d3d` | `--side-submenu-bg` |
| 侧栏 Logo 区 | `#2b2f3a` | `--side-logo-bg` |
| 侧栏文字 | `#bfcbd9` | `--side-text` |
| 侧栏 hover | `#263445` | `--side-hover` |
| 侧栏激活文字 | `#409eff` | `--side-active-text` |
| 标签导航激活 | `#42b983`(Vue 绿)+ 白字 + 前置白点 | `.tags-view-item.active` |
| 侧栏宽度 | `210px`(原版);本项目暂用 `248px` | `AppShell navbar.width` |
| 顶栏高度 | `50px`(原版);本项目 `56px` | `AppShell header.height` |
| 顶栏阴影 | `0 1px 4px rgba(0,21,41,.08)` | header styles |

文字默认色 `#303133`(标题)/`#606266`(正文)/`#909399`(次要),分隔线 `#ebeef5`/`#dcdfe6`。

---

## 2. 整体外壳(已实现于 `apps/web/src/layout/AppShell.tsx`)

```
┌──────────────────────────────────────────────┐
│ 顶栏 Navbar 50px 白底+阴影:汉堡 / 面包屑 ··· 右侧用户/语言/退出 │
├────────────┬─────────────────────────────────┤
│            │ 标签导航 TagsView 34px(可关闭的多页标签)        │
│  深色侧栏    ├─────────────────────────────────┤
│  #304156    │                                 │
│  Logo #2b2f3a│   内容区 .app-container(padding 20px)        │
│  菜单 #bfcbd9 │   底色 #f0f2f5                    │
│            │                                 │
└────────────┴─────────────────────────────────┘
```

- 侧栏:深色 `#304156`,菜单项**方角、整条 hover `#263445`**,子菜单更深 `#1f2d3d`,激活项文字变 `#409eff`。
- TagsView:见 `apps/web/src/layout/TagsView.tsx`,首页标签固定不可关。
- 内容区每个页面最外层都包一个 `padding:20px` 的容器(对应 element 的 `.app-container`)。

---

## 3. 标准页面骨架(照着搭,别自创)

### 3.1 列表 / CRUD 页(最常用)—— 对应 `views/complex-table.vue`

**结构顺序固定:筛选区 → 表格 → 分页**

```
.app-container (padding 20px)
├─ filter-container        行内排布:若干筛选输入/下拉 + 「搜索」「新建」「导出」按钮
├─ Table (border, fit, 宽100%)   首列可 ID/选择;操作列固定在最右
└─ pagination-container    右对齐分页(total, sizes, prev, pager, next, jumper)
```

**Mantine 实现约定:**

| element-admin | businessHub(Mantine 7) |
|---|---|
| `<div class="app-container">` | `<Box p="md">`(md=16,接近 20;或 `p={20}`) |
| `.filter-container` 行内筛选 | `<Group gap="sm" mb="md" wrap="wrap">`,每个筛选项固定宽度 |
| 筛选项 `el-input`/`el-select` | `<TextInput w={200}/>` / `<Select w={140} clearable/>` |
| 「搜索」按钮 `type="primary"` | `<Button leftSection={<IconSearch/>}>搜索</Button>`(默认 primary) |
| `el-table border fit` | `<Table withTableBorder withColumnBorders highlightOnHover>` |
| 表头 | `<Table.Thead>`,首列居中、窄列定宽 |
| 行内可点文字(链接态) | `<Anchor>` 或 `className="link-type"`(色 `#337ab7` hover `#1890ff`) |
| 状态用 `el-tag` | `<Badge>`(成功绿/警告黄/危险红/信息灰,见 §4 状态色) |
| 操作列 | 最右列,`<Group gap="xs"><Button size="xs" variant="subtle">编辑</Button>…</Group>` |
| `pagination-container` | `<Group justify="flex-end" mt="lg"><Pagination/></Group>`,见 §3.4 |

**新建/编辑**两种模式,按复杂度选:
- **简单**(字段少)→ **弹窗** `el-dialog` + `el-form`(对应 complex-table 的 `dialogFormVisible`)→ Mantine `<Modal>` + 表单。
- **复杂**(长表单/富文本)→ **独立页** create/edit(对应 `views/example/create.vue`)→ 见 §3.2。

### 3.2 表单页(创建/编辑)—— 对应 `views/example/create.vue`

- 顶部一条 **sticky 操作条** `.sub-navbar`(渐变蓝 `linear-gradient(90deg,#20b6f9,#2178f1)`,右对齐放「发布/保存」「草稿」按钮)→ Mantine 用 sticky 容器 + 右对齐 `<Group justify="flex-end">`,可用 primary 实色条代替渐变。
- 主体用 `el-row`/`el-col` 栅格(24 栏)→ Mantine `<Grid>`(12 栏,span 折半:`el-col :span=8` → `<Grid.Col span={4}>`)。
- 字段 `el-form-item` label 左置、定宽 → `<TextInput label= ...>`,长表单用两列栅格。

### 3.3 详情页 / 看板 / 图表
- 详情:卡片分块 `<Card withBorder>` + `<Group>`/`<SimpleGrid>` 键值对。
- 图表:element 用 ECharts;本项目继续用 ECharts 或现有图表组件,容器同样进 `.app-container`。

### 3.4 分页组件 —— 对应 `components/Pagination/index.vue`
- 默认布局 `total, sizes, prev, pager, next, jumper`,右对齐,`margin-top: 30px`。
- props 语义:`total` / `page` / `limit` / `pageSizes`(默认 `[10,20,30,50]`)。
- Mantine:`<Group justify="flex-end" mt={30}>` 内放 `<Select>`(每页条数)+ `<Pagination>` + 可选跳页输入。封装成项目内 `<TablePagination total page limit onChange/>` 复用。

---

## 4. 组件映射表(element-admin → Mantine)

> 需要某个组件先查这里。左列是 element-admin 的叫法,右列是本项目该用什么。

| element-admin / Element UI | businessHub(Mantine 7) | 备注 |
|---|---|---|
| `el-button type="primary/success/warning/danger"` | `<Button>` / `color="green/yellow/red"` | 默认即 primary `#1890ff` |
| `el-input` / `el-input type="textarea"` | `<TextInput>` / `<Textarea>` | |
| `el-select` + `el-option` | `<Select>` / `<MultiSelect>` | `clearable`→`clearable`,远程搜索→`searchable` |
| `el-date-picker` | `<DatePickerInput>`(@mantine/dates) | |
| `el-table` + `el-table-column` | `<Table>` + 手写 `Thead/Tbody` | `border`→`withColumnBorders`,`stripe`→`striped` |
| `el-pagination` | `<Pagination>` + 每页条数 `<Select>` | 见 §3.4 |
| `el-tag` | `<Badge>` | 状态色见下 |
| `el-dialog` | `<Modal>` | 标题用 `textMap[dialogStatus]` 思路:新建/编辑共用一个 Modal |
| `el-form` + `el-form-item` + `rules` | `react-hook-form` + Mantine 输入(项目已用 `react-hook-form`) | label 左置、定宽 |
| `el-card` | `<Card withBorder>` | |
| `el-row`/`el-col`(24 栏) | `<Grid>`(12 栏,span 折半) | |
| `el-dropdown` | `<Menu>` | |
| `el-checkbox` / `el-radio` / `el-switch` | `<Checkbox>`/`<Radio>`/`<Switch>` | |
| `el-message` / `el-notification` | `notifications.show()`(@mantine/notifications) | |
| `el-message-box.confirm` | `modals.openConfirmModal()` | 删除二次确认统一走这个 |
| `el-tabs` | `<Tabs>` | 案件页「案件/客户/流程模板」即此 |
| `el-breadcrumb` | 顶栏面包屑(自定义,见 AppShell) | |
| `el-upload` / UploadExcel | `<FileButton>`/`<Dropzone>` | |
| svg-icon `icon-class` | `@tabler/icons-react`(Mantine 生态默认) | |
| `.link-type` 可点文字 | `<Anchor>` 或 `.link-type` 类 | 色 `#337ab7` hover `#1890ff` |

**状态色约定(el-tag type → Badge color):**
- 成功/已通过 → `green`;进行中/警告 → `yellow`;失败/危险/拒绝 → `red`;草稿/默认/已删除 → `gray`;信息 → `blue`。

---

## 5. 版式/间距硬约定(照抄,保持全站一致)

1. 页面最外层一律 `padding: 20px`(`.app-container`)。
2. 筛选区与表格之间留 `margin-bottom`(filter-item 之间 `10px`,整块底部 `10px`)。
3. 表格统一 `border + fit + width:100%`;窄列定宽、居中,长内容列 `min-width`。
4. 表格首列常为 ID/选择框;**操作列固定最右**。
5. 分页右对齐,`margin-top: 30px`。
6. 表单 label 左置定宽;长表单两列栅格。
7. 列表里可点的主字段做成「链接态」文字(`.link-type`),点击进详情/编辑。
8. 删除/危险操作一律二次确认弹窗。
9. 顶部操作区按钮顺序:主操作(新建)靠左,导出/批量等次操作其后。

---

## 6. 我(Claude)以后怎么用这份文档

- 接到「做某页面 / 改造某页面」→ **先读本文 §3** 选对应骨架,**再按 §4 映射**逐个组件落到 Mantine。
- 拿不准 element 原版怎么写 → grep `docs/design-system/element-admin-ref-src/`(例:`grep -rn "filter-container" element-admin-ref-src/`)。
- 新增的可复用模式 → 回写进本文(§3 加骨架 / §4 加映射),让文档持续生长。
- token 改动 → 改 `apps/web/src/theme.css` 并同步本文 §1。
