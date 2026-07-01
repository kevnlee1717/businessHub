import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput
} from "@mantine/core";
import {
  genders,
  guarantorCreateSchema,
  guarantorUpdateSchema,
  type Gender,
  type GuarantorCreateInput,
  type GuarantorUpdateInput
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import {
  createGuarantor,
  deleteGuarantor,
  getGuarantorSummary,
  listGuarantors,
  updateGuarantor,
  uploadGuarantorIdCard,
  type Guarantor
} from "../../api/cases";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";
import { GuarantorDetailDrawer } from "./GuarantorDetailDrawer";

type GuarantorFormValues = {
  name?: string | undefined;
  nric?: string | undefined;
  gender?: Gender | null | undefined;
  age?: number | null | undefined;
  is_client_own?: boolean | undefined;
  note?: string | null | undefined;
};

const guarantorQueryKey = ["business", "guarantors"] as const;

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

function getDefaultValues(guarantor?: Guarantor): GuarantorFormValues {
  return {
    name: guarantor?.name ?? "",
    nric: guarantor?.nric ?? undefined,
    gender: guarantor?.gender ?? null,
    age: guarantor?.age ?? null,
    is_client_own: guarantor?.is_client_own ?? false,
    note: guarantor?.note ?? null
  };
}

function SummaryCard({ label, value, color, suffix }: { label: string; value: number; color?: string; suffix?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap={4} align="center">
        <Text fz={36} fw={700} c={color ?? "dark"} lh={1}>
          {value}{suffix ?? ""}
        </Text>
        <Text fz="sm" c="dimmed" ta="center">{label}</Text>
      </Stack>
    </Paper>
  );
}

type IdCardUploadProps = {
  guarantor: Guarantor;
  canManageCases: boolean;
};

function IdCardUpload({ guarantor, canManageCases }: IdCardUploadProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (selectedFile: File) => uploadGuarantorIdCard(guarantor.id, selectedFile),
    onSuccess: async () => {
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: guarantorQueryKey });
    }
  });

  async function upload() {
    if (!file) {
      return;
    }

    setError(null);
    try {
      await uploadMutation.mutateAsync(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap={4}>
      <Badge color={guarantor.id_card_document_id ? "green" : "gray"} variant="light">
        {guarantor.id_card_document_id ? t("guarantor.idCardUploaded") : t("guarantor.idCardMissing")}
      </Badge>
      {canManageCases ? (
        <Group gap="xs" wrap="nowrap">
          <FileInput
            size="xs"
            value={file}
            onChange={setFile}
            placeholder={t("guarantor.uploadIdCard")}
            clearable
          />
          <Button size="xs" onClick={upload} loading={uploadMutation.isPending} disabled={!file}>
            {t("common.upload")}
          </Button>
        </Group>
      ) : null}
      {error ? (
        <Text size="xs" c="red">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}

export function GuarantorsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [editingGuarantor, setEditingGuarantor] = useState<Guarantor | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const canManageCases = can("case.manage");

  const guarantorsQuery = useQuery({
    queryKey: [...guarantorQueryKey, page, pageSize],
    queryFn: () => listGuarantors({ page, page_size: pageSize }),
    placeholderData: keepPreviousData
  });

  const summaryQuery = useQuery({
    queryKey: ["business", "guarantors", "summary"],
    queryFn: getGuarantorSummary
  });
  const summary = summaryQuery.data?.summary;

  const form = useForm<GuarantorFormValues>({
    resolver: zodResolver(editingGuarantor ? guarantorUpdateSchema : guarantorCreateSchema) as Resolver<GuarantorFormValues>,
    defaultValues: getDefaultValues(editingGuarantor ?? undefined)
  });

  const createMutation = useMutation({
    mutationFn: createGuarantor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: guarantorQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["business", "guarantors", "summary"] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: GuarantorUpdateInput }) => updateGuarantor(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: guarantorQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["business", "guarantors", "summary"] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGuarantor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: guarantorQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["business", "guarantors", "summary"] });
    }
  });

  const guarantors = guarantorsQuery.data?.guarantors ?? [];
  const totalGuarantors = guarantorsQuery.data?.total ?? guarantors.length;
  const errors = form.formState.errors;
  const genderOptions = genders.map((gender) => ({
    value: gender,
    label: t(`gender.${gender}`)
  }));
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function openCreateModal() {
    setEditingGuarantor(null);
    setFormError(null);
    form.reset(getDefaultValues());
    setModalOpened(true);
  }

  function openEditModal(guarantor: Guarantor) {
    setEditingGuarantor(guarantor);
    setFormError(null);
    form.reset(getDefaultValues(guarantor));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setEditingGuarantor(null);
    setFormError(null);
    form.reset(getDefaultValues());
  }

  async function removeGuarantor(guarantor: Guarantor) {
    if (!window.confirm(t("guarantor.confirmDelete", { name: guarantor.name }))) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(guarantor.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (editingGuarantor) {
        await updateMutation.mutateAsync({ id: editingGuarantor.id, body: values });
        return;
      }

      await createMutation.mutateAsync(values as GuarantorCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
        <SummaryCard label={t("guarantor.summary.count")} value={summary?.guarantorCount ?? 0} />
        <SummaryCard label={t("guarantor.summary.sponsored")} value={summary?.sponsoredTotal ?? 0} />
        <SummaryCard label={t("guarantor.summary.approved")} value={summary?.approved ?? 0} color="teal.7" />
        <SummaryCard label={t("guarantor.summary.rejected")} value={summary?.rejected ?? 0} color="red.6" />
        <SummaryCard
          label={t("guarantor.summary.successRate")}
          value={summary && summary.successRate !== null ? Math.round(summary.successRate * 100) : 0}
          suffix="%"
        />
      </SimpleGrid>

      <Group justify="space-between" align="center">
        {canManageCases ? <Button onClick={openCreateModal}>{t("guarantor.add")}</Button> : null}
      </Group>

      {guarantorsQuery.error ? (
        <Alert color="red" variant="light">
          {guarantorsQuery.error instanceof Error ? guarantorsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}
      {formError && !modalOpened ? (
        <Alert color="red" variant="light">
          {formError}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={980} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("guarantor.fields.name")}</Table.Th>
                <Table.Th>{t("guarantor.fields.nric")}</Table.Th>
                <Table.Th>{t("guarantor.fields.gender")}</Table.Th>
                <Table.Th>{t("guarantor.fields.age")}</Table.Th>
                <Table.Th>{t("guarantor.fields.sponsoredCount")}</Table.Th>
                <Table.Th>担保时间</Table.Th>
                <Table.Th>成功率</Table.Th>
                <Table.Th>{t("guarantor.fields.idCard")}</Table.Th>
                {canManageCases ? <Table.Th>{t("common.actions")}</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {guarantorsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageCases ? 9 : 8}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : guarantors.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageCases ? 9 : 8}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("guarantor.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                guarantors.map((guarantor) => (
                  <Table.Tr key={guarantor.id}>
                    <Table.Td>
                      <Text
                        component="button"
                        type="button"
                        onClick={() => setDetailId(guarantor.id)}
                        style={{ cursor: "pointer", background: "none", border: "none", padding: 0, color: "var(--mantine-color-blue-6)" }}
                      >
                        {guarantor.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{guarantor.nric ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{guarantor.gender ? t(`gender.${guarantor.gender}`) : t("common.not_available")}</Table.Td>
                    <Table.Td>{guarantor.age ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{t("guarantor.sponsoredCount", { count: guarantor.sponsored_count })}</Table.Td>
                    <Table.Td>
                      {guarantor.stats?.firstAt
                        ? `${guarantor.stats.firstAt.slice(0, 7)} ~ ${(guarantor.stats.lastAt ?? "").slice(0, 7)}`
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {guarantor.stats && guarantor.stats.successRate !== null
                        ? <Badge color={guarantor.stats.successRate >= 0.5 ? "green" : "orange"} variant="light">
                            {Math.round(guarantor.stats.successRate * 100)}% ({guarantor.stats.approved}/{guarantor.stats.approved + guarantor.stats.rejected})
                          </Badge>
                        : <Badge color="gray" variant="light">无判定</Badge>}
                    </Table.Td>
                    <Table.Td>
                      <IdCardUpload guarantor={guarantor} canManageCases={canManageCases} />
                    </Table.Td>
                    {canManageCases ? (
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="xs" variant="light" onClick={() => openEditModal(guarantor)}>
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="xs"
                            variant="light"
                            color="red"
                            onClick={() => removeGuarantor(guarantor)}
                            loading={deleteMutation.isPending}
                          >
                            {t("common.delete")}
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
      <TablePagination
        total={totalGuarantors}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <GuarantorDetailDrawer guarantorId={detailId} onClose={() => setDetailId(null)} />

      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={editingGuarantor ? t("guarantor.edit") : t("guarantor.add")}
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
                label={t("guarantor.fields.name")}
                error={errors.name?.message}
                {...form.register("name")}
              />
              <TextInput
                label={t("guarantor.fields.nric")}
                error={errors.nric?.message}
                {...form.register("nric", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                name="gender"
                control={form.control}
                render={({ field }) => (
                  <Select
                    label={t("guarantor.fields.gender")}
                    data={genderOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as Gender | null)}
                    error={errors.gender?.message}
                    clearable
                  />
                )}
              />
              <Controller
                name="age"
                control={form.control}
                render={({ field }) => (
                  <NumberInput
                    label={t("guarantor.fields.age")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value === "" ? null : Number(value))}
                    error={errors.age?.message}
                    min={0}
                    allowDecimal={false}
                  />
                )}
              />
            </Group>
            <Controller
              name="is_client_own"
              control={form.control}
              render={({ field }) => (
                <Switch
                  label={t("guarantor.fields.clientOwn")}
                  description={t("guarantor.fields.clientOwnHint")}
                  checked={Boolean(field.value)}
                  onChange={(event) => field.onChange(event.currentTarget.checked)}
                />
              )}
            />
            <Textarea
              label={t("guarantor.fields.note")}
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
