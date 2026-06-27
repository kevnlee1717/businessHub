import { zodResolver } from "@hookform/resolvers/zod";
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
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  DEAL_PRESETS,
  businessStatuses,
  schemeLineBases,
  schemeLineKinds,
  schemeLineRecurrences,
  schemeLineSchema,
  schemeVersionCreateSchema,
  schemeVersionStatuses,
  type BusinessStatus,
  type DealInputsInput,
  type SchemeLineBasis,
  type SchemeLineInputSchema,
  type SchemeLineKind,
  type SchemeLineRecurrence,
  type SchemeVersionCreateInput,
  type SchemeVersionStatus
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createSchemeMilestone,
  deleteSchemeMilestone,
  listSchemeMilestones,
  updateSchemeMilestone,
  type MilestoneBasis,
  type SchemeMilestone,
  type SchemeMilestoneInput
} from "../../api/charges";
import {
  createSchemeLine,
  createSchemeVersion,
  deleteSchemeLine,
  getBusiness,
  getSchemeVersion,
  listDealParties,
  previewSchemeVersion,
  updateBusiness,
  updateSchemeLine,
  updateSchemeVersion,
  type DealEconomics,
  type DealParty,
  type SchemeLine,
  type SchemeVersion,
  type VersionBrief
} from "../../api/businessSchemes";

type VersionFormValues = {
  preset?: (typeof DEAL_PRESETS)[number]["key"] | undefined;
  label?: string | undefined;
  status?: SchemeVersionStatus | undefined;
  effective_from?: string | null | undefined;
  assumed_inputs?: Record<string, unknown> | null | undefined;
};

type LineFormValues = {
  kind?: SchemeLineKind | undefined;
  basis?: SchemeLineBasis | undefined;
  recurrence?: SchemeLineRecurrence | undefined;
  party_id?: string | null | undefined;
  rate?: number | string | null | undefined;
  unit_label?: string | null | undefined;
  input_key?: string | null | undefined;
  label?: string | undefined;
  sort_order?: number | undefined;
};

type MilestoneFormValues = {
  seq: number | undefined;
  label: string;
  basis: MilestoneBasis;
  value: number | undefined;
  bind_step_order: number | null;
  due_offset_days: number | null;
};

const commonInputKeys = [
  "headcount",
  "months",
  "nights",
  "unit_count",
  "unit_price",
  "unit_sell",
  "unit_cost",
  "events"
] as const;
const businessQueryKey = (id: string | undefined) => ["business-finance", "business", id] as const;
const versionQueryKey = (id: string | null | undefined) => ["business-finance", "scheme-version", id] as const;
const partiesQueryKey = ["business-finance", "deal-parties"] as const;

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function formatRate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? "-" : `${(numberValue * 100).toFixed(2)}%`;
}

function statusColor(status: string) {
  return status === "active" ? "green" : status === "paused" ? "yellow" : "gray";
}

function versionStatusColor(status: string) {
  return status === "active" ? "green" : "gray";
}

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function toNumberOrUndefined(value: string | number) {
  return typeof value === "number" ? value : undefined;
}

function lineDefaults(): LineFormValues {
  return {
    kind: "revenue",
    basis: "fixed",
    recurrence: "one_time",
    party_id: null,
    rate: 0,
    unit_label: null,
    input_key: null,
    label: "",
    sort_order: undefined
  };
}

function lineToForm(line: SchemeLine): LineFormValues {
  return {
    kind: line.kind,
    basis: line.basis,
    recurrence: line.recurrence,
    party_id: line.party_id ?? null,
    rate: line.rate === null || line.rate === undefined ? null : Number(line.rate),
    unit_label: line.unit_label ?? null,
    input_key: line.input_key ?? null,
    label: line.label,
    sort_order: line.sort_order ?? undefined
  };
}

function milestoneDefaults(): MilestoneFormValues {
  return {
    seq: undefined,
    label: "",
    basis: "percent",
    value: undefined,
    bind_step_order: null,
    due_offset_days: null
  };
}

