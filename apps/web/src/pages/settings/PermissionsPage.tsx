import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Radio,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  ROLE_PERMISSIONS,
  computeEffectivePermissions,
  dataScopes,
  permissionCatalog,
  roles,
  type DataScope,
  type Permission,
  type Role
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listCompanies, listEmployees, type Employee } from "../../api/hr";
import {
  getEmployeePermissions,
  updateEmployeePermissions,
  type EmployeePermissions
} from "../../api/permissions";
import { useAuth } from "../../auth/AuthContext";

type PermissionOverride = { permission: Permission; effect: "grant" | "revoke" };

type Draft = {
  role: Role;
  dataScope: DataScope;
  companyIds: string[];
  overrides: PermissionOverride[];
};

const roleLabels: Record<Role, string> = {
  owner: "老板",
  admin: "管理员",
  accountant: "会计",
  clerk: "文员",
  sales: "销售",
  teacher: "老师",
  principal: "校长",
  photographer: "摄影"
};

const dataScopeLabels: Record<DataScope, string> = {
  all: "全部公司+全部数据",
  company: "本公司全部",
  self: "仅本人"
};

const permissionsQueryKey = ["settings", "permissions"] as const;
const employeesQueryKey = ["hr", "employees"] as const;
const companiesQueryKey = ["settings", "companies"] as const;

function employeeLabel(employee: Employee) {
  return employee.name_en ? `${employee.name} / ${employee.name_en}` : employee.name;
}

function toDraft(data: EmployeePermissions): Draft {
  return {
    role: data.role as Role,
    dataScope: data.dataScope,
    companyIds: data.companyIds,
    overrides: data.overrides.map((override) => ({
      permission: override.permission as Permission,
      effect: override.effect
    }))
  };
}

function toPayload(draft: Draft): EmployeePermissions {
  return {
    role: draft.role,
    dataScope: draft.dataScope,
    companyIds: draft.companyIds,
    overrides: draft.overrides
  };
}

