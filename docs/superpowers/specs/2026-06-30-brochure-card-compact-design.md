# 资料库文件卡片紧凑化 + 操作收进 ⋮ 菜单

日期:2026-06-30
范围:`apps/web/src/pages/brochure/BrochurePage.tsx` 的 `BrochureCard` 组件(仅此一个)。无后端、无 DB、无新 i18n key。

## 现状

卡片自上而下:图标+标题 / 分类+行业标签 / 分隔线 / V版本+文件名(Anchor 点击预览)+时间 / 备注 / 分隔线 / 一排按钮(预览·下载·上传新版本·编辑·删除·版本(N)折叠) / 版本历史 Collapse。

## 目标

操作按钮默认不显示,收进卡片右上角 `⋮` 菜单;头部合并,主要显示标题+版本,点标题预览。

## 设计(紧凑保留详情)

```
┌───────────────────────────┐
│ 📄 EP的FAQ   [V1]        ⋮ │  ← 标题=Anchor,点击→预览
│ [FAQ] [EP]                 │
│ JUYI_自雇EP_FAQ.pdf        │  ← dimmed 小字 truncate
│ 30/06/2026 · 备注:EPfaq    │
└───────────────────────────┘
```

1. **头部行**:`Group justify="space-between"`,左 = FileTypeIcon + 标题 Anchor(`onClick={()=>onPreview(currentVersion)}`,无 currentVersion 则纯文本不可点)+ `V{version_no}` badge;右 = `Menu` + `ActionIcon variant="subtle"`(`⋮` IconDots)。
2. **标签行**:分类 + 行业 badge,保留。
3. **详情**:文件名 dimmed 小字 truncate 一行;`时间 · 备注:xxx` 一行(无备注则只时间;Text 整体 dimmed)。
4. **删掉**原底部按钮排 + 中间两条 Divider(头部到详情之间可保留一条细 Divider 或去掉,视觉从简)。
5. **⋮ 菜单项**(无对应 currentVersion / 无权限的项不渲染):
   - 预览 `onPreview`(有 currentVersion)
   - 下载 `component="a" href=url target=_blank`(currentVersion.url 存在)
   - 上传新版本 `onUpload`(canManage)
   - 编辑 `onEdit`(canManage)
   - 删除 `onDelete` 红色(canManage)
   - 版本历史(N) `onToggle` —— 切换下方现有 Collapse(N = versionCount)
6. **Collapse 版本历史**:位置、内部 `VersionHistory` 不变,入口从按钮挪到菜单项。

## 复用 / 不动

- i18n 复用:`common.preview` / `common.edit` / `common.delete` / `brochure.download` / `brochure.uploadVersion` / `brochure.history`。
- `onToggle/onPreview/onUpload/onEdit/onDelete/deleting/expanded/canManage` props 签名不变,父组件 `BrochurePage` 无需改。
- 预览 Modal、VersionHistory、后端、DB 全不动。

## 验证

web build + tsc 通过;dev-bh 冒烟:卡片头部紧凑、⋮ 展开六项、点标题预览、版本历史展开正常、无权限账号看不到管理项。
