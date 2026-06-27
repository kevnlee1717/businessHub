# 收款名目目录 + 步骤关联收款 设计

> 业主需求(2026-06-27,看 EP/ICA 模板步骤编辑器截图后提出):
> - 工作流的「步骤」能关联收款,在步骤里选/加收款。
> - 「收款方式」要有个管理入口 —— 业主明确指 **收款名目目录**(定金/首付/尾款/月费/抽成…),不是支付渠道。
> - 步骤与「收款版本」解耦:**步骤绑收款名目(与版本无关),金额由每单实际用的版本供给**(业主选定)。
>
> 原则:文员录入越简单越好(步骤里勾个名目即可),输出越专业越好(自动进收款计划→流水→对账→报表)。

---

## 0. 现状(已核实,不重复造)

- **每个业务的收费 + 多版本管理:已做**(模块①)。入口:导航「业务方案」→「业务列表」→ 业务详情 → 方案版本(规则行 收入/成本/分成 + 多版本 在用/关闭/默认 + 利润率)。
- **首付/尾款里程碑:已做**(模块⑧,`scheme_milestones`:label 自由文本、basis percent/fixed、value、`bind_step_order`)。
- **成交收款计划:已做**(模块⑧,`billing_charges` 绑 `case_step_id`,collect 一键收款进流水)。
- **模板步骤:已做**(`template_steps`:`required_documents` jsonb + `default_assignee_role`;截图编辑的就是它)。
- **缺**:① 收款名目没有可管理目录(里程碑名字是自由文本);② 步骤编辑器里没有「关联收款」;③ 步骤↔收款的接法没定(本 spec 定为"按名目、版本无关")。

**关键洞察**:因为步骤绑"名目"而非"某版本某笔",**工作流子系统与业务方案子系统不需要直接外键**——`collection_item` 就是两者的接头键。

---

## 1. 数据模型(migration `0018`)

### 1.1 `collection_items`(收款名目目录,可管理)
```
collection_items {
  id uuid PK
  code text UNIQUE           # deposit/down_payment/progress/final/monthly_fee/service_fee/commission_share/...
  name text NOT NULL         # 定金/首付/中期款/尾款/月费/服务费/抽成
  name_en text
  default_recurrence scheme_line_recurrence   # one_time/monthly/per_event(可空,默认提示用)
  active boolean default true
  is_system boolean default false
  sort_order integer default 0
  created_at timestamptz default now()
}
```
种子(is_system):定金 deposit、首付 down_payment、中期款 progress、尾款 final、月费 monthly_fee、服务费 service_fee、抽成 commission_share。

### 1.2 `scheme_milestones` 升级(里程碑引用名目)
```
ALTER scheme_milestones ADD collection_item_id uuid → collection_items (可空 set null);
```
- 里程碑 = **收款名目(collection_item)+ 金额规则(basis percent/fixed + value)**;`label` 保留(从名目名带出,可覆盖)。
- `bind_step_order` **保留但降级**:不再是步骤绑定的主路径(主路径走名目匹配,见 §2);为没用名目的旧数据/特殊场景兜底。

### 1.3 `template_steps` + `case_steps` 加「关联收款」
```
ALTER template_steps ADD collections jsonb NOT NULL default '[]'
   # [{collection_item_id: uuid, required?: bool}]
ALTER case_steps ADD collections jsonb NOT NULL default '[]'   # 建案时从模板快照(与 required_documents 同款)
```
> 与 `required_documents` 完全同款的 jsonb 模式,前端复用「所需文件」那套交互。

---

## 2. 接法(建单生成收款计划时的步骤绑定,改 charge 生成逻辑)

现有(模块⑧):milestone → `bind_step_order` → case_step.step_order。
**新主路径**:milestone → `collection_item_id` → 找该案件中 `collections` 含此 collection_item 的 case_step → `charge.case_step_id`。
- 一个 case_step 的 collections 可含多个名目;一个名目在一案件中应至多对应一个 step(应用层取第一个匹配)。
- milestone 无 collection_item → 回退 `bind_step_order`(兼容)。
- 名目在 milestone 有、但案件无步骤绑它 → charge 生成但 `case_step_id` 空(进通用应收台账,不挂步骤)。优雅降级。
- 步骤绑了名目、但该单版本无对应里程碑 → 该步无 charge。优雅降级。

