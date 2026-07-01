import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createIcaFeeScheme,
  deleteIcaFeeScheme,
  listIcaFeeSchemes,
  setIcaFeeSchemeDefault,
  updateIcaFeeScheme,
  type IcaFeeScheme
} from "../../api/businessSchemes";

type SchemeForm = {
  id?: string;
  label: string;
  default_total: number | null;
  default_deposit: number | null;
  guarantor_share: number | null;
};

const emptyForm: SchemeForm = {
  label: "",
  default_total: null,
  default_deposit: null,
  guarantor_share: null
};

function formatMoney(amount: number, currency: string) {
  return `${Number(amount ?? 0).toFixed(2)} ${currency}`;
}

function errorMessage(error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : "unknown_error";
  const key = `icaFeeShare.errors.${message}`;
  const translated = t(key);
  return translated === key ? message : translated;
}

export function IcaFeeSharePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [form, setForm] = useState<SchemeForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const schemesQuery = useQuery({
    queryKey: ["ica-fee-schemes"],
    queryFn: () => listIcaFeeSchemes()
  });

  const invalidateSchemes = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ica-fee-schemes"] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const label = form.label.trim();
      if (!label || form.default_total === null || form.default_deposit === null || form.guarantor_share === null) {
        throw new Error("missing_required_fields");
      }

      const body = {
        label,
        default_total: form.default_total,
        default_deposit: form.default_deposit,
        guarantor_share: form.guarantor_share
      };

      return form.id ? updateIcaFeeScheme(form.id, body) : createIcaFeeScheme(body);
    },
    onSuccess: async () => {
      await invalidateSchemes();
      closeModal();
    },
    onError: (error) => setFormError(errorMessage(error, t))
  });

  const setDefaultMutation = useMutation({
    mutationFn: (schemeId: string) => setIcaFeeSchemeDefault(schemeId),
    onSuccess: invalidateSchemes,
    onError: (error) => setFormError(errorMessage(error, t))
  });

  const deleteMutation = useMutation({
    mutationFn: (schemeId: string) => deleteIcaFeeScheme(schemeId),
    onSuccess: invalidateSchemes,
    onError: (error) => setFormError(errorMessage(error, t))
  });

  function openCreateModal() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpened(true);
  }

  function openEditModal(scheme: IcaFeeScheme) {
    setForm({
      id: scheme.id,
      label: scheme.label,
      default_total: scheme.default_total,
      default_deposit: scheme.default_deposit,
      guarantor_share: scheme.guarantor_share
    });
    setFormError(null);
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setForm(emptyForm);
    setFormError(null);
  }

  function handleDelete(scheme: IcaFeeScheme) {
    setFormError(null);
    if (window.confirm(t("icaFeeShare.disableConfirm", { label: scheme.label }))) {
      deleteMutation.mutate(scheme.id);
    }
  }

  if (schemesQuery.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (schemesQuery.error) {
    return (
      <Alert color="red" variant="light">
        {schemesQuery.error instanceof Error ? schemesQuery.error.message : t("common.unknown_error")}
      </Alert>
    );
  }

  const schemes = schemesQuery.data?.schemes ?? [];
  const currency = schemesQuery.data?.currency ?? "SGD";
  const balance = Math.max(0, (form.default_total ?? 0) - (form.default_deposit ?? 0));

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>{t("icaFeeShare.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("icaFeeShare.hint")}
            </Text>
          </Stack>
          <Button onClick={openCreateModal}>{t("icaFeeShare.addScheme")}</Button>
        </Group>

        {formError ? (
          <Alert color="red" variant="light">
            {formError}
          </Alert>
        ) : null}

        <ScrollArea>
          <Table miw={860} withTableBorder withColumnBorders highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("icaFeeShare.schemeName")}</Table.Th>
                <Table.Th>{t("icaFeeShare.total")}</Table.Th>
                <Table.Th>{t("icaFeeShare.deposit")}</Table.Th>
                <Table.Th>{t("icaFeeShare.guarantorShare")}</Table.Th>
                <Table.Th>{t("icaFeeShare.default")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {schemes.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("icaFeeShare.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                schemes.map((scheme) => (
                  <Table.Tr key={scheme.id}>
                    <Table.Td>{scheme.label}</Table.Td>
                    <Table.Td>{formatMoney(scheme.default_total, currency)}</Table.Td>
                    <Table.Td>{formatMoney(scheme.default_deposit, currency)}</Table.Td>
                    <Table.Td>{formatMoney(scheme.guarantor_share, currency)}</Table.Td>
                    <Table.Td>
                      {scheme.is_default ? (
                        <Badge color="green" variant="light">
                          {t("icaFeeShare.defaultBadge")}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" variant="subtle" onClick={() => openEditModal(scheme)}>
                          {t("common.edit")}
                        </Button>
                        {!scheme.is_default ? (
                          <Button
                            size="xs"
                            variant="light"
                            loading={setDefaultMutation.isPending}
                            onClick={() => {
                              setFormError(null);
                              setDefaultMutation.mutate(scheme.id);
                            }}
                          >
                            {t("icaFeeShare.setDefault")}
                          </Button>
                        ) : null}
                        {!scheme.is_default ? (
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            loading={deleteMutation.isPending}
                            onClick={() => handleDelete(scheme)}
                          >
                            {t("icaFeeShare.disable")}
                          </Button>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={form.id ? t("icaFeeShare.editScheme") : t("icaFeeShare.addScheme")}
        size="md"
      >
        <Stack gap="md">
          {formError ? (
            <Alert color="red" variant="light">
              {formError}
            </Alert>
          ) : null}
          <TextInput
            label={t("icaFeeShare.schemeName")}
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.currentTarget.value }))}
            required
          />
          <NumberInput
            label={t("icaFeeShare.total")}
            description={t("icaFeeShare.totalHint")}
            value={form.default_total ?? ""}
            onChange={(value) =>
              setForm((current) => ({ ...current, default_total: typeof value === "number" ? value : null }))
            }
            min={0}
            decimalScale={2}
            thousandSeparator=","
            required
          />
          <NumberInput
            label={t("icaFeeShare.deposit")}
            description={t("icaFeeShare.depositHint")}
            value={form.default_deposit ?? ""}
            onChange={(value) =>
              setForm((current) => ({ ...current, default_deposit: typeof value === "number" ? value : null }))
            }
            min={0}
            decimalScale={2}
            thousandSeparator=","
            required
          />
          <Text size="sm" c="dimmed">
            {t("icaFeeShare.balancePreview", { amount: balance.toFixed(2) })}
          </Text>
          <NumberInput
            label={t("icaFeeShare.guarantorShare")}
            description={t("icaFeeShare.guarantorShareHint")}
            value={form.guarantor_share ?? ""}
            onChange={(value) =>
              setForm((current) => ({ ...current, guarantor_share: typeof value === "number" ? value : null }))
            }
            min={0}
            decimalScale={2}
            thousandSeparator=","
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
