# 招聘岗位:全职/兼职聘用类型 + 双薪资 设计

日期:2026-06-29 ｜ 分支:`feat/job-employment-type` ｜ 迁移:`0034_wild_black_tom`

## 需求
招聘「岗位」表单要区分**全职 / 兼职**:可单选也可两个都选(至少一个);全职用**月薪**、兼职用**时薪**,各有最低/最高。

## 方案(A:复用现有列 + 加兼职列 + 聘用类型数组)
- 复用现有 `salary_min` / `salary_max`(integer) = **全职月薪** min/max(SGD/月);现有岗位数据天然变为全职,零搬迁。
- 新增 `pt_salary_min` / `pt_salary_max`(`numeric(6,2)`) = **兼职时薪** min/max(SGD/时,支持 $12.50)。
- 新增 `employment_types`(`text[]`,默认 `{full_time}`,zod 校验值域 `full_time`/`part_time`、至少一个);风格对齐现有 `nationalities text[]`。
- 双语 `salary_note` 不变,全职兼职共用。

备选 B(独立子表 job_salaries/每类型一行)= 过度设计;C(两布尔列)= 扩展性差。均否决。

## 落地
- **DB**:迁移 0034 三个 `ADD COLUMN`(纯增量、带默认值)。
- **zod**(`packages/shared/.../recruitment.ts`):base schema 加 `pt_salary_min/max`、`employment_types`。
- **API**(`apps/api/.../recruitment.ts`):`serializeJob` 返回三字段(numeric→Number);创建默认 `["full_time"]`、写库 numeric→String;PATCH 条件更新。
- **前端**(`apps/web/.../RecruitmentShared.tsx`):表单加聘用类型 `Checkbox.Group`(全职/兼职),条件渲染全职月薪(复用 salary_min/max,relabel)与兼职时薪(`decimalScale=2 step=0.5`);提交带新字段 + 至少选一校验;列表「薪资」列经 `renderJobSalary` 紧凑展示「全职 X-Y/月」「兼职 X-Y/时」。
- **i18n**:`recruitment.fields` 命名空间加聘用类型/薪资 label/单位文案(中英)。

## 验证
typecheck(shared/db/api/web)+build(shared/web) 全绿。dev 站点建全职+兼职岗位走查表单条件渲染与列表展示。

## 已知风险
并发分支 `feat/teacher-mgmt` 也占了迁移 idx 34;两者合并 master 时需 renumber 其一(见 dev 并发会话记忆)。
