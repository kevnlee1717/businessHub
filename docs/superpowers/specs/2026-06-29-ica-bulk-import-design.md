# ICA 申诉资料批量录入 + 再申请提醒 — 设计文档

日期：2026-06-29
状态：已与用户确认，待写实现计划

## 背景

`~/ae` 文件夹存有公司做过的全部 ICA(新加坡移民局)签证申诉客户资料与申请材料，需录入到 `/business/ica`。

资料现状(经探索确认)：
- 组织方式：`~/ae/{2025,2026}/<Mon YYYY>/<案件文件夹>/`，按 年/月 组织，每客户一个子文件夹
- 规模：约 114 个案件文件夹、去重后约 90+ 不同客户、共约 2120 个文件(已排除 macOS `._*`/`.DS_Store` 噪音)
- 多轮申诉：同一人常有 2nd/3rd/4th Appeal，分散在不同月文件夹
- 状态全靠文件夹名前缀编码：`<状态> - <拼音名> - [Appeal ID ISC26..] - [经办人代号]`，状态前缀大小写/连字符混乱(APPROVED/GRANTED/REJECTED/REJECT/PENDING/-p…)
- 文件类型：pdf 1184、jpg 618、docx 279、png 29 等；命名中英文+拼音+微信导出混用
- **没有任何现成清单/进度表**(无 xlsx/csv/txt)；进度只能从文件夹名读
- `~/ae/Hotel/` 是跨客户的"新加坡酒店证明"汇总(按客户名)，根目录有公用模板(form14/担保人)

系统现状(经探索确认)：ICA 不是独立模块，是通用案件工作流下的 `business_type='ica'`。
- ✅ 已有多次提交历史表 `case_submissions`(每条带 `submitted_at`/`result(pending/approved/rejected)`/`rejected_at`/`note`)
- ✅ 已有文件附件(`documents` + `case_step_documents.document_ids[]`)、担保人(`guarantors`)、父子案件(`cases.parent_case_id`)
- ❌ 没有"再申请提醒/再申请到期日"任何字段或调度
- ⚠️ ICA 工作流模板的"所需文件清单"很可能对不上文件夹里实际材料

## 已确认的关键决策

| 决策点 | 选择 |
|---|---|
| 多轮申诉建模 | **一客户一案件 + 多条 `case_submission`**(每轮一条，倒计时只看最新一条 rejected) |
| 文件录入保真度 | **附件为主 + 文件名正则归类**(不通读文件内容) |
| 拒绝日期来源 | **定点解析 ICA 拒信 PDF 抽精确日期**(仅 rejected 提交) |
| 再申请提醒范围 | **列表徽章 + 「待再申请」筛选**(无主动推送) |
| 经办人代号 | **存成案件 note/tag**，不映射系统员工 |
| 担保人 | **提取为去重实体**(按 NRIC/姓名)，case 关联，做担保人统计(担保数/担保时间/成功率) |
| 担保人成功率口径 | **按客户(case)最终结果**：通过客户/(通过+拒绝客户)，pending 不计 |
| 担保人抽不到 | **留空标"待补"，不阻塞导入**，员工后续人工补 |
| 试跑 | 全部认可，直接全量(非先单月试跑) |

## 设计

### A. 数据建模：一客户一案件 + 多条提交记录
- 每个去重后的客户 → 1 个 `client` + 1 个 `business_type='ica'` 的 `case`
- 该客户每一轮申诉(每个月文件夹) → 1 条 `case_submission`：
  - `submitted_at` = 该月(月文件夹推断，取月初或可得的更精确值)
  - `result` = 文件夹名状态前缀归一化映射(见状态映射表)
  - `rejected_at` = 先留空，由 C 抽取 pass 回填(仅 rejected)
  - `note` = 原始文件夹名 + 经办人代号 + Appeal ID(便于回溯)
- 该轮文件挂到该案件的文件槽，并用 tag/note 标注所属提交轮次
- **零 schema 迁移**：`case_submissions` 字段已齐全，不动库结构(规避 prod 迁移风险)

状态前缀归一化(大小写/连字符/下划线无关，子串匹配)：
- `approved` / `granted` → `approved`
- `reject*` → `rejected`
- `pending` / `-p` / 无前缀 → `pending`

### B. ICA 标准文件槽(模板补齐)
每个案件带上以下标准文件槽；导入脚本按文件名正则归类；**未匹配文件一律进「其他/证据材料」兜底槽，绝不丢文件**。

| 文件槽 | 文件名匹配(忽略大小写) | 必填 |
|---|---|---|
| Form 14 | `form14*` | ✅ |
| 申诉信 Appeal Letter | `appeal letter*` | ✅ |
| 护照 Passport | `passport*` / `pp.*` / `pp\d` | ✅ |
| 身份证 / NRIC | `ic.*` / `id.*` / `身份证*` | ✅ |
| 户口本 | `household*` / `户口*` | ○ |
| 在职证明 | `incumbency*` / `在职证明*` | ○ |
| 新加坡酒店证明 | `*酒店*` / `*hotel*`(含 `~/ae/Hotel/` 按客户名归户) | ○ |
| 担保人材料 | `guarantor*` / `担保人*` / `*name card*` | ICA ✅ |
| ICA 拒信 | `APLOUT_*` / `ISC\d+*` / `*reject*` | 再申诉时 ✅ |
| 其他 / 证据材料(多文件) | `WechatIMG*` / `图片_*` / `Image_*` / `bank*` / `营业执照*` 及一切未匹配 | ○ |