function milestoneToForm(milestone: SchemeMilestone): MilestoneFormValues {
  return {
    seq: milestone.seq,
    label: milestone.label,
    basis: milestone.basis,
    value: Number(milestone.value),
    bind_step_order: milestone.bind_step_order ?? null,
    due_offset_days: milestone.due_offset_days ?? null
  };
}

function parseAssumedInputs(raw: string): Record<string, number> {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, number>>((acc, part) => {
      const [key, value] = part.split("=").map((item) => item.trim());
      const numberValue = Number(value);
      if (key && Number.isFinite(numberValue)) {
        acc[key] = numberValue;
      }
      return acc;
    }, {});
}

function getPresetLabel(preset: (typeof DEAL_PRESETS)[number], language: string) {
  return language.startsWith("en") ? preset.nameEn : preset.name;
}

export function BusinessDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [versionModalOpened, setVersionModalOpened] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [assumedInputText, setAssumedInputText] = useState("");
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  const businessQuery = useQuery({
    queryKey: businessQueryKey(id),
    queryFn: () => getBusiness(id ?? ""),
    enabled: Boolean(id)
  });
  const partiesQuery = useQuery({
    queryKey: partiesQueryKey,
    queryFn: listDealParties
  });

  const versionForm = useForm<VersionFormValues>({
    resolver: zodResolver(schemeVersionCreateSchema) as Resolver<VersionFormValues>,
    defaultValues: { preset: "one_time", label: "", status: "active", effective_from: null, assumed_inputs: null }
  });

  const createVersionMutation = useMutation({
    mutationFn: ({ businessId, body }: { businessId: string; body: SchemeVersionCreateInput }) =>
      createSchemeVersion(businessId, body),
    onSuccess: async ({ scheme_version }) => {
      await queryClient.invalidateQueries({ queryKey: businessQueryKey(id) });
      setExpandedVersionId(scheme_version.id);
      closeVersionModal();
    }
  });
  const updateBusinessMutation = useMutation({
    mutationFn: ({ businessId, body }: { businessId: string; body: { status?: BusinessStatus; default_version_id?: string | null } }) =>
      updateBusiness(businessId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: businessQueryKey(id) });
    }
  });
  const updateVersionMutation = useMutation({
    mutationFn: ({ versionId, body }: { versionId: string; body: { status?: SchemeVersionStatus } }) =>
      updateSchemeVersion(versionId, body),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: businessQueryKey(id) }),
        queryClient.invalidateQueries({ queryKey: versionQueryKey(variables.versionId) })
      ]);
    }
  });

  const business = businessQuery.data?.business;
  const versions = business?.scheme_versions ?? [];
  const statusOptions = businessStatuses.map((status) => ({
    value: status,
    label: t(`businessStatus.${status}`)
  }));
  const versionStatusOptions = schemeVersionStatuses.map((status) => ({
    value: status,
    label: t(`schemeVersionStatus.${status}`)
  }));
  const presetOptions = DEAL_PRESETS.map((preset) => ({
    value: preset.key,
    label: getPresetLabel(preset, i18n.language)
  }));
  const loadError = businessQuery.error ?? partiesQuery.error;

  function openVersionModal() {
    setVersionError(null);
    setAssumedInputText("");
    versionForm.reset({ preset: "one_time", label: "", status: "active", effective_from: null, assumed_inputs: null });
    setVersionModalOpened(true);
  }

  function closeVersionModal() {
    setVersionModalOpened(false);
    setVersionError(null);
    setAssumedInputText("");
    versionForm.reset({ preset: "one_time", label: "", status: "active", effective_from: null, assumed_inputs: null });
  }

  const onVersionSubmit = versionForm.handleSubmit(async (values) => {
    if (!id) {
      return;
    }

    setVersionError(null);
    try {
      await createVersionMutation.mutateAsync({
        businessId: id,
        body: {
          ...(values as SchemeVersionCreateInput),
          assumed_inputs: assumedInputText.trim() ? parseAssumedInputs(assumedInputText) : undefined
        }
      });
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function setDefaultVersion(versionId: string) {
    if (!id) {
      return;
    }

    await updateBusinessMutation.mutateAsync({ businessId: id, body: { default_version_id: versionId } });
  }

  if (!id) {
    return null;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Button variant="light" onClick={() => navigate("/business-finance")}>
            {t("common.back")}
          </Button>
          <Title order={2}>{t("businessFinance.detail.title")}</Title>
        </Group>
        <Button onClick={openVersionModal}>{t("businessFinance.detail.addVersion")}</Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      {!business || businessQuery.isLoading ? (
        <Paper withBorder radius="md" p="lg">
          <Group justify="center">
            <Loader size="sm" />
          </Group>
        </Paper>
      ) : (
        <>
          <Paper withBorder radius="md" p="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
              <SummaryItem label={t("businessFinance.fields.name")} value={displayName(business.name, business.name_en)} />
              <SummaryItem label={t("businessFinance.fields.code")} value={business.code} />
              <SummaryItem label={t("businessFinance.fields.category")} value={business.category ?? "-"} />
              <SummaryItem label={t("businessFinance.fields.defaultVersion")} value={business.default_version_id ?? "-"} />
              <Stack gap={4}>
                <Text size="xs" c="dimmed">{t("businessFinance.fields.status")}</Text>
                <Select
                  size="xs"
                  data={statusOptions}
                  value={business.status}
                  onChange={(value) => {
                    if (value) {
                      void updateBusinessMutation.mutateAsync({
                        businessId: id,
                        body: { status: value as BusinessStatus }
                      });
                    }
                  }}
                />
              </Stack>
            </SimpleGrid>
          </Paper>

          <Paper withBorder radius="md">
            <ScrollArea>
              <Table miw={980} verticalSpacing="sm" striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("businessFinance.fields.label")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.status")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.effectiveFrom")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.profitRate")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.isDefault")}</Table.Th>
                    <Table.Th>{t("common.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {versions.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text ta="center" c="dimmed" py="lg">
                          {t("businessFinance.detail.noVersions")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    versions.map((version) => (
                      <VersionRow
                        key={version.id}
                        version={version}
                        businessDefaultVersionId={business.default_version_id}
                        expanded={expandedVersionId === version.id}
                        versionStatusOptions={versionStatusOptions}
                        onExpand={() => setExpandedVersionId(expandedVersionId === version.id ? null : version.id)}
                        onSetDefault={() => void setDefaultVersion(version.id)}
                        onStatusChange={(status) =>
                          void updateVersionMutation.mutateAsync({ versionId: version.id, body: { status } })
                        }
                      />
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>

          {expandedVersionId ? (
            <VersionEditor
              versionId={expandedVersionId}
              parties={partiesQuery.data?.deal_parties ?? []}
              onChanged={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: businessQueryKey(id) }),
                  queryClient.invalidateQueries({ queryKey: versionQueryKey(expandedVersionId) })
                ]);
              }}
            />
          ) : null}
        </>
      )}

      <Modal opened={versionModalOpened} onClose={closeVersionModal} title={t("businessFinance.detail.addVersion")} size="lg">
        <form onSubmit={onVersionSubmit}>
          {versionError ? (
            <Alert color="red" variant="light" mb="md">
              {versionError}
            </Alert>
          ) : null}
          <Stack gap="sm">
            <Controller
              control={versionForm.control}
              name="preset"
              render={({ field, fieldState }) => (
                <Select
                  label={t("businessFinance.fields.preset")}
                  data={presetOptions}
                  value={field.value ?? "one_time"}
                  onChange={(value) => field.onChange(value ?? "custom")}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Group grow align="flex-start">
              <Controller
                control={versionForm.control}
                name="label"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("businessFinance.fields.label")}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
              <Controller
                control={versionForm.control}
                name="status"
                render={({ field, fieldState }) => (
                  <Select
                    label={t("businessFinance.fields.status")}
                    data={versionStatusOptions}
                    value={field.value ?? "active"}
                    onChange={(value) => field.onChange(value ?? "active")}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </Group>
            <Controller
              control={versionForm.control}
              name="effective_from"
              render={({ field, fieldState }) => (
                <TextInput
                  label={t("businessFinance.fields.effectiveFrom")}
                  type="date"
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.currentTarget.value || null)}
                  error={fieldState.error?.message}
                />
              )}
            />
            <TextInput
              label={t("businessFinance.fields.assumedInputs")}
              placeholder="headcount=10, months=12"
              value={assumedInputText}
              onChange={(event) => setAssumedInputText(event.currentTarget.value)}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={closeVersionModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createVersionMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function VersionRow({
  version,
  businessDefaultVersionId,
  expanded,
  versionStatusOptions,
  onExpand,
  onSetDefault,
  onStatusChange
}: {
  version: VersionBrief;
  businessDefaultVersionId?: string | null | undefined;
  expanded: boolean;
  versionStatusOptions: { value: string; label: string }[];
  onExpand: () => void;
  onSetDefault: () => void;
  onStatusChange: (status: SchemeVersionStatus) => void;
}) {
  const { t } = useTranslation();
  const isDefault = businessDefaultVersionId === version.id;

  return (
    <Table.Tr>
      <Table.Td>{version.label}</Table.Td>
      <Table.Td>
        <Badge color={versionStatusColor(version.status)} variant="light">
          {t(`schemeVersionStatus.${version.status}`)}
        </Badge>
      </Table.Td>
      <Table.Td>{formatDate(version.effective_from)}</Table.Td>
      <Table.Td>{formatRate(version.profit_rate)}</Table.Td>
      <Table.Td>{isDefault ? t("common.yes") : t("common.no")}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" onClick={onExpand}>
            {expanded ? t("common.collapse") : t("businessFinance.detail.editVersion")}
          </Button>
          <Button size="xs" variant="light" disabled={isDefault} onClick={onSetDefault}>
            {t("businessFinance.detail.setDefault")}
          </Button>
          <Select
            size="xs"
            w={120}
            data={versionStatusOptions}
            value={version.status}
            onChange={(value) => {
              if (value) {
                onStatusChange(value as SchemeVersionStatus);
              }
            }}
          />
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function VersionEditor({
  versionId,
  parties,
  onChanged
}: {
  versionId: string;
  parties: DealParty[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editorError, setEditorError] = useState<string | null>(null);
  const versionQuery = useQuery({
    queryKey: versionQueryKey(versionId),
    queryFn: () => getSchemeVersion(versionId)
  });
  const createLineMutation = useMutation({
    mutationFn: (body: SchemeLineInputSchema) => createSchemeLine(versionId, body),
    onSuccess: onLineChanged
  });
  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: Partial<SchemeLineInputSchema> }) =>
      updateSchemeLine(lineId, body),
    onSuccess: onLineChanged
  });
  const deleteLineMutation = useMutation({
    mutationFn: deleteSchemeLine,
    onSuccess: onLineChanged
  });

  const version = versionQuery.data?.scheme_version;
  const lineForms = useMemo(
    () => new Map((version?.lines ?? []).map((line) => [line.id, lineToForm(line)])),
    [version?.lines]
  );
  const addForm = useForm<LineFormValues>({
    resolver: zodResolver(schemeLineSchema) as Resolver<LineFormValues>,
    defaultValues: lineDefaults()
  });
  const partyOptions = parties.map((party) => ({
    value: party.id,
    label: `${party.code} · ${displayName(party.name, party.name_en)}`
  }));
  const kindOptions = schemeLineKinds.map((kind) => ({ value: kind, label: t(`schemeLineKind.${kind}`) }));
  const basisOptions = schemeLineBases.map((basis) => ({ value: basis, label: t(`schemeLineBasis.${basis}`) }));
  const recurrenceOptions = schemeLineRecurrences.map((recurrence) => ({
    value: recurrence,
    label: t(`schemeLineRecurrence.${recurrence}`)
  }));

  async function onLineChanged() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: versionQueryKey(versionId) }),
      onChanged()
    ]);
  }

  const onAddSubmit = addForm.handleSubmit(async (values) => {
    setEditorError(null);
    try {
      await createLineMutation.mutateAsync(values as SchemeLineInputSchema);
      addForm.reset(lineDefaults());
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function saveLine(line: SchemeLine, values: LineFormValues) {
    setEditorError(null);
    try {
      await updateLineMutation.mutateAsync({ lineId: line.id, body: values as Partial<SchemeLineInputSchema> });
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function removeLine(lineId: string) {
    setEditorError(null);
    try {
      await deleteLineMutation.mutateAsync(lineId);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>{t("businessFinance.lines.title")}</Title>
              {versionQuery.isFetching ? <Loader size="sm" /> : null}
            </Group>
            {versionQuery.error || editorError ? (
              <Alert color="red" variant="light">
                {editorError ?? (versionQuery.error instanceof Error ? versionQuery.error.message : t("common.unknown_error"))}
              </Alert>
            ) : null}
            <ScrollArea>
              <Table miw={1200} verticalSpacing="sm" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("businessFinance.fields.kind")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.basis")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.recurrence")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.party")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.rate")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.unitLabel")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.inputKey")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.label")}</Table.Th>
                    <Table.Th>{t("common.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(version?.lines ?? []).length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={9}>
                        <Text ta="center" c="dimmed" py="md">
                          {t("businessFinance.lines.empty")}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    (version?.lines ?? []).map((line) => (
                      <EditableLineRow
                        key={line.id}
                        line={line}
                        defaults={lineForms.get(line.id) ?? lineToForm(line)}
                        partyOptions={partyOptions}
                        kindOptions={kindOptions}
                        basisOptions={basisOptions}
                        recurrenceOptions={recurrenceOptions}
                        onSave={saveLine}
                        onDelete={removeLine}
                        loading={updateLineMutation.isPending || deleteLineMutation.isPending}
                      />
                    ))
                  )}
                  <AddLineRow
                    form={addForm}
                    partyOptions={partyOptions}
                    kindOptions={kindOptions}
                    basisOptions={basisOptions}
                    recurrenceOptions={recurrenceOptions}
                    onSubmit={onAddSubmit}
                    loading={createLineMutation.isPending}
                  />
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Paper>
        <PreviewPanel version={version ?? null} />
      </SimpleGrid>
      <MilestonesPanel versionId={versionId} />
    </Stack>
  );
}

function MilestonesPanel({ versionId }: { versionId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const milestonesQuery = useQuery({
    queryKey: ["business-finance", "scheme-version-milestones", versionId],
    queryFn: () => listSchemeMilestones(versionId)
  });
  const createMutation = useMutation({
    mutationFn: (body: SchemeMilestoneInput) => createSchemeMilestone(versionId, body),
    onSuccess: onChanged
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SchemeMilestoneInput> }) => updateSchemeMilestone(id, body),
    onSuccess: onChanged
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSchemeMilestone,
    onSuccess: onChanged
  });
  const addForm = useForm<MilestoneFormValues>({ defaultValues: milestoneDefaults() });
  const milestoneForms = useMemo(
    () => new Map((milestonesQuery.data?.milestones ?? []).map((milestone) => [milestone.id, milestoneToForm(milestone)])),
    [milestonesQuery.data?.milestones]
  );
  const basisOptions = [
    { value: "percent", label: t("milestoneBasis.percent") },
    { value: "fixed", label: t("milestoneBasis.fixed") }
  ];

  async function onChanged() {
    await queryClient.invalidateQueries({ queryKey: ["business-finance", "scheme-version-milestones", versionId] });
  }

  function toInput(values: MilestoneFormValues): SchemeMilestoneInput {
    return {
      seq: values.seq ?? 1,
      label: values.label,
      basis: values.basis,
      value: values.value ?? 0,
      bind_step_order: values.bind_step_order,
      due_offset_days: values.due_offset_days
    };
  }

  const onAddSubmit = addForm.handleSubmit(async (values) => {
    setError(null);
    try {
      await createMutation.mutateAsync(toInput(values));
      addForm.reset(milestoneDefaults());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("common.unknown_error"));
    }
  });

  async function saveMilestone(milestone: SchemeMilestone, values: MilestoneFormValues) {
    setError(null);
    try {
      await updateMutation.mutateAsync({ id: milestone.id, body: toInput(values) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("common.unknown_error"));
    }
  }

  async function removeMilestone(id: string) {
    setError(null);
    try {
      await deleteMutation.mutateAsync(id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={3}>{t("businessFinance.milestones.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("businessFinance.milestones.hint")}
            </Text>
          </Stack>
          {milestonesQuery.isFetching ? <Loader size="sm" /> : null}
        </Group>
        {error || milestonesQuery.error ? (
          <Alert color="red" variant="light">
            {error ?? (milestonesQuery.error instanceof Error ? milestonesQuery.error.message : t("common.unknown_error"))}
          </Alert>
        ) : null}
        <ScrollArea>
          <Table miw={920} verticalSpacing="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("businessFinance.milestones.fields.seq")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.label")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.basis")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.value")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.bindStepOrder")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.dueOffsetDays")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(milestonesQuery.data?.milestones ?? []).length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="md">
                      {t("businessFinance.milestones.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                (milestonesQuery.data?.milestones ?? []).map((milestone) => (
                  <EditableMilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    defaults={milestoneForms.get(milestone.id) ?? milestoneToForm(milestone)}
                    basisOptions={basisOptions}
                    onSave={saveMilestone}
                    onDelete={removeMilestone}
                    loading={updateMutation.isPending || deleteMutation.isPending}
                  />
                ))
              )}
              <AddMilestoneRow
                form={addForm}
                basisOptions={basisOptions}
                onSubmit={onAddSubmit}
                loading={createMutation.isPending}
              />
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

function EditableMilestoneRow({
  milestone,
  defaults,
  basisOptions,
  onSave,
  onDelete,
  loading
}: {
  milestone: SchemeMilestone;
  defaults: MilestoneFormValues;
  basisOptions: { value: string; label: string }[];
  onSave: (milestone: SchemeMilestone, values: MilestoneFormValues) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<MilestoneFormValues>({ defaultValues: defaults });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const onSubmit = form.handleSubmit((values) => onSave(milestone, values));

  return (
    <Table.Tr>
      <MilestoneCells form={form} basisOptions={basisOptions} />
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" onClick={() => void onSubmit()} loading={loading}>
            {t("common.save")}
          </Button>
          <Button size="xs" variant="light" color="red" onClick={() => void onDelete(milestone.id)} loading={loading}>
            {t("common.delete")}
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function AddMilestoneRow({
  form,
  basisOptions,
  onSubmit,
  loading
}: {
  form: ReturnType<typeof useForm<MilestoneFormValues>>;
  basisOptions: { value: string; label: string }[];
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Table.Tr>
      <MilestoneCells form={form} basisOptions={basisOptions} />
      <Table.Td>
        <Button size="xs" onClick={() => void onSubmit()} loading={loading}>
          {t("businessFinance.milestones.add")}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

function MilestoneCells({
  form,
  basisOptions
}: {
  form: ReturnType<typeof useForm<MilestoneFormValues>>;
  basisOptions: { value: string; label: string }[];
}) {
  return (
    <>
      <Table.Td>
        <Controller
          control={form.control}
          name="seq"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={90}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(typeof value === "number" ? value : undefined)}
              min={1}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="label"
          render={({ field }) => (
            <TextInput size="xs" w={180} value={field.value} onChange={field.onChange} />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="basis"
          render={({ field }) => (
            <Select size="xs" w={130} data={basisOptions} value={field.value} onChange={(value) => field.onChange(value ?? "percent")} />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="value"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={120}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(typeof value === "number" ? value : undefined)}
              min={0}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="bind_step_order"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={120}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(typeof value === "number" ? value : null)}
              min={1}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="due_offset_days"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={120}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(typeof value === "number" ? value : null)}
            />
          )}
        />
      </Table.Td>
    </>
  );
}

function EditableLineRow({
  line,
  defaults,
  partyOptions,
  kindOptions,
  basisOptions,
  recurrenceOptions,
  onSave,
  onDelete,
  loading
}: {
  line: SchemeLine;
  defaults: LineFormValues;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  basisOptions: { value: string; label: string }[];
  recurrenceOptions: { value: string; label: string }[];
  onSave: (line: SchemeLine, values: LineFormValues) => Promise<void>;
  onDelete: (lineId: string) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<LineFormValues>({
    defaultValues: defaults
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const onSubmit = form.handleSubmit((values) => onSave(line, values));

  return (
    <Table.Tr>
      <LineCells
        form={form}
        partyOptions={partyOptions}
        kindOptions={kindOptions}
        basisOptions={basisOptions}
        recurrenceOptions={recurrenceOptions}
      />
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" onClick={() => void onSubmit()} loading={loading}>
            {t("common.save")}
          </Button>
          <Button size="xs" variant="light" color="red" onClick={() => void onDelete(line.id)} loading={loading}>
            {t("common.delete")}
          </Button>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function AddLineRow({
  form,
  partyOptions,
  kindOptions,
  basisOptions,
  recurrenceOptions,
  onSubmit,
  loading
}: {
  form: ReturnType<typeof useForm<LineFormValues>>;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  basisOptions: { value: string; label: string }[];
  recurrenceOptions: { value: string; label: string }[];
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Table.Tr>
      <LineCells
        form={form}
        partyOptions={partyOptions}
        kindOptions={kindOptions}
        basisOptions={basisOptions}
        recurrenceOptions={recurrenceOptions}
      />
      <Table.Td>
        <Button size="xs" onClick={() => void onSubmit()} loading={loading}>
          {t("businessFinance.lines.add")}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

function LineCells({
  form,
  partyOptions,
  kindOptions,
  basisOptions,
  recurrenceOptions
}: {
  form: ReturnType<typeof useForm<LineFormValues>>;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  basisOptions: { value: string; label: string }[];
  recurrenceOptions: { value: string; label: string }[];
}) {
  const { t } = useTranslation();

  return (
    <>
      <Table.Td>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Select size="xs" w={120} data={kindOptions} value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="basis"
          render={({ field }) => (
            <Select size="xs" w={160} data={basisOptions} value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="recurrence"
          render={({ field }) => (
            <Select size="xs" w={130} data={recurrenceOptions} value={field.value ?? null} onChange={field.onChange} />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="party_id"
          render={({ field }) => (
            <Select
              size="xs"
              w={170}
              data={partyOptions}
              value={field.value ?? null}
              onChange={(value) => field.onChange(value)}
              clearable
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="rate"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={110}
              value={field.value ?? ""}
              onChange={(value) => field.onChange(toNumberOrUndefined(value))}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="unit_label"
          render={({ field }) => (
            <TextInput
              size="xs"
              w={110}
              value={field.value ?? ""}
              onChange={(event) => field.onChange(event.currentTarget.value || null)}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="input_key"
          render={({ field }) => (
            <TextInput
              size="xs"
              w={120}
              value={field.value ?? ""}
              placeholder={t("businessFinance.preview.inputKey")}
              onChange={(event) => field.onChange(event.currentTarget.value || null)}
            />
          )}
        />
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="label"
          render={({ field }) => (
            <TextInput size="xs" w={160} value={field.value ?? ""} onChange={field.onChange} />
          )}
        />
      </Table.Td>
    </>
  );
}

function PreviewPanel({ version }: { version: SchemeVersion | null }) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [debouncedInputs] = useDebouncedValue(inputs, 400);

  useEffect(() => {
    const assumed = version?.assumed_inputs ?? {};
    const nextInputs: Record<string, number> = {};
    Object.entries(assumed).forEach(([key, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        nextInputs[key] = value;
      }
    });
    setInputs(nextInputs);
  }, [version?.id, version?.assumed_inputs]);

  const previewQuery = useQuery({
    queryKey: ["business-finance", "scheme-version-preview", version?.id, debouncedInputs],
    queryFn: () => previewSchemeVersion(version?.id ?? "", debouncedInputs as DealInputsInput),
    enabled: Boolean(version?.id)
  });

  function updateInput(key: string, value: string | number) {
    setInputs((current) => {
      const next = { ...current };
      const numberValue = typeof value === "number" ? value : undefined;
      if (numberValue === undefined) {
        delete next[key];
      } else {
        next[key] = numberValue;
      }
      return next;
    });
  }

  const economics = previewQuery.data?.economics;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("businessFinance.preview.title")}</Title>
          {previewQuery.isFetching ? <Loader size="sm" /> : null}
        </Group>
        {previewQuery.error ? (
          <Alert color="red" variant="light">
            {previewQuery.error instanceof Error ? previewQuery.error.message : t("common.unknown_error")}
          </Alert>
        ) : null}
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          {commonInputKeys.map((key) => (
            <NumberInput
              key={key}
              label={key}
              value={inputs[key] ?? ""}
              onChange={(value) => updateInput(key, value)}
            />
          ))}
        </SimpleGrid>
        {economics ? <PreviewTotals economics={economics} /> : null}
      </Stack>
    </Paper>
  );
}

function PreviewTotals({ economics }: { economics: DealEconomics }) {
  const { t } = useTranslation();
  const recurrences: SchemeLineRecurrence[] = ["one_time", "monthly", "per_event"];

  return (
    <Stack gap="md">
      <ScrollArea>
        <Table miw={620} verticalSpacing="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("businessFinance.fields.recurrence")}</Table.Th>
              <Table.Th>{t("businessFinance.preview.revenue")}</Table.Th>
              <Table.Th>{t("businessFinance.preview.cost")}</Table.Th>
              <Table.Th>{t("businessFinance.preview.commission")}</Table.Th>
              <Table.Th>{t("businessFinance.preview.profit")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {recurrences.map((recurrence) => {
              const totals = economics.totals.per_recurrence[recurrence];
              return (
                <Table.Tr key={recurrence}>
                  <Table.Td>{t(`schemeLineRecurrence.${recurrence}`)}</Table.Td>
                  <Table.Td>{totals.revenue.toFixed(2)}</Table.Td>
                  <Table.Td>{totals.cost.toFixed(2)}</Table.Td>
                  <Table.Td>{totals.commission.toFixed(2)}</Table.Td>
                  <Table.Td>{totals.profit.toFixed(2)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <SummaryItem label={t("businessFinance.preview.expected")} value={economics.totals.expected.profit.toFixed(2)} />
        <SummaryItem label={t("businessFinance.preview.profitRate")} value={`${(economics.totals.profit_rate * 100).toFixed(2)}%`} />
        <SummaryItem
          label={t("businessFinance.preview.openEnded")}
          value={economics.totals.has_open_ended ? t("common.yes") : t("common.no")}
        />
      </SimpleGrid>
      {economics.totals.has_open_ended ? (
        <Alert color="yellow" variant="light">
          {t("businessFinance.preview.openEndedHint")}
        </Alert>
      ) : null}
    </Stack>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600}>{value}</Text>
    </Stack>
  );
}
