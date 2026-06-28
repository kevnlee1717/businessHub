import { Alert, Button, Group, Loader, Paper, ScrollArea, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { listClients, type Client } from "../../api/cases";
import { useAuth } from "../../auth/AuthContext";
import { ClientFormModal } from "../../components/ClientFormModal";

const clientQueryKey = ["business", "clients"] as const;
const caseManageRoles = new Set(["owner", "admin", "clerk", "sales"]);

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function ClientsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const canManageCases = user ? caseManageRoles.has(user.role) : false;

  const clientsQuery = useQuery({
    queryKey: clientQueryKey,
    queryFn: listClients
  });

  const clients = clientsQuery.data?.clients ?? [];

  function openCreateModal() {
    setEditingClient(null);
    setModalOpened(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingClient(null);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("client.title")}</Title>
        {canManageCases ? <Button onClick={openCreateModal}>{t("client.add")}</Button> : null}
      </Group>

      {clientsQuery.error ? (
        <Alert color="red" variant="light">
          {clientsQuery.error instanceof Error ? clientsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={840} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("client.fields.name")}</Table.Th>
                <Table.Th>{t("client.fields.phone")}</Table.Th>
                <Table.Th>{t("client.fields.email")}</Table.Th>
                <Table.Th>{t("client.fields.note")}</Table.Th>
                {canManageCases ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {clientsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageCases ? 5 : 4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : clients.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageCases ? 5 : 4}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("client.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                clients.map((client) => (
                  <Table.Tr key={client.id}>
                    <Table.Td>{displayName(client.name, client.name_en)}</Table.Td>
                    <Table.Td>{client.phone ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{client.email ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{client.note ?? t("common.not_available")}</Table.Td>
                    {canManageCases ? (
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openEditModal(client)}>
                          {t("common.edit")}
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <ClientFormModal
        opened={modalOpened}
        onClose={closeModal}
        initialValues={editingClient}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: clientQueryKey });
        }}
      />
    </Stack>
  );
}
