import { Alert, Button, Group, Loader, Paper, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listCompanies,
  listEmployees,
  listPositions,
  type Employee
} from "../../api/hr";
import { EmployeeFormModal } from "../../components/EmployeeFormModal";

const employeeQueryKey = ["hr", "employees"] as const;
const companyQueryKey = ["hr", "companies"] as const;
const positionQueryKey = ["hr", "positions"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function EmployeesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  const employeesQuery = useQuery({
    queryKey: employeeQueryKey,
    queryFn: listEmployees
  });
  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: listCompanies
  });
  const positionsQuery = useQuery({
    queryKey: positionQueryKey,
    queryFn: listPositions
  });

  const companies = companiesQuery.data?.companies ?? [];
  const positions = positionsQuery.data?.positions ?? [];

  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.id, position])),
    [positions]
  );

  function openCreateModal() {
    setEditingEmployee(null);
    setModalOpened(true);
  }

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingEmployee(null);
  }

  const employees = employeesQuery.data?.employees ?? [];
  const isLoading =
    employeesQuery.isLoading ||
    companiesQuery.isLoading ||
    positionsQuery.isLoading;
  const loadError = employeesQuery.error ?? companiesQuery.error ?? positionsQuery.error;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("hr.employees.title")}</Title>
        <Button onClick={openCreateModal}>{t("hr.employees.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("hr.employees.fields.name")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.email")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.role")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.company")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.position")}</Table.Th>
                <Table.Th>{t("hr.employees.fields.status")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : employees.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("hr.employees.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                employees.map((employee) => (
                  <Table.Tr key={employee.id}>
                    <Table.Td>{displayName(employee.name, employee.name_en)}</Table.Td>
                    <Table.Td>{employee.email}</Table.Td>
                    <Table.Td>{t(`role.${employee.role}`)}</Table.Td>
                    <Table.Td>
                      {employee.company_id
                        ? companyById.get(employee.company_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>
                      {employee.position_id
                        ? positionById.get(employee.position_id)?.name ?? t("common.not_available")
                        : t("common.not_available")}
                    </Table.Td>
                    <Table.Td>{t(`employeeStatus.${employee.status}`)}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(employee)}>
                        {t("common.edit")}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <EmployeeFormModal
        opened={modalOpened}
        onClose={closeModal}
        initialValues={editingEmployee}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: employeeQueryKey });
        }}
      />
    </Stack>
  );
}
