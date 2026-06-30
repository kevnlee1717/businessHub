# ICA 担保人管理 — 设计文档

- 日期:2026-06-30
- 模块:移民业务 → ICA 申诉(`apps/web` IcaSection)
- 环境铁律:全程在 `~/project/businessHub-dev`(库 `businesshub_dev`),验证 OK 后再按 `docs/runbooks/deploy-pitfalls.md` 发布 prod

## 1. 背景与目标

用户在 `/business/ica` 提出:需要担保人管理,要把现有数据里的担保人信息提取出来,并统计「每个担保人担保了几个人、成功几个、失败几个」。

经盘点 dev 库与代码,**担保人功能的数据层与统计已基本存在**,真正的缺口是:
1. 担保人管理入口埋在「流程模板」tab 里,没有独立入口;
2. 历史数据提取不全 —— 87 个 ICA 案件中仅 30 个关联了担保人,57 个为空;现有 13 个担保人里混着未还原的占位代号(`CAT` / `S9408` / `JEFF` / `MSLULU` 等);
3. 统计已在算,但未以独立页面 + 汇总形式呈现。

### 目标
- 担保人管理提升为 ICA 顶部独立 tab。
- 从 `~/ae` 源文档批量提取担保人,补全缺失案件,并把占位代号还原成真名。
- 在担保人页面呈现清晰统计(每人:担保数 / 已批准 / 被拒 / 成功率;以及顶部全局汇总)。

## 2. 现状(代码 + 数据)

### 已存在
- 表 `guarantors`(`packages/db/src/schema/guarantors.ts`):`id, name, nric, gender, age, idCardDocumentId, note`。
- `cases.guarantorId`(FK,`onDelete set null`)+ 内联列 `guarantorName / guarantorRelation / guarantorContact`。
- 后端 `apps/api/src/routes/guarantors.ts`:担保人完整 CRUD + 身份证扫描件上传 + 每人统计。
  - `GET /guarantors`(分页)→ 每行附 `sponsored_count` 与 `stats`。
  - `GET /guarantors/:id` → 附该担保人担保的 `cases` 列表。
- 统计逻辑 `packages/shared/src/guarantorStats.ts` `computeGuarantorStats()`:`total / approved / rejected / successRate / firstAt / lastAt`。
- 前端 `apps/web/src/pages/business/GuarantorsPage.tsx`:表格 + 增删改 + 身份证上传 + 行内成功率徽章。**当前嵌在 `TemplatesPage`(流程模板 tab)下的子标题里**。
- ICA 总览统计 `IcaStatsPanel.tsx` + `packages/shared/src/icaStats.ts`(判定口径来源)。

### 判定口径(沿用,不改)
- 案件结果取 `case_submissions.result`(枚举 `pending|approved|rejected`),取**最新一轮**提交(按 `submittedAt desc, createdAt desc`)。
- `approved` = 成功;`rejected` = 失败/待重提;`pending`/零提交 = 未判定。
- 成功率 = `approved / (approved + rejected)`,无判定时为 `null`。

### 数据现状(dev 库,2026-06-30)
- ICA 案件 87,关联担保人 30,缺失 57。
- `guarantors` 13 行,top:`Tan Kong Hung`(6)、`Kang Ai Lee`(4)、`Tan Bao Xiang`(4);占位代号若干。

## 3. `~/ae` 源文档结构(提取依据)

- 布局:`~/ae/{2025,2026}/<Mon YYYY>/<案件文件夹>/`,案件文件夹名 ≈ 客户名(如 `REJECTED-QI HUIREN`)。
- 案件文件夹内含混合材料:`APPEAL LETTER.*`、**`form14.pdf`/`form14.docx`**、`ICA/` 子目录、`WechatIMG*.jpg`(护照/NRIC 照片)。
- **Form 14 = 担保人声明表**(填担保人姓名/NRIC/签名)→ 逐案提取的主源。
- 顶层 `担保人&签名docx(3).docx`(~1.8MB)= 客户↔担保人**总名册** → 批量提取的优先源。
- 注:实际目录里**没有** `担保人材料` 子文件夹(那只是 `importIcaClients.ts` 的理想槽位映射,真实数据未按此组织)。
- 工具现状:`form14.pdf` 可被 Read 直接读;docx 需先转文本(libreoffice / docx 解析,提取脚本前置步骤)。

## 4. 方案

### 4.1 担保人提升为顶部 tab(UI)
- `IcaSection.tsx` 顶部 tab 改为:**案件 / 客户 / 担保人 / 流程模板 / 统计**。
- 把 `<GuarantorsPage />` 从 `TemplatesPage` 的嵌入中移出,挂到新 `guarantors` tab;`TemplatesPage` 恢复为纯流程模板。
- 页面顶部加一排汇总卡片(照 `docs/design-system/element-admin-reference.md`,复用 `IcaStatsPanel` 卡片版式):**担保人总数 / 总担保人次 / 已批准 / 被拒 / 整体成功率**。
- 点击担保人行 → 抽屉(Drawer)展开:该担保人担保的每个案子 + 各自最新结果徽章(数据来自 `GET /guarantors/:id` 已返回的 `cases`;结果需后端在 case brief 上补 `latestResult`,见 4.4)。

