# 提成里程碑(共用收款阶段)设计(2026-06-28)

## 背景
收款已有里程碑(首付/尾款,`scheme_milestones`,拆一次性收入)。业主要求:**每条提成也要按里程碑拆**,且**可多个人提成**。已拍板:**提成共用收款的阶段**,每条提成行只填"在每个阶段拿百分之几"。

## 现状
- `scheme_milestones`(per version):seq / label / collection_item_id / basis(percent|fixed)/ value / bind_step_order / due_offset_days —— 定义阶段 + 拆收入。
- `scheme_lines` kind=commission:一条 = 一个分成角色(party + rate),目前**整笔**,无阶段拆。多角色=多条分成行(已支持)。
- 物化:每条提成行 one_time → 1 笔 entry(整额)。上轮已支持 per-deal 改金额 + 分批结算。

## 设计

### 阶段
沿用 `scheme_milestones`(收款里程碑 tab 定义)。它是这单的阶段来源(seq=1 首付、seq=2 尾款…),带绑步骤/应收日。

### 每条提成行的「里程碑分配」
- `scheme_lines` 加 `milestone_split jsonb` `$type<Record<string, number>>`:**键=里程碑 seq,值=该阶段拿这条提成的百分比**。例:介绍人提成 `{"1":30,"2":70}`(首付30%、尾款70%);业务员 `{"1":0,"2":100}`(尾款才发)。
- **空/未设 → 跟随收款比例**(每阶段按其收入占比分:stage_revenue / total_revenue)。
- 校验:各值之和应 ≈100(前端提示,不强制)。

### 提成 entries 按阶段拆(materialization)
两张表 `external_commission_entries`、`commission_entries` 各加 `milestone_seq int`(nullable,这笔属于哪个阶段)。

物化(one_time 提成行):
- commissionTotal = rate% × 实际一次性收入(同现有)。
- 取该 version 的 `scheme_milestones`(按 seq 排序)= 阶段集。
  - 每阶段 alloc% = `milestone_split[seq]` ?? 该阶段收入占比;**末阶段吃余额**(避免四舍五入漂移)。
  - amount = round(commissionTotal × alloc%/100),末阶段=commissionTotal−已分。
  - 生成 entry:milestone_seq=seq、label=`<行label> · <阶段label>`、period、(外部)payee=external_payees[line]。
- **无阶段(version 没收款里程碑)→ 退回 1 笔整额**(向后兼容)。
- monthly 提成行:不拆阶段(按期),milestone_seq=null,逻辑不变。

外部 vs 业务员:同样按阶段拆。
- 外部:每阶段 entry 独立走分批结算(上轮能力)+ 进对账单(按阶段显示 首付提成/尾款提成)。
- 业务员:每阶段 entry 仍按 period 汇进工资条(同 period 求和=全额,拆只是可见性 + 可分阶段改金额);amount_override 仍生效。

### 保留逻辑(沿用上轮)
- 外部物化保留 已结算/部分结算 行(只删 pending 且 amount_settled=0,跳过已保留 source_line);**按阶段拆后,保留键改为 (source_line_id, milestone_seq)**,避免拆阶段后误删/重复。
- 业务员物化保留 amount_override:键改为 (source_line_id, period, milestone_seq, seq)。

## 前端
- **规则行**:每条「分成」行加「里程碑分配」入口(按钮/展开)——列出当前收款里程碑各阶段 + 每阶段一个 % 输入,存进 `milestone_split`。下方提示合计%。无收款里程碑时提示"先去收款里程碑加阶段"。
- **外部提成台账 / 对账单**:entry 现按阶段成行,label 已含阶段名(首付提成/尾款提成),分列 应付/已结/未结照旧。
- **销售提成**:按阶段成行,可改金额照旧。

## 数据层(migration 0022)
- `scheme_lines` 加 `milestone_split jsonb`。
- `external_commission_entries` 加 `milestone_seq int`。
- `commission_entries` 加 `milestone_seq int`。

## 验收
- `pnpm -r typecheck` 4 包 + 单测绿。
- 端到端:EP 收款里程碑 首付30/尾款70;介绍人提成行 milestone_split 首付30/尾款70;成交1万挂张三 → 物化出 介绍人-首付300、介绍人-尾款700 两笔 → 各自分批结算 → 对账单按阶段显示;重算保留已结算阶段行;业务员提成同样拆两阶段、工资条求和仍=1000。

## 非目标
- 提成阶段独立于收款阶段(已选共用);
- 一阶段内多人同角色(多人用多条分成行各自挂人解决)。
