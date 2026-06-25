import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  clientCreateSchema,
  clientUpdateSchema,
  type ClientCreateInput,
  type ClientUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { createClient, listClients, updateClient, type Client } from "../../api/cases";

type ClientFormValues = {
  name?: string | undefined;
  name_en?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  note?: string | null | undefined;
};

const clientQueryKey = ["business", "clients"] as const;
const caseManageRoles = new Set(["owner", "admin", "clerk", "sales"]);

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function getDefaultValues(client?: Client): ClientFormValues {
  return {
    name: client?.name ?? "",
    name_en: client?.name_en ?? undefined,
    phone: client?.phone ?? undefined,
    email: client?.email ?? undefined,
    note: client?.note ?? null
  };
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

export function ClientsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const canManageCases = user ? caseManageRoles.has(user.role) : false;

  const clientsQuery = useQuery({
    queryKey: clientQueryKey,
    queryFn: listClients
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(editingClient ? clientUpdateSchema : clientCreateSchema) as Resolver<ClientFormValues>,
    defaultValues: getDefaultValues(editingClient ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createClient,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientQueryKey });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ClientUpdateInput }) => updateClient(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientQueryKey });
      closeModal();
    }
  });

  const clients = clientsQuery.data?.clients ?? [];
  const errors = form.formState.errors;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingClient(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(client: Client) {
    setEditingClient(client);
    setFormError(null);
    form.reset(getDefaultValues(client));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingClient(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingClient) {
        await updateMutation.mutateAsync({ id: editingClient.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as ClientCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

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
          <Table miw={840} verticalSpacing="sm" striped highlightOnHover>
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

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingClient ? t("client.edit") : t("client.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("client.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("client.fields.nameEn")}
                error={errors.name_en?.message}
                {...form.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <TextInput
                label={t("client.fields.phone")}
                error={errors.phone?.message}
                {...form.register("phone", { setValueAs: emptyToUndefined })}
              />
              <TextInput
                label={t("client.fields.email")}
                error={errors.email?.message}
                {...form.register("email", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Textarea
              label={t("client.fields.note")}
              error={errors.note?.message}
              {...form.register("note", { setValueAs: emptyToNull })}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSaving}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