export function PermissionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const canAssignOwner = user?.role === "owner";

  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: listEmployees
  });
  const companiesQuery = useQuery({
    queryKey: companiesQueryKey,
    queryFn: listCompanies
  });
  const permissionsQuery = useQuery({
    queryKey: [...permissionsQueryKey, selectedEmployeeId],
    queryFn: () => getEmployeePermissions(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });

  const employees = employeesQuery.data?.employees ?? [];
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return employees;
    }

    return employees.filter((employee) =>
      [employee.name, employee.name_en, employee.email, employee.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [employees, search]);

  const companyOptions = (companiesQuery.data?.companies ?? []).map((company) => ({
    value: company.id,
    label: company.name
  }));
  const effectivePermissions = draft ? computeEffectivePermissions(draft.role, draft.overrides) : [];
  const roleOptions = roles.map((role) => ({
    value: role,
    label: roleLabels[role],
    disabled: role === "owner" && !canAssignOwner
  }));

  const saveMutation = useMutation({
    mutationFn: (body: Draft) => updateEmployeePermissions(selectedEmployeeId ?? "", toPayload(body)),
    onSuccess: async (data) => {
      setDraft(toDraft(data));
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: [...permissionsQueryKey, selectedEmployeeId] });
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
    }
  });

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (permissionsQuery.data) {
      setDraft(toDraft(permissionsQuery.data));
      setSaved(false);
    }
  }, [permissionsQuery.data]);

  function setOverride(permission: Permission, checked: boolean) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const roleDefault = ROLE_PERMISSIONS[current.role].includes(permission);
      const nextOverrides = current.overrides.filter((override) => override.permission !== permission);

      if (checked !== roleDefault) {
        nextOverrides.push({ permission, effect: checked ? "grant" : "revoke" });
      }

      return { ...current, overrides: nextOverrides };
    });
  }

  function updateDraft(patch: Partial<Draft>) {
    setSaved(false);
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Box>
          <Title order={2}>用户授权</Title>
          <Text size="sm" c="dimmed">
            管理员工角色、数据范围、可访问公司和个人权限覆盖。
          </Text>
        </Box>
        {draft ? (
          <Badge variant="light" size="lg">
            最终生效权限数 {effectivePermissions.length}
          </Badge>
        ) : null}
      </Group>

      {saved ? (
        <Alert color="green" variant="light" onClose={() => setSaved(false)} withCloseButton>
          保存成功
        </Alert>
      ) : null}
      {saveMutation.error ? (
        <Alert color="red" variant="light">
          {saveMutation.error instanceof Error ? saveMutation.error.message : "保存失败"}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <TextInput
              label="员工"
              placeholder="搜索姓名、邮箱、角色"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <ScrollArea h={560}>
              <Stack gap={6}>
                {employeesQuery.isLoading ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  filteredEmployees.map((employee) => (
                    <Button
                      key={employee.id}
                      variant={employee.id === selectedEmployeeId ? "filled" : "subtle"}
                      justify="space-between"
                      fullWidth
                      onClick={() => setSelectedEmployeeId(employee.id)}
                    >
                      <span>{employeeLabel(employee)}</span>
                      <Badge size="xs" variant="light">
                        {roleLabels[employee.role]}
                      </Badge>
                    </Button>
                  ))
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        </Paper>

        <Paper withBorder radius="md" p="md">
          {!selectedEmployee ? (
            <Text c="dimmed">请选择员工</Text>
          ) : permissionsQuery.isLoading || !draft ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : (
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Title order={3}>{employeeLabel(selectedEmployee)}</Title>
                  <Text size="sm" c="dimmed">
                    {selectedEmployee.email}
                  </Text>
                </Box>
                <Button loading={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
                  保存
                </Button>
              </Group>

              {!canAssignOwner ? (
                <Alert color="yellow" variant="light">
                  仅老板可分配 owner 角色或「全部公司+全部数据」范围。
                </Alert>
              ) : null}

              <Select
                label="角色"
                data={roleOptions}
                value={draft.role}
                onChange={(value) => value && updateDraft({ role: value as Role })}
                allowDeselect={false}
              />

              <Radio.Group
                label="数据范围"
                value={draft.dataScope}
                onChange={(value) => updateDraft({ dataScope: value as DataScope })}
              >
                <Group mt="xs">
                  {dataScopes.map((scope) => (
                    <Radio
                      key={scope}
                      value={scope}
                      label={dataScopeLabels[scope]}
                      disabled={scope === "all" && !canAssignOwner}
                    />
                  ))}
                </Group>
              </Radio.Group>

              <MultiSelect
                label="可访问公司"
                description={draft.dataScope === "all" ? "全部公司,无需逐一选" : undefined}
                data={companyOptions}
                value={draft.companyIds}
                onChange={(companyIds) => updateDraft({ companyIds })}
                searchable
                clearable
                disabled={draft.dataScope === "all"}
              />

              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={4}>权限覆盖</Title>
                  <Text size="sm" c="dimmed">
                    手动项 {draft.overrides.length}
                  </Text>
                </Group>

                {permissionCatalog.map((group) => (
                  <Paper key={group.key} withBorder radius="md" p="sm">
                    <Stack gap="xs">
                      <Text fw={700}>{group.label}</Text>
                      {group.permissions.map((permission) => {
                        const roleDefault = ROLE_PERMISSIONS[draft.role].includes(permission.key);
                        const override = draft.overrides.find((item) => item.permission === permission.key);
                        const effectiveOn = override ? override.effect === "grant" : roleDefault;

                        return (
                          <Group key={permission.key} justify="space-between" wrap="nowrap">
                            <Checkbox
                              checked={effectiveOn}
                              onChange={(event) => setOverride(permission.key, event.currentTarget.checked)}
                              label={permission.label}
                            />
                            {override ? (
                              <Badge color={override.effect === "grant" ? "green" : "red"} variant="light">
                                {override.effect === "grant" ? "+加" : "-减"}
                              </Badge>
                            ) : (
                              <Badge color="gray" variant="light">
                                跟随角色
                              </Badge>
                            )}
                          </Group>
                        );
                      })}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}
