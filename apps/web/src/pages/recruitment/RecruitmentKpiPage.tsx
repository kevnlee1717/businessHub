import { Alert, Badge, Box, Button, Card, Group, Modal, NumberInput, Progress, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Textarea } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { listCompanies } from "../../api/hr";
import {
  createRecruitmentKpiTarget,
  deleteRecruitmentKpiTarget,
  listMyRecruitmentKpiTargets,
  listRecruitmentAssignableEmployees,
  listRecruitmentKpiTargets,
  recruitmentKeys,
  updateRecruitmentKpiTarget,
  type RecruitmentKpiMetric,
  type RecruitmentKpiTarget
} from "../../api/recruitment";

const metricOptions: { value: RecruitmentKpiMetric; label: string }[] = [
  { value: "daily_posts", label: "发帖" },
  { value: "daily_new_group_owners", label: "新群主" },
  { value: "daily_contacts", label: "联系人" }
];

type KpiPeriod = "daily" | "weekly" | "monthly";

const periodOptions: { value: KpiPeriod; label: string }[] = [
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" }
];

function periodLabel(period: string) {
  return periodOptions.find((item) => item.value === period)?.label ?? period;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function metricLabel(metric: string) {
  return metricOptions.find((item) => item.value === metric)?.label ?? metric;
}

function rateColor(rate?: number | null) {
  if (rate == null) return "gray";
  if (rate >= 1) return "green";
  if (rate >= 0.5) return "yellow";
  return "red";
}

function issuedByLabel(target: RecruitmentKpiTarget) {
  if (target.issued_by_source === "ifm") {
    return target.issued_by_name || target.issued_by_ifm_user || "-";
  }

  return target.issued_by_name || "-";
}

type KpiForm = {
  company_id: string;
  assignee_employee_id: string;
  metric: RecruitmentKpiMetric;
  platform: string;
  period: KpiPeriod;
  target_per_day: number;
  effective_from: string;
  effective_to: string;
  note: string;
  active: boolean;
};

const defaultForm: KpiForm = {
  company_id: "",
  assignee_employee_id: "",
  metric: "daily_posts",
  platform: "",
  period: "daily",
  target_per_day: 1,
  effective_from: today(),
  effective_to: "",
  note: "",
  active: true
};

export function RecruitmentKpiPage() {
  const { can } = useAuth();
  const canManage = can("recruitment.manage");
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ companyId: "", assigneeEmployeeId: "", activeOnly: true });
  const [draftFilters, setDraftFilters] = useState(filters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentKpiTarget | null>(null);
  const [form, setForm] = useState<KpiForm>(defaultForm);

  const companiesQuery = useQuery({ queryKey: ["companies", "recruitment-kpi"], queryFn: () => listCompanies() });
  const employeesQuery = useQuery({ queryKey: ["recruitment", "assignable-employees"], queryFn: listRecruitmentAssignableEmployees });
  const myQuery = useQuery({ queryKey: recruitmentKeys.myKpiTargets({ date: today() }), queryFn: () => listMyRecruitmentKpiTargets({ date: today() }) });
  const listQuery = useQuery({
    queryKey: recruitmentKeys.kpiTargets(filters),
    queryFn: () => listRecruitmentKpiTargets(filters),
    enabled: canManage
  });

  const companyOptions = useMemo(() => (companiesQuery.data?.companies ?? []).map((item) => ({ value: item.id, label: item.name })), [companiesQuery.data]);
  const employeeOptions = useMemo(
    () =>
      (employeesQuery.data?.employees ?? []).map((item) => ({
        value: item.id,
        label: item.is_recruitment_operator ? `${item.name}（招聘操作员）` : item.name
      })),
    [employeesQuery.data]
  );

  useEffect(() => {
    const firstCompanyId = companyOptions[0]?.value;
    const firstEmployeeId = employeeOptions[0]?.value;
    if (!form.company_id && firstCompanyId) setForm((value) => ({ ...value, company_id: firstCompanyId }));
    if (!form.assignee_employee_id && firstEmployeeId) setForm((value) => ({ ...value, assignee_employee_id: firstEmployeeId }));
  }, [companyOptions, employeeOptions, form.assignee_employee_id, form.company_id]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        company_id: form.company_id,
        assignee_employee_id: form.assignee_employee_id,
        metric: form.metric,
        platform: form.metric === "daily_posts" && form.platform.trim() ? form.platform.trim() : null,
        period: form.period,
        target_per_day: form.target_per_day,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        note: form.note.trim() || null,
        active: form.active
      };
      return editing ? updateRecruitmentKpiTarget(editing.id, body) : createRecruitmentKpiTarget(body);
    },
    onSuccess: async () => {
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
    }
  });
  const stopMutation = useMutation({
    mutationFn: deleteRecruitmentKpiTarget,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
    }
  });

  function openCreate() {
    saveMutation.reset();
    setEditing(null);
    setForm({ ...defaultForm, company_id: companyOptions[0]?.value ?? "", assignee_employee_id: employeeOptions[0]?.value ?? "" });
    setModalOpen(true);
  }

  function openEdit(target: RecruitmentKpiTarget) {
    saveMutation.reset();
    setEditing(target);
    setForm({
      company_id: target.company_id,
      assignee_employee_id: target.assignee_employee_id,
      metric: target.metric,
      platform: target.platform ?? "",
      period: target.period ?? "daily",
      target_per_day: target.target_per_day,
      effective_from: target.effective_from,
      effective_to: target.effective_to ?? "",
      note: target.note ?? "",
      active: target.active
    });
    setModalOpen(true);
  }

  return (
    <Box p={20}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {(myQuery.data?.kpi_targets ?? []).map((target) => {
            const percent = Math.min(100, Math.round((target.completion_rate ?? 0) * 100));
            return (
              <Card key={target.id} withBorder>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={700}>{periodLabel(target.period)}{metricLabel(target.metric)}</Text>
                    <Badge color={rateColor(target.completion_rate)}>{target.completion_rate == null ? "-" : `${percent}%`}</Badge>
                  </Group>
                  <Text size="sm" c="dimmed">{target.platform || "全平台"} · {target.company_name || "-"}</Text>
                  <Progress value={percent} color={rateColor(target.completion_rate)} />
                  <Text size="sm">
                    {target.actual ?? 0} / {target.target_per_day}
                    {target.period !== "daily" ? <Text span size="xs" c="dimmed">（本{target.period === "weekly" ? "周" : "月"}剩 {target.period_days_left} 天）</Text> : null}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
        {!myQuery.isLoading && (myQuery.data?.kpi_targets ?? []).length === 0 ? <Text c="dimmed">暂无指标</Text> : null}

        {canManage ? (
          <>
            <Group align="flex-end" gap="sm" wrap="wrap">
              <Select label="公司" w={200} data={companyOptions} value={draftFilters.companyId || null} onChange={(value) => setDraftFilters((old) => ({ ...old, companyId: value ?? "" }))} clearable searchable />
              <Select label="执行人" w={180} data={employeeOptions} value={draftFilters.assigneeEmployeeId || null} onChange={(value) => setDraftFilters((old) => ({ ...old, assigneeEmployeeId: value ?? "" }))} clearable searchable />
              <Switch label="仅生效中" checked={draftFilters.activeOnly} onChange={(event) => setDraftFilters((old) => ({ ...old, activeOnly: event.currentTarget.checked }))} />
              <Button onClick={() => setFilters(draftFilters)}>搜索</Button>
              <Button onClick={openCreate}>下达指标</Button>
            </Group>
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>公司</Table.Th><Table.Th>执行人</Table.Th><Table.Th>指标</Table.Th><Table.Th>平台</Table.Th><Table.Th>目标</Table.Th><Table.Th>本期实绩</Table.Th><Table.Th>达成率</Table.Th><Table.Th>来源</Table.Th><Table.Th>生效区间</Table.Th><Table.Th>操作</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(listQuery.data?.kpi_targets ?? []).map((target) => (
                  <Table.Tr key={target.id}>
                    <Table.Td>{target.company_name || "-"}</Table.Td><Table.Td>{target.assignee_name || "-"}</Table.Td><Table.Td>{metricLabel(target.metric)}</Table.Td><Table.Td>{target.platform || "全平台"}</Table.Td><Table.Td>{target.target_per_day}/{periodLabel(target.period).replace("每", "")}</Table.Td><Table.Td>{target.actual ?? 0}</Table.Td><Table.Td><Badge color={rateColor(target.completion_rate)}>{target.completion_rate == null ? "-" : `${Math.round(target.completion_rate * 100)}%`}</Badge></Table.Td><Table.Td>{target.issued_by_source === "ifm" ? <Badge color="orange" variant="light">外部·{issuedByLabel(target)}</Badge> : issuedByLabel(target)}</Table.Td><Table.Td>{target.effective_from} 至 {target.effective_to || "长期"}</Table.Td><Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => openEdit(target)}>编辑</Button><Button size="xs" color="red" variant="subtle" disabled={!target.active} onClick={() => stopMutation.mutate(target.id)}>停用</Button></Group></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </>
        ) : null}
      </Stack>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑指标" : "下达指标"} size="lg">
        <Stack>
          {saveMutation.isError ? (
            <Alert color="red">{saveMutation.error instanceof Error ? saveMutation.error.message : "保存失败"}</Alert>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="公司" data={companyOptions} value={form.company_id || null} onChange={(value) => setForm((old) => ({ ...old, company_id: value ?? "" }))} searchable required />
            <Select label="执行人" data={employeeOptions} value={form.assignee_employee_id || null} onChange={(value) => setForm((old) => ({ ...old, assignee_employee_id: value ?? "" }))} searchable required />
            <Select label="指标" data={metricOptions} value={form.metric} onChange={(value) => setForm((old) => ({ ...old, metric: (value as RecruitmentKpiMetric) ?? "daily_posts", platform: value === "daily_posts" ? old.platform : "" }))} required />
            {form.metric === "daily_posts" ? <TextInput label="平台" value={form.platform} onChange={(event) => setForm((old) => ({ ...old, platform: event.currentTarget.value }))} placeholder="留空=全平台" /> : null}
            <Select label="周期" data={periodOptions} value={form.period} onChange={(value) => setForm((old) => ({ ...old, period: (value as KpiPeriod) ?? "daily" }))} allowDeselect={false} required />
            <NumberInput label={`${periodLabel(form.period)}目标`} min={1} value={form.target_per_day} onChange={(value) => setForm((old) => ({ ...old, target_per_day: Number(value) || 1 }))} required />
            <TextInput label="生效起始" type="date" value={form.effective_from} onChange={(event) => setForm((old) => ({ ...old, effective_from: event.currentTarget.value }))} required />
            <TextInput label="生效截止" type="date" value={form.effective_to} onChange={(event) => setForm((old) => ({ ...old, effective_to: event.currentTarget.value }))} />
            <Switch label="启用" checked={form.active} onChange={(event) => setForm((old) => ({ ...old, active: event.currentTarget.checked }))} />
          </SimpleGrid>
          <Textarea label="备注" value={form.note} onChange={(event) => setForm((old) => ({ ...old, note: event.currentTarget.value }))} />
          <Group justify="flex-end"><Button variant="default" onClick={() => setModalOpen(false)}>取消</Button><Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate()} disabled={!form.company_id || !form.assignee_employee_id}>保存</Button></Group>
        </Stack>
      </Modal>
    </Box>
  );
}