### 4.2 统计(已存在,补呈现)
- 每人统计沿用 `computeGuarantorStats`,不改口径。
- 顶部汇总卡片:总担保人数 = `guarantors` 行数;总担保人次 = Σ 各人 `total`;已批准/被拒 = Σ 各人 `approved`/`rejected`;整体成功率 = Σapproved /(Σapproved+Σrejected)。
  - 后端新增轻量聚合端点 `GET /guarantors/stats`(或在前端按已取列表聚合;优先后端,避免分页只取一页导致汇总失真)。

### 4.3 从 `~/ae` 批量提取担保人(数据,重头)
子agent 驱动提取 + 机械脚本导入,**直接写库**(用户已确认无需逐条人工过目):

1. **总名册优先**:解析 `担保人&签名docx(3).docx`,若为结构化「客户→担保人」名单,批量产出映射。
2. **逐案兜底**:对仍缺担保人的案件,子agent 读其 `form14.pdf`,抽取 **担保人姓名 / NRIC / 与客户关系 / 联系方式**。
3. **代号还原**:对照源文档把现有占位代号(`CAT`/`S9408`/`JEFF`/`MSLULU` 等)还原成真名;沿用 `backfillIcaGuarantors.ts` 的 `经办:CODE` 映射思路扩展。
4. **去重**:有 NRIC 用归一化 NRIC 作 dedup key;无 NRIC 用归一化姓名。命中既有担保人则复用,不新建。
5. **匹配案件**:按案件文件夹名(客户名)归一化 ↔ `clients.name` / `cases` 对应。
6. **写库**:机械导入脚本(仿 `importIcaClients.ts` 风格)
   - `--dry-run` 打印计划(供开发自查,非用户审批门);
   - 实跑:`upsert` 担保人 + 回填 `cases.guarantorId` 及内联 `guarantorName/guarantorRelation/guarantorContact`;
   - `--purge` 可回滚本脚本写入(仅清本脚本新建/改动,不动既有 30 条已确认数据 —— 用来源标记区分)。

### 4.4 缺失数据处理(用户确认)
- 源文档里也提不出担保人的案件:**`guarantorId` 留空**,不强行编造。
- 前端列表/统计中,这类案件计入「未关联担保人」,担保人页不展示伪记录。
- 「待补」呈现:在 ICA 案件列表或担保人页提供一个轻量标识(担保人列显示「待补」徽章),方便员工后续手动补。**最小实现**:案件担保人字段为空即视为待补,不新增 schema 字段。

### 4.5 后端 case brief 结果补充
- `GET /guarantors/:id` 当前返回的 case brief 无 `latestResult`。抽屉要显示每案结果,需在该端点为每个 case 计算并附上最新提交结果(复用 `computeGuarantorStats` 内的取最新提交逻辑或抽取共用函数)。

## 5. 数据模型变更
- **零迁移**:`guarantors` + `cases.guarantor*` 列已够用;关系沿用 `cases.guarantorRelation` 内联列。
- 不把「关系」提为正式列(YAGNI);不新增「待补」状态列(空 = 待补)。

## 6. 边界 / 不做
- 不在 prod 树直接改/测;发布走 runbook。
- 不重做已有 CRUD / 统计判定逻辑,只:搬 tab 位置 + 加顶部汇总 + 加抽屉 + 补数据。
- 提取不编造数据;提不出即留空。
- 不引入新的担保人「关系/状态」schema。

## 7. 验收
- ICA 顶部出现「担保人」独立 tab,页面含顶部汇总卡片 + 担保人表 + 点击抽屉(列出担保案件及结果)。
- 批量提取后,`cases` 关联担保人数显著上升(目标:能提取到的全部回填),占位代号被还原;提不出的案件担保人为空且标「待补」。
- 每个担保人显示:担保数 / 已批准 / 被拒 / 成功率 / 担保时间段,口径与 ICA 总览一致。
- dev 冒烟通过后再发 prod。

## 8. 实施阶段(交 writing-plans 细化)
1. **UI**:IcaSection tab 重组 + GuarantorsPage 顶部汇总卡片 + 点击抽屉 + 后端 `latestResult`/聚合端点。
2. **提取**:总名册/`form14.pdf` 子agent 提取 → 映射 JSON → 机械导入脚本(dry-run + 实跑 + purge)。
3. **联调 + dev 冒烟** → 发布 prod(runbook)。