> 非案件业务(按摩椅/床垫/加盟无 case)→ 无 case_steps,charge 不绑步骤(现状),其里程碑仍按周期/日期收。不受影响。

---

## 3. API

- `routes/collectionItems.ts`(注册 index;写 `finance.manage` 读 `finance.view`):`GET/POST/PATCH /collection-items`(is_system 禁改 code/删)。
- 改 `schemes`/milestones 写入(模块①③⑧ 的 schemeVersions 路由 + shared `schemeLineSchema`/milestone schema):milestone create/update 接受 `collection_item_id`;`label` 可空时由名目名带出(服务端补)。
- 改 `routes/workflowTemplates.ts`(模板步骤 CRUD):`template_steps` 读写带 `collections`;建案(cases 创建处)把模板步骤 `collections` 快照进 `case_steps.collections`。
- 改 charge 生成(`billing.ts` + `@bh/shared generateCharges` / api 绑定逻辑):按 §2 名目匹配绑 case_step。`generateCharges` 输出 charge 时带 `collectionItemId`,API 落库时据此查 case_step。
- shared:`schemas` 补 collectionItem schema + 给 milestone/templateStep schema 加字段;`generateCharges` 的 milestone 输入加 `collectionItemId` 透传。

---

## 4. 前端

- **设置 →「收款名目」管理页**(`apps/web/src/pages/settings/` 下新增,挂设置导航):collection_items 列表 + 增删改(名/英文名/默认周期/启用;系统项禁改 code)。**这就是"收款方式管理"入口。**
- **业务方案版本编辑器**(`BusinessDetailPage` 里程碑子区,模块⑧已建):里程碑的「名称」输入 → 换成**收款名目下拉**(collection_items)+ 金额(basis+value)。label 自动带名目名(可改)。`bind_step_order` 字段从 UI 隐藏(降级;后台保留)。
- **工作流模板步骤编辑器**(截图那个,`workflowTemplates`/模板页的步骤编辑 Modal):「所需文件」下加一块**「关联收款」**——同款交互:每行选**收款名目下拉** + [必收?] + [删];「新增收款」内联加行。保存写 `template_steps.collections`。
- **案件详情**(`CaseDetailPage`,模块⑧已接收款计划面板):步骤旁的「待收/已收」已有;现在这些 charge 通过名目自动绑到对应步骤,无需再手填 bind_step_order。
- i18n 中英(收款名目/关联收款/各名目名)。

---

## 5. 迁移/seed

- migration 0018:`collection_items` 表 + `scheme_milestones.collection_item_id` + `template_steps.collections` + `case_steps.collections`。
- seed:7 个系统 collection_items;把现有 EP 默认版本的「首付/尾款」里程碑回填 `collection_item_id`(首付→down_payment、尾款→final);给 EP 工作流模板的对应步骤(原 bind_step_order 1/8 指向的 step_order)写 `collections`(step_order 1→[首付]、最后一步→[尾款]),让名目匹配通。

---

## 6. 验收

- `pnpm -r typecheck`、web build、引擎单测全绿;migration 0018 本地 migrate。
- 端到端:设置加一个名目「服务费」→ EP v1 里程碑首付选名目「首付」→ EP 模板「签约」步关联名目「首付」→ 建 EP 案件+成交(v1)→ 首付 charge 自动绑到「签约」case_step(GET /cases/:id/charges 该 charge 的 case_step_id = 签约步)→ 在该步 collect 进流水。换 v2(首付50%)再建一单 → 同样绑「签约」、金额变 50%。
- 名目目录 CRUD、系统项保护正常。

## 7. 不在本 spec

- 支付渠道(现金/PayNow/转账)——业主本轮选了"名目",渠道暂不做(将来可作 collect 时一个下拉)。
- 一个案件同名目多步/一步多单的复杂情形(取第一个匹配,够用)。
- 工作流模板与业务的显式外键(本设计用名目接头,不需要)。
