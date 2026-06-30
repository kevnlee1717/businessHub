import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core";
import {
  dealPartyCreateSchema,
  dealPartyUpdateSchema,
  type DealPartyCreateInput,
  type DealPartyUpdateInput
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  createDealParty,
  listDealParties,
  updateDealParty,
  type DealParty
} from "../../api/businessSchemes";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type PartyFormValues = {
  code?: string | undefined;
  name?: string | undefined;
  name_en?: string | null | undefined;
  active?: boolean | undefined;
};

const partiesQueryKey = ["business-finance", "deal-parties"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function partyDefaults(party?: DealParty | null): PartyFormValues {
  return {
    code: party?.code ?? "",
    name: party?.name ?? "",
    name_en: party?.name_en ?? null,
    active: party?.active ?? true
  };
}

export function DealPartiesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [editingParty, setEditingParty] = useState<DealParty | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const partiesQuery = useQuery({
    queryKey: [...partiesQueryKey, page, pageSize],
    queryFn: () => listDealParties({ page, page_size: pageSize }),
    placeholderData: keepPreviousData
  });

  const form = useForm<PartyFormValues>({
    resolver: zodResolver(editingParty ? dealPartyUpdateSchema : dealPartyCreateSchema) as Resolver<PartyFormValues>,
    defaultValues: partyDefaults()
  });

  const createMutation = useMutation({
    mutationFn: createDealParty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: partiesQueryKey });
      closeModal();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DealPartyUpdateInput }) => updateDealParty(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: partiesQueryKey });
      closeModal();
    }
  });

  const parties = partiesQuery.data?.deal_parties ?? [];
  const totalParties = partiesQuery.data?.total ?? parties.length;

  function openCreateModal() {
    setEditingParty(null);
    setFormError(null);
    form.reset(partyDefaults());
    setModalOpened(true);
  }

  function openEditModal(party: DealParty) {
    setEditingParty(party);
    setFormError(null);
    form.reset(partyDefaults(party));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingParty(null);
    setFormError(null);
    form.reset(partyDefaults());
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingParty) {
        await updateMutation.mutateAsync({
          id: editingParty.id,
          body: {
            ...(values as DealPartyUpdateInput),
            code: editingParty.is_system ? undefined : values.code
          }
        });
        return;
      }

      await createMutation.mutateAsync(values as DealPartyCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("dealParty.add")}</Button>
      </Group>

      {partiesQuery.error ? (
        <Alert color="red" variant="light">
          {partiesQuery.error instanceof Error ? partiesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={820} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("dealParty.fields.code")}</Table.Th>
                <Table.Th>{t("dealParty.fields.name")}</Table.Th>
                <Table.Th>{t("dealParty.fields.active")}</Table.Th>
                <Table.Th>{t("dealParty.fields.isSystem")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {partiesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : parties.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("dealParty.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                parties.map((party) => (
                  <Table.Tr key={party.id}>
                    <Table.Td>{party.code}</Table.Td>
                    <Table.Td>{displayName(party.name, party.name_en)}</Table.Td>
                    <Table.Td>
                      <Badge color={party.active ? "green" : "gray"} variant="light">
                        {party.active ? t("common.yes") : t("common.no")}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{party.is_system ? t("common.yes") : t("common.no")}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => openEditModal(party)}>
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
      <TablePagination
        total={totalParties}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingParty ? t("dealParty.edit") : t("dealParty.add")}
        size="lg"
      >
        <form onSubmit={onSubmit}>
          {formError ? (
            <Alert color="red" variant="light" mb="md">
              {formError}
            </Alert>
          ) : null}
          <Stack gap="sm">
            <Controller
              control={form.control}
              name="code"
              render={({ field, fieldState }) => (
                <TextInput
                  label={t("dealParty.fields.code")}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={Boolean(editingParty?.is_system)}
                  required={!editingParty?.is_system}
                />
              )}
            />
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("dealParty.fields.name")}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
              <Controller
                control={form.control}
                name="name_en"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("dealParty.fields.nameEn")}
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.currentTarget.value || null)}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </Group>
            <Controller
              control={form.control}
              name="active"
              render={({ field }) => (
                <Checkbox
                  label={t("dealParty.fields.active")}
                  checked={Boolean(field.value)}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
                />
              )}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
