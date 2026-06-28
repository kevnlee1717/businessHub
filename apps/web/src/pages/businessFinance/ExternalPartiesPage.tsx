import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listDealParties } from "../../api/businessSchemes";
import {
  createExternalParty,
  deleteExternalParty,
  listExternalParties,
  rotateStatementToken,
  updateExternalParty,
  type ExternalParty,
  type ExternalPartyInput,
  type ExternalPartyUpdateInput
} from "../../api/externalParties";

type PartyFormValues = {
  party_id: string | null;
  name: string;
  name_en: string;
  contact: string;
  note: string;
  active: boolean;
};

const externalPartiesQueryKey = ["business-finance", "external-parties"] as const;
const dealPartiesQueryKey = ["business-finance", "deal-parties"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function defaults(party?: ExternalParty | null): PartyFormValues {
  return {
    party_id: party?.party_id ?? null,
    name: party?.name ?? "",
    name_en: party?.name_en ?? "",
    contact: party?.contact ?? "",
    note: party?.note ?? "",
    active: party?.active ?? true
  };
}

function normalizeInput(values: PartyFormValues): ExternalPartyInput {
  return {
    party_id: values.party_id,
    name: values.name.trim(),
    name_en: values.name_en.trim() || null,
    contact: values.contact.trim() || null,
    note: values.note.trim() || null,
    active: values.active
  };
}

export function ExternalPartiesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [editingParty, setEditingParty] = useState<ExternalParty | null>(null);
  const [form, setForm] = useState<PartyFormValues>(() => defaults());
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const externalPartiesQuery = useQuery({
    queryKey: externalPartiesQueryKey,
    queryFn: listExternalParties
  });
  const dealPartiesQuery = useQuery({
    queryKey: dealPartiesQueryKey,
    queryFn: listDealParties
  });

  const parties = externalPartiesQuery.data?.external_parties ?? [];
  const dealParties = dealPartiesQuery.data?.deal_parties ?? [];
  const dealPartyById = useMemo(() => new Map(dealParties.map((party) => [party.id, party])), [dealParties]);
  const dealPartyOptions = dealParties.map((party) => ({
    value: party.id,
    label: displayName(party.name, party.name_en)
  }));
  const loadError = externalPartiesQuery.error ?? dealPartiesQuery.error;

  const createMutation = useMutation({
    mutationFn: createExternalParty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: externalPartiesQueryKey });
      closeModal();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ExternalPartyUpdateInput }) => updateExternalParty(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: externalPartiesQueryKey });
      closeModal();
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteExternalParty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: externalPartiesQueryKey });
    }
  });
  const rotateMutation = useMutation({
    mutationFn: rotateStatementToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: externalPartiesQueryKey });
    }
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateExternalParty(id, { active }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: externalPartiesQueryKey });
    }
  });

  function statementLink(party: ExternalParty) {
    return `${window.location.origin}/statement/${party.statement_token}`;
  }

  function openCreateModal() {
    setEditingParty(null);
    setForm(defaults());
    setFormError(null);
    setModalOpened(true);
  }

  function openEditModal(party: ExternalParty) {
    setEditingParty(party);
    setForm(defaults(party));
    setFormError(null);
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingParty(null);
    setForm(defaults());
    setFormError(null);
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      setFormError(t("externalParties.errors.nameRequired"));
      return;
    }

    setFormError(null);
    try {
      const body = normalizeInput(form);
      if (editingParty) {
        await updateMutation.mutateAsync({ id: editingParty.id, body });
      } else {
        await createMutation.mutateAsync(body);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function handleDelete(party: ExternalParty) {
    if (!window.confirm(t("externalParties.confirmDelete", { name: party.name }))) {
      return;
    }

    await deleteMutation.mutateAsync(party.id);
  }

  async function handleCopy(party: ExternalParty) {
    await navigator.clipboard.writeText(statementLink(party));
    setCopiedId(party.id);
    window.setTimeout(() => setCopiedId((current) => (current === party.id ? null : current)), 1600);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Button onClick={openCreateModal}>{t("externalParties.add")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={1180} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("externalParties.fields.name")}</Table.Th>
                <Table.Th>{t("externalParties.fields.defaultParty")}</Table.Th>
                <Table.Th>{t("externalParties.fields.contact")}</Table.Th>
                <Table.Th>{t("externalParties.fields.active")}</Table.Th>
                <Table.Th>{t("externalParties.fields.statementLink")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {externalPartiesQuery.isLoading || dealPartiesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : parties.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("externalParties.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                parties.map((party) => {
                  const defaultParty = party.party_id ? dealPartyById.get(party.party_id) : null;
                  const link = statementLink(party);

                  return (
                    <Table.Tr key={party.id}>
                      <Table.Td>{displayName(party.name, party.name_en)}</Table.Td>
                      <Table.Td>{defaultParty ? displayName(defaultParty.name, defaultParty.name_en) : "-"}</Table.Td>
                      <Table.Td>{party.contact || "-"}</Table.Td>
                      <Table.Td>
                        <Switch
                          checked={party.active}
                          onChange={(event) =>
                            activeMutation.mutate({ id: party.id, active: event.currentTarget.checked })
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Text size="sm" ff="monospace" truncate maw={360}>
                            {link}
                          </Text>
                          <Button size="xs" variant="light" onClick={() => void handleCopy(party)}>
                            {copiedId === party.id ? t("externalParties.copied") : t("externalParties.copyLink")}
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            loading={rotateMutation.isPending}
                            onClick={() => rotateMutation.mutate(party.id)}
                          >
                            {t("externalParties.rotateLink")}
                          </Button>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openEditModal(party)}>
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="xs"
                            color="red"
                            variant="light"
                            loading={deleteMutation.isPending}
                            onClick={() => void handleDelete(party)}
                          >
                            {t("common.delete")}
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingParty ? t("externalParties.edit") : t("externalParties.add")}
        size="lg"
      >
        <Stack gap="sm">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          <Group grow align="flex-start">
            <TextInput
              label={t("externalParties.fields.name")}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
              required
            />
            <TextInput
              label={t("externalParties.fields.nameEn")}
              value={form.name_en}
              onChange={(event) => setForm((current) => ({ ...current, name_en: event.currentTarget.value }))}
            />
          </Group>
          <Select
            label={t("externalParties.fields.defaultParty")}
            data={dealPartyOptions}
            value={form.party_id}
            onChange={(value) => setForm((current) => ({ ...current, party_id: value }))}
            searchable
            clearable
          />
          <TextInput
            label={t("externalParties.fields.contact")}
            value={form.contact}
            onChange={(event) => setForm((current) => ({ ...current, contact: event.currentTarget.value }))}
          />
          <Textarea
            label={t("externalParties.fields.note")}
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Switch
            label={t("externalParties.fields.active")}
            checked={form.active}
            onChange={(event) => setForm((current) => ({ ...current, active: event.currentTarget.checked }))}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="light" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleSubmit()} loading={createMutation.isPending || updateMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
