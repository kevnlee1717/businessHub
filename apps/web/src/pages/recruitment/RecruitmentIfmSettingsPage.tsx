import { Badge, Box, Button, Group, Modal, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  bindIfmCompany,
  createCompanyFromIfmCache,
  createIfmUserBinding,
  listIfmCompaniesCache,
  listIfmUserBindings,
  listRecruitmentAssignableEmployees,
  recruitmentKeys,
  updateIfmUserBinding,
  type IfmUserBinding
,
  listIfmBindableCompanies
} from "../../api/recruitment";

type BindingForm = {
  ifm_user_id: string;
  ifm_display_name: string;
  employee_id: string;
  bridge_role: "manager" | "operator";
  active: boolean;
};

const defaultForm: BindingForm = {
  ifm_user_id: "",
  ifm_display_name: "",
  employee_id: "",
  bridge_role: "operator",
  active: true
};

const bridgeRoleOptions: { value: BindingForm["bridge_role"]; label: string }[] = [
  { value: "manager", label: "外部经理（仅 IFM 侧下任务）" },
  { value: "operator", label: "操作员（绑定 bh 员工）" }
];

function bridgeRoleLabel(role: BindingForm["bridge_role"]) {
  return bridgeRoleOptions.find((item) => item.value === role)?.label ?? role;
}

export function RecruitmentIfmSettingsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IfmUserBinding | null>(null);
  const [form, setForm] = useState<BindingForm>(defaultForm);

  const companiesQuery = useQuery({ queryKey: ["companies", "recruitment-ifm"], queryFn: listIfmBindableCompanies });
  const employeesQuery = useQuery({ queryKey: ["recruitment", "assignable-employees"], queryFn: listRecruitmentAssignableEmployees });
  const cacheQuery = useQuery({ queryKey: recruitmentKeys.ifmCompaniesCache(), queryFn: listIfmCompaniesCache });
  const bindingsQuery = useQuery({ queryKey: recruitmentKeys.ifmUserBindings(), queryFn: listIfmUserBindings });

  const companyOptions = useMemo(() => (companiesQuery.data?.companies ?? []).map((item) => ({ value: item.id, label: item.name })), [companiesQuery.data]);
  const employeeOptions = useMemo(() => (employeesQuery.data?.employees ?? []).map((item) => ({ value: item.id, label: item.name })), [employeesQuery.data]);

  const bindMutation = useMutation({
    mutationFn: ({ ifmCompanyId, companyId }: { ifmCompanyId: string; companyId: string | null }) => bindIfmCompany(ifmCompanyId, companyId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recruitmentKeys.ifmCompaniesCache() }),
        queryClient.invalidateQueries({ queryKey: ["companies", "recruitment-ifm"] })
      ]);
    }
  });
  const createCompanyMutation = useMutation({
    mutationFn: createCompanyFromIfmCache,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: recruitmentKeys.ifmCompaniesCache() }),
        queryClient.invalidateQueries({ queryKey: ["companies", "recruitment-ifm"] })
      ]);
    }
  });
  const saveBindingMutation = useMutation({
    mutationFn: () => {
      const body = {
        ifm_user_id: form.ifm_user_id.trim(),
        ifm_display_name: form.ifm_display_name.trim() || null,
        employee_id: form.employee_id || null,
        bridge_role: form.bridge_role,
        active: form.active
      };
      return editing ? updateIfmUserBinding(editing.id, body) : createIfmUserBinding(body);
    },
    onSuccess: async () => {
      setModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.ifmUserBindings() });
    }
  });

  useEffect(() => {
    if (modalOpen) return;
    setForm(defaultForm);
  }, [modalOpen]);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(binding: IfmUserBinding) {
    setEditing(binding);
    setForm({
      ifm_user_id: binding.ifm_user_id,
      ifm_display_name: binding.ifm_display_name ?? "",
      employee_id: binding.employee_id ?? "",
      bridge_role: binding.bridge_role,
      active: binding.active
    });
    setModalOpen(true);
  }

  return (
    <Box p={20}>
      <Stack gap="xl">
        <Stack gap="md">
          <Title order={4}>公司绑定</Title>
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>IFM 公司名</Table.Th><Table.Th>IFM id</Table.Th><Table.Th>绑定的 bh 公司</Table.Th><Table.Th>状态</Table.Th><Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(cacheQuery.data?.companies_cache ?? []).map((row) => (
                <Table.Tr key={row.ifm_company_id}>
                  <Table.Td>{row.name}</Table.Td>
                  <Table.Td>{row.ifm_company_id}</Table.Td>
                  <Table.Td>
                    <Select
                      data={companyOptions}
                      value={row.bh_company_id ?? null}
                      onChange={(value) => bindMutation.mutate({ ifmCompanyId: row.ifm_company_id, companyId: value })}
                      clearable
                      searchable
                    />
                  </Table.Td>
                  <Table.Td><Badge color={row.active ? "green" : "gray"}>{row.active ? "有效" : "停用"}</Badge></Table.Td>
                  <Table.Td><Button size="xs" variant="subtle" onClick={() => createCompanyMutation.mutate(row.ifm_company_id)}>新建并绑定</Button></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>

        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>用户绑定</Title>
            <Button onClick={openCreate}>新建</Button>
          </Group>
          <Text c="dimmed" size="sm">
            外部员工没有 bh 账号与任何 bh 权限，仅能通过 IFM 后台访问已绑定 IFM 公司的招聘数据；下任务(经理)不需要绑 bh 员工，登记操作(操作员)必须绑。
          </Text>
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>IFM 用户 id</Table.Th><Table.Th>显示名</Table.Th><Table.Th>bh 员工</Table.Th><Table.Th>角色</Table.Th><Table.Th>状态</Table.Th><Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(bindingsQuery.data?.user_bindings ?? []).map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.ifm_user_id}</Table.Td><Table.Td><Group gap="xs"><Text size="sm">{row.ifm_display_name || "-"}</Text><Badge color={row.employee_id ? "blue" : "orange"} variant="light">{row.employee_id ? "bh 员工" : "外部员工"}</Badge></Group></Table.Td><Table.Td>{row.employee_name || "-"}</Table.Td><Table.Td>{bridgeRoleLabel(row.bridge_role)}</Table.Td><Table.Td><Badge color={row.active ? "green" : "gray"}>{row.active ? "启用" : "停用"}</Badge></Table.Td><Table.Td><Button size="xs" variant="subtle" onClick={() => openEdit(row)}>编辑</Button></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Stack>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑 IFM 用户绑定" : "新建 IFM 用户绑定"} size="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="IFM 用户 id" value={form.ifm_user_id} onChange={(event) => setForm((old) => ({ ...old, ifm_user_id: event.currentTarget.value }))} required />
            <TextInput label="显示名" value={form.ifm_display_name} onChange={(event) => setForm((old) => ({ ...old, ifm_display_name: event.currentTarget.value }))} />
            <Select label="bh 员工" data={employeeOptions} value={form.employee_id || null} onChange={(value) => setForm((old) => ({ ...old, employee_id: value ?? "" }))} clearable searchable />
            <Select label="角色" data={bridgeRoleOptions} value={form.bridge_role} onChange={(value) => setForm((old) => ({ ...old, bridge_role: value === "manager" ? "manager" : "operator" }))} />
            <Switch label="启用" checked={form.active} onChange={(event) => setForm((old) => ({ ...old, active: event.currentTarget.checked }))} />
          </SimpleGrid>
          <Group justify="flex-end"><Button variant="default" onClick={() => setModalOpen(false)}>取消</Button><Button loading={saveBindingMutation.isPending} disabled={!form.ifm_user_id.trim()} onClick={() => saveBindingMutation.mutate()}>保存</Button></Group>
        </Stack>
      </Modal>
    </Box>
  );
}