实现细节待计划阶段确认：标准槽是写进可复用的 ICA 工作流模板，还是导入脚本对每个案件直接建 `case_step_documents`。优先复用模板机制。

### C. 内容抽取 pass(定点读内容：拒绝日期 + 担保人身份)
批量导入时 `rejected_at` 与 `guarantor_id` 留空，由本 pass 回填。按月文件夹分批(约 13 批)，每批一个只读子 agent，**只回小段 JSON**(大输出不进主上下文)，对每个案件文件夹抽两类信息：

1. **拒绝日期**(仅 rejected 案件)：打开 ICA 拒信 PDF(`APLOUT_*` / `<AppealID>.pdf`)抽真实拒绝日期
2. **担保人身份**：打开担保人材料(`担保人*` / `guarantor*` / `*name card*` / 在职/签名 docx)抽 `{担保人姓名, NRIC(若有), 与申请人关系, 联系方式(若有)}`

子 agent 返回 `{案件文件夹 → {rejected_at, guarantor:{name,nric,relation,contact}}}`。脚本据此：
- 回填 `case_submission.rejected_at`
- **去重创建 `guarantors`**(优先按 NRIC，无 NRIC 退化按姓名归一化)→ 关联 `cases.guarantor_id` + 写冗余快照 `guarantor_name/relation/contact`
- 抽不到的留空，前端标"待补"

注：根目录 `担保人&签名docx(3).docx`(1.8MB)疑似多担保人汇总签名件，作为交叉校验来源单独让一个子 agent 解析其担保人名单。

### D. 再申请提醒(唯一新代码功能，纯前端 + 查询，零迁移)
- 派生计算：`可再申请日 = 最新一条 result='rejected' 提交的 rejected_at + 3 个日历月`
- 仅当客户最新提交结果为 rejected 时显示倒计时；approved → "已通过"；pending → "等待结果"
- 列表/详情徽章：
  - 未到期 → 琥珀"还差 N 天可再申请"
  - 已到期 → 绿"✅ 可再申请"
  - rejected 但 rejected_at 缺失 → 灰"拒绝日期待补"
- 案件列表加「待再申请」筛选 + 按可再申请日排序的汇总视图
- 3 个月为固定常量(定义在 shared)，将来要按案件配置再扩展

### D2. 担保人统计(新代码功能，复用现有 guarantors)
现有 `guarantors` 表 + `cases.guarantor_id` 已能承载，无需迁移。新增**担保人统计视图**(增强现有 GuarantorsPage)：
- 担保人列表，每行汇总：
  - **担保案件数**：`count(cases where guarantor_id=该担保人)`
  - **担保时间**：该担保人名下各案件的担保日期(取该案件首条 submission 的 `submitted_at` 近似)，列表显示最早/最近，详情展开逐案
  - **成功率**：`已通过案件 / (已通过 + 已拒绝案件)`，pending 不计入分母。"已通过"= 案件最新 submission `result='approved'`
- 点担保人 → 展开其担保的所有案件清单(客户名 + 担保日期 + 当前结果)
- 口径以"案件(client)"为单位统计，不是按提交轮次(一个客户多轮申诉算一个担保案件)

### E. 录入执行 & 防上下文爆掉
1. 确定性脚本 `importIcaClients.ts`(仿现有 `importEpClients.ts`)：遍历 `~/ae` → 去重客户(拼音名归一化) → 建 client/case/各轮 submission/标准文件槽 → 拷文件进 `uploads/` + 建 `documents` 行 + 正则归槽。**2120 个文件全靠脚本，零 LLM 上下文**
2. 跑 C 的拒信抽取 pass(少量只读子 agent，主上下文只收小 JSON)
3. 脚本回填 rejected_at
4. 脚本**幂等可重跑**(以 客户名+源文件夹 标识去重，重跑不重复建)
5. 跳过：根目录公用模板文件、空残留文件夹(如 `untitled folder`)、`._*`/`.DS_Store`
6. **全程 dev**：代码改动在 `~/project/businessHub-dev`，脚本写 dev 库 `businesshub_dev`，在 `dev-bh.youjia.sg` 验证；确认 OK 后再按 `docs/runbooks/deploy-pitfalls.md` 发 prod。运行环境(从哪个 git 树跑脚本)按 EP 导入经验确认

## 非目标(YAGNI)
- 不做主动推送提醒(Telegram/邮件/定时任务)
- 不映射经办人代号到系统员工
- 不通读非拒信文件内容做结构化抽取
- 不为再申请到期日加可配置周期(固定 3 月)
- 不动 prod 库结构(零迁移)

## 风险 / 待确认
- 标准文件槽落地方式(模板 vs 脚本直建)——计划阶段定
- `submitted_at` 精度：月文件夹只能到"月"，是否够用(再申请倒计时只依赖 rejected_at，submitted_at 精度影响小)
- 同名不同人去重误判风险(纯拼音名可能撞)——需要人工抽查
- 脚本运行的 git 树/DB 连接(dev 库)需在计划阶段确认
