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
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import {
  allPermissions,
  computeEffectivePermissionsFromBase,
  permissionCatalog,
  type DataScope,
  type Permission
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { listCompanies, listEmployees, listPositions, type Employee } from "../../api/hr";
import {
  getEmployeePermissions,
  updateEmployeePermissions,
  type EmployeePermissions,
  type EmployeePermissionsUpdate
} from "../../api/permissions";

type PermissionOverride = { permission: Permission; effect: "grant" | "revoke" };

type Draft = {
  dataScope: DataScope;
  positionId: string;
  companyIds: string[];
  overrides: PermissionOverride[];
};

const dataScopeLabels: Record<DataScope, string> = {
  all: "全部公司+全部数据",
  company: "本公司全部",
  self: "仅本人"
};

const permissionsQueryKey = ["settings", "permissions"] as const;
const employeesQueryKey = ["hr", "employees"] as const;
const companiesQueryKey = ["settings", "companies"] as const;
const positionsQueryKey = ["hr", "positions"] as const;

function employeeLabel(employee: Employee) {
  return employee.name_en ? `${employee.name} / ${employee.name_en}` : employee.name;
}

function normalizePermissions(permissions: string[]): Permission[] {
  return permissions.filter((permission): permission is Permission =>
    allPermissions.includes(permission as Permission)
  );
}

function toDraft(data: EmployeePermissions): Draft {
  return {
    dataScope: data.dataScope,
    positionId: data.positionId,
    companyIds: data.companyIds,
    overrides: data.overrides.map((override) => ({
      permission: override.permission as Permission,
      effect: override.effect
    }))
  };
}

function toPayload(draft: Draft): EmployeePermissionsUpdate {
  return {
    positionId: draft.positionId,
    companyIds: draft.companyIds,
    overrides: draft.overrides
  };
}

export function PermissionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const employeesQuery = useQuery({
    queryKey: employeesQueryKey,
    queryFn: listEmployees
  });
  const companiesQuery = useQuery({
    queryKey: companiesQueryKey,
    queryFn: listCompanies
  });
  const positionsQuery = useQuery({
    queryKey: positionsQueryKey,
    queryFn: listPositions
  });
  const permissionsQuery = useQuery({
    queryKey: [...permissionsQueryKey, selectedEmployeeId],
    queryFn: () => getEmployeePermissions(selectedEmployeeId ?? ""),
    enabled: Boolean(selectedEmployeeId)
  });

  const employees = employeesQuery.data?.employees ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const selectedPosition = draft
    ? positions.find((position) => position.id === draft.positionId) ?? null
    : null;
  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return employees;
    }

    return employees.filter((employee) =>
      [employee.name, employee.name_en, employee.email, employee.position_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    );
  }, [employees, search]);

  const companyOptions = (companiesQuery.data?.companies ?? []).map((company) => ({
    value: company.id,
    label: company.name
  }));
  const positionOptions = positions.map((position) => ({
    value: position.id,
    label: position.name_en ? `${position.name} / ${position.name_en}` : position.name
  }));
  const basePermissions = selectedPosition
    ? selectedPosition.is_system
      ? allPermissions
      : normalizePermissions(selectedPosition.permissions)
    : [];
  const effectivePermissions = draft
    ? computeEffectivePermissionsFromBase(basePermissions, draft.overrides)
    : [];
  const effectiveDataScope = selectedPosition?.data_scope ?? draft?.dataScope ?? "self";

  const saveMutation = useMutation({
    mutationFn: (body: Draft) => updateEmployeePermissions(selectedEmployeeId ?? "", toPayload(body)),
    onSuccess: async (data) => {
      setDraft(toDraft(data));
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: [...permissionsQueryKey, selectedEmployeeId] });
      await queryClient.invalidateQueries({ queryKey: employeesQueryKey });
      await queryClient.invalidateQueries({ queryKey: positionsQueryKey });
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

      const position = positions.find((item) => item.id === current.positionId);
      const base = position?.is_system ? allPermissions : normalizePermissions(position?.permissions ?? []);
      const positionDefault = base.includes(permission);
      const nextOverrides = current.overrides.filter((override) => override.permission !== permission);

      if (checked !== positionDefault) {
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
            管理员工岗位、可访问公司和个人权限覆盖。数据范围继承岗位。
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
                placeholder="搜索姓名、邮箱、岗位"
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
                        {employee.position_name ?? "—"}
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

              <Select
                label="岗位"
                data={positionOptions}
                value={draft.positionId}
                onChange={(value) => value && updateDraft({ positionId: value })}
                allowDeselect={false}
                searchable
              />

              <Box>
                <Text size="sm" fw={500}>
                  数据范围
                </Text>
                <Badge mt={6} variant="light">
                  {dataScopeLabels[effectiveDataScope]}
                </Badge>
              </Box>

              <MultiSelect
                label="可访问公司"
                description={effectiveDataScope === "all" ? "全部公司,无需逐一选" : undefined}
                data={companyOptions}
                value={draft.companyIds}
                onChange={(companyIds) => updateDraft({ companyIds })}
                searchable
                clearable
                disabled={effectiveDataScope === "all"}
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
                        const positionDefault = basePermissions.includes(permission.key);
                        const override = draft.overrides.find((item) => item.permission === permission.key);
                        const effectiveOn = override ? override.effect === "grant" : positionDefault;

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
                                跟随岗位
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
