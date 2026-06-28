import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
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
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  DEAL_PRESETS,
  currencies,
  schemeLineKinds,
  schemeLineRecurrences,
  schemeLineSchema,
  schemeVersionCreateSchema,
  type BusinessStatus,
  type Currency,
  type DealInputsInput,
  type SchemeLineBasis,
  type SchemeLineInputSchema,
  type SchemeLineKind,
  type SchemeLineRecurrence,
  type SchemeVersionCreateInput,
  type SchemeVersionUpdateInput,
  type SchemeVersionStatus
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { getCollectionItems, type CollectionItem } from "../../api/collectionItems";
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
  label?: string | undefined;
  sort_order?: number | undefined;
};

type MilestoneSplitDraftValue = {
  basis: "percent" | "fixed";
  value: number | "";
};

type MilestoneSplitDraft = Record<string, MilestoneSplitDraftValue>;

type MilestoneFormValues = {
  seq: number | undefined;
  label: string;
  collection_item_id: string | null;
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
const milestonesQueryKey = (versionId: string) => ["business-finance", "scheme-version-milestones", versionId] as const;
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
    label: line.label,
    sort_order: line.sort_order ?? undefined
  };
}

function lineToInput(line: SchemeLine): SchemeLineInputSchema {
  return {
    kind: line.kind,
    basis: line.basis,
    recurrence: line.recurrence,
    party_id: line.party_id ?? null,
    rate: line.rate === null || line.rate === undefined ? null : Number(line.rate),
    unit_label: line.unit_label ?? null,
    input_key: line.input_key ?? null,
    milestone_split: line.milestone_split ?? null,
    label: line.label,
    note: line.note ?? null,
    sort_order: line.sort_order ?? undefined
  };
}

function milestoneDefaults(): MilestoneFormValues {
  return {
    seq: undefined,
    label: "",
    collection_item_id: null,
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
    collection_item_id: milestone.collection_item_id ?? null,
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
    mutationFn: ({
      businessId,
      body
    }: {
      businessId: string;
      body: { status?: BusinessStatus; currency?: Currency; default_version_id?: string | null };
    }) => updateBusiness(businessId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: businessQueryKey(id) });
    }
  });
  const updateVersionMutation = useMutation({
    mutationFn: ({ versionId, body }: { versionId: string; body: SchemeVersionUpdateInput }) =>
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
  // 版本对外标识 = 业务码 + 三位序号(如 ep001),按列表顺序稳定编号
  const versionLabelById = useMemo(
    () =>
      new Map(
        versions.map((version, index) => [
          version.id,
          `${business?.code ?? ""}${String(index + 1).padStart(3, "0")}`
        ])
      ),
    [versions, business?.code]
  );
  const presetOptions = DEAL_PRESETS.map((preset) => ({
    value: preset.key,
    label: getPresetLabel(preset, i18n.language)
  }));
  const currencyOptions = currencies.map((currency) => ({
    value: currency,
    label: t(`currency.${currency}`)
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

  async function renameVersionLabel(versionId: string, label: string) {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      return;
    }

    await updateVersionMutation.mutateAsync({ versionId, body: { label: trimmedLabel } });
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
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }}>
              <SummaryItem label={t("businessFinance.fields.name")} value={displayName(business.name, business.name_en)} />
              <SummaryItem label={t("businessFinance.fields.code")} value={business.code} />
              <SummaryItem label={t("businessFinance.fields.category")} value={business.category ?? "-"} />
              <SummaryItem
                label={t("businessFinance.fields.defaultVersion")}
                value={
                  business.default_version_id
                    ? versionLabelById.get(business.default_version_id) ?? business.default_version_id
                    : "-"
                }
              />
              <Stack gap={4}>
                <Text size="xs" c="dimmed">{t("businessFinance.fields.currency")}</Text>
                <Select
                  size="xs"
                  data={currencyOptions}
                  value={business.currency ?? "SGD"}
                  allowDeselect={false}
                  onChange={(value) => {
                    if (value) {
                      void updateBusinessMutation.mutateAsync({
                        businessId: id,
                        body: { currency: value as Currency }
                      });
                    }
                  }}
                />
              </Stack>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">{t("businessFinance.fields.status")}</Text>
                <Switch
                  size="md"
                  checked={business.status === "active"}
                  label={t(`businessStatus.${business.status}`)}
                  onChange={(event) => {
                    void updateBusinessMutation.mutateAsync({
                      businessId: id,
                      body: { status: (event.currentTarget.checked ? "active" : "closed") as BusinessStatus }
                    });
                  }}
                />
              </Stack>
            </SimpleGrid>
          </Paper>

          <Paper withBorder radius="md">
            <ScrollArea>
              <Table miw={980} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
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
                        displayLabel={versionLabelById.get(version.id) ?? version.label}
                        businessDefaultVersionId={business.default_version_id}
                        expanded={expandedVersionId === version.id}
                        onExpand={() => setExpandedVersionId(expandedVersionId === version.id ? null : version.id)}
                        onSetDefault={() => void setDefaultVersion(version.id)}
                        onStatusChange={(status) =>
                          void updateVersionMutation.mutateAsync({ versionId: version.id, body: { status } })
                        }
                        onRenameLabel={(versionId, label) => void renameVersionLabel(versionId, label)}
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
              currency={business.currency ?? "SGD"}
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
                    label={t("businessFinance.fields.versionName")}
                    placeholder={t("businessFinance.fields.versionNamePlaceholder")}
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
                render={({ field }) => (
                  <Switch
                    mt="lg"
                    label={t(`schemeVersionStatus.${(field.value ?? "active") as SchemeVersionStatus}`)}
                    checked={(field.value ?? "active") === "active"}
                    onChange={(event) => field.onChange(event.currentTarget.checked ? "active" : "closed")}
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
  displayLabel,
  businessDefaultVersionId,
  expanded,
  onExpand,
  onSetDefault,
  onStatusChange,
  onRenameLabel
}: {
  version: VersionBrief;
  displayLabel: string;
  businessDefaultVersionId?: string | null | undefined;
  expanded: boolean;
  onExpand: () => void;
  onSetDefault: () => void;
  onStatusChange: (status: SchemeVersionStatus) => void;
  onRenameLabel: (versionId: string, label: string) => void;
}) {
  const { t } = useTranslation();
  const [labelDraft, setLabelDraft] = useState(version.label);
  const isDefault = businessDefaultVersionId === version.id;

  useEffect(() => {
    setLabelDraft(version.label);
  }, [version.label]);

  function commitLabelRename() {
    const trimmedLabel = labelDraft.trim();
    if (trimmedLabel && trimmedLabel !== version.label) {
      onRenameLabel(version.id, trimmedLabel);
    }
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Stack gap={4}>
          <Text fw={600}>{displayLabel}</Text>
          <TextInput
            size="xs"
            value={labelDraft}
            placeholder={t("businessFinance.fields.versionNamePlaceholder")}
            onChange={(event) => setLabelDraft(event.currentTarget.value)}
            onBlur={commitLabelRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </Stack>
      </Table.Td>
      <Table.Td>
        <Switch
          size="sm"
          checked={version.status === "active"}
          label={t(`schemeVersionStatus.${version.status}`)}
          onChange={(event) => onStatusChange(event.currentTarget.checked ? "active" : "closed")}
        />
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
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function VersionEditor({
  versionId,
  currency,
  parties,
  onChanged
}: {
  versionId: string;
  currency: Currency;
  parties: DealParty[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editorError, setEditorError] = useState<string | null>(null);
  const [splitLine, setSplitLine] = useState<SchemeLine | null>(null);
  const [splitDraft, setSplitDraft] = useState<MilestoneSplitDraft>({});
  const versionQuery = useQuery({
    queryKey: versionQueryKey(versionId),
    queryFn: () => getSchemeVersion(versionId)
  });
  const milestonesQuery = useQuery({
    queryKey: milestonesQueryKey(versionId),
    queryFn: () => listSchemeMilestones(versionId),
    enabled: Boolean(splitLine)
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
      // 不再用每单录入/单位:固定价靠 rate,显式清空 input_key/unit_label
      await createLineMutation.mutateAsync({ ...values, input_key: null, unit_label: null } as SchemeLineInputSchema);
      addForm.reset(lineDefaults());
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function saveLine(line: SchemeLine, values: LineFormValues) {
    setEditorError(null);
    try {
      await updateLineMutation.mutateAsync({
        lineId: line.id,
        body: { ...values, input_key: null, unit_label: null } as Partial<SchemeLineInputSchema>
      });
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

  function openSplitModal(line: SchemeLine) {
    const split = line.milestone_split ?? {};
    setSplitDraft(
      Object.entries(split).reduce<MilestoneSplitDraft>((acc, [seq, splitValue]) => {
        acc[seq] = splitValue;
        return acc;
      }, {})
    );
    setSplitLine(line);
    setEditorError(null);
  }

  function closeSplitModal() {
    setSplitLine(null);
    setSplitDraft({});
  }

  async function saveSplit() {
    if (!splitLine) {
      return;
    }

    const milestoneSplit = Object.entries(splitDraft).reduce<
      Record<string, { basis: "percent" | "fixed"; value: number }>
    >((acc, [seq, splitValue]) => {
      if (typeof splitValue.value === "number") {
        acc[seq] = { basis: splitValue.basis, value: splitValue.value };
      }
      return acc;
    }, {});

    setEditorError(null);
    try {
      await updateLineMutation.mutateAsync({
        lineId: splitLine.id,
        body: {
          ...lineToInput(splitLine),
          milestone_split: Object.keys(milestoneSplit).length > 0 ? milestoneSplit : null
        }
      });
      closeSplitModal();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <>
      <Tabs defaultValue="lines" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="lines">{t("businessFinance.lines.title")}</Tabs.Tab>
          <Tabs.Tab value="preview">{t("businessFinance.preview.title")}</Tabs.Tab>
          <Tabs.Tab value="milestones">{t("businessFinance.milestones.title")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lines" pt="md">
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
              <Table miw={860} verticalSpacing="sm" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("businessFinance.fields.kind")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.basis")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.recurrence")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.party")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.rate")}</Table.Th>
                    <Table.Th>{t("businessFinance.fields.label")}</Table.Th>
                    <Table.Th>{t("common.actions")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(version?.lines ?? []).length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
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
                        currency={currency}
                        recurrenceOptions={recurrenceOptions}
                        onSave={saveLine}
                        onDelete={removeLine}
                        onOpenMilestoneSplit={openSplitModal}
                        loading={updateLineMutation.isPending || deleteLineMutation.isPending}
                      />
                    ))
                  )}
                  <AddLineRow
                    form={addForm}
                    partyOptions={partyOptions}
                    kindOptions={kindOptions}
                    currency={currency}
                    recurrenceOptions={recurrenceOptions}
                    onSubmit={onAddSubmit}
                    loading={createLineMutation.isPending}
                  />
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Paper>
        </Tabs.Panel>
        <Tabs.Panel value="preview" pt="md">
          <PreviewPanel version={version ?? null} />
        </Tabs.Panel>
        <Tabs.Panel value="milestones" pt="md">
          <MilestonesPanel versionId={versionId} />
        </Tabs.Panel>
      </Tabs>

      <MilestoneSplitModal
        opened={Boolean(splitLine)}
        milestones={milestonesQuery.data?.milestones ?? []}
        loading={milestonesQuery.isLoading}
        error={milestonesQuery.error}
        draft={splitDraft}
        currency={currency}
        onChange={setSplitDraft}
        onClose={closeSplitModal}
        onSave={() => void saveSplit()}
        saving={updateLineMutation.isPending}
      />
    </>
  );
}

function MilestoneSplitModal({
  opened,
  milestones,
  loading,
  error,
  draft,
  currency,
  onChange,
  onClose,
  onSave,
  saving
}: {
  opened: boolean;
  milestones: SchemeMilestone[];
  loading: boolean;
  error: unknown;
  draft: MilestoneSplitDraft;
  currency: Currency;
  onChange: (draft: MilestoneSplitDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const totalPercent = Object.values(draft).reduce<number>(
    (sum, splitValue) =>
      splitValue.basis === "percent" && typeof splitValue.value === "number" ? sum + splitValue.value : sum,
    0
  );
  const hasPercentSplit = Object.values(draft).some(
    (splitValue) => splitValue.basis === "percent" && typeof splitValue.value === "number"
  );
  const hasFixedSplit = Object.values(draft).some(
    (splitValue) => splitValue.basis === "fixed" && typeof splitValue.value === "number"
  );
  const allCustomSplitsArePercent = hasPercentSplit && !hasFixedSplit;
  const basisOptions = [
    { value: "percent", label: t("businessFinance.milestoneSplit.basisPercent") },
    { value: "fixed", label: t("businessFinance.milestoneSplit.basisFixed") }
  ];

  function updateSeq(seq: number, value: string | number) {
    const key = String(seq);
    const current = draft[key] ?? { basis: "percent", value: "" };
    onChange({
      ...draft,
      [key]: { ...current, value: typeof value === "number" ? value : "" }
    });
  }

  function updateBasis(seq: number, basis: "percent" | "fixed") {
    const key = String(seq);
    const current = draft[key] ?? { basis: "percent", value: "" };
    onChange({
      ...draft,
      [key]: { ...current, basis }
    });
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("businessFinance.milestoneSplit.title")} size="md">
      <Stack gap="md">
        {error ? (
          <Alert color="red" variant="light">
            {error instanceof Error ? error.message : t("common.unknown_error")}
          </Alert>
        ) : null}
        {loading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : milestones.length === 0 ? (
          <Alert color="yellow" variant="light">
            {t("businessFinance.milestoneSplit.empty")}
          </Alert>
        ) : (
          <>
            <Stack gap="sm">
              {milestones.map((milestone) => (
                <Group key={milestone.id} justify="space-between" align="flex-end" wrap="nowrap">
                  <Stack gap={0}>
                    <Text fw={500}>{milestone.label}</Text>
                    <Text size="xs" c="dimmed">
                      {t("businessFinance.milestones.fields.seq")} {milestone.seq}
                    </Text>
                  </Stack>
                  <Group gap="xs" wrap="nowrap">
                    <Select
                      aria-label={t("businessFinance.milestoneSplit.basis")}
                      data={basisOptions}
                      value={draft[String(milestone.seq)]?.basis ?? "percent"}
                      onChange={(value) => updateBasis(milestone.seq, value === "fixed" ? "fixed" : "percent")}
                      allowDeselect={false}
                      w={120}
                    />
                    <NumberInput
                      value={draft[String(milestone.seq)]?.value ?? ""}
                      onChange={(value) => updateSeq(milestone.seq, value)}
                      min={0}
                      step={draft[String(milestone.seq)]?.basis === "fixed" ? 100 : 1}
                      decimalScale={2}
                      suffix={draft[String(milestone.seq)]?.basis === "fixed" ? ` ${currency}` : "%"}
                      w={150}
                    />
                  </Group>
                </Group>
              ))}
            </Stack>
            {allCustomSplitsArePercent ? (
              <Group justify="space-between">
                <Text fw={600}>{t("businessFinance.milestoneSplit.totalPercent")}</Text>
                <Text fw={600}>{totalPercent.toFixed(2)}%</Text>
              </Group>
            ) : null}
            <Text size="sm" c="dimmed">
              {t("businessFinance.milestoneSplit.mixedHint")}
            </Text>
            {allCustomSplitsArePercent && Math.abs(totalPercent - 100) > 0.000001 ? (
              <Alert color="yellow" variant="light">
                {t("businessFinance.milestoneSplit.totalWarning")}
              </Alert>
            ) : null}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="light" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSave} loading={saving} disabled={loading || Boolean(error) || milestones.length === 0}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function MilestonesPanel({ versionId }: { versionId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const milestonesQuery = useQuery({
    queryKey: milestonesQueryKey(versionId),
    queryFn: () => listSchemeMilestones(versionId)
  });
  const collectionItemsQuery = useQuery({
    queryKey: ["collection-items"],
    queryFn: getCollectionItems
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
  const collectionItems = collectionItemsQuery.data?.collection_items ?? [];
  const collectionItemOptions = collectionItems.map((item) => ({
    value: item.id,
    label: displayName(item.name, item.name_en)
  }));
  const collectionItemById = useMemo(
    () => new Map(collectionItems.map((item) => [item.id, item])),
    [collectionItems]
  );

  async function onChanged() {
    await queryClient.invalidateQueries({ queryKey: milestonesQueryKey(versionId) });
  }

  function toInput(values: MilestoneFormValues): SchemeMilestoneInput {
    // 显示名直接跟随收款名目(已去掉手填的标签覆盖框)
    const item = values.collection_item_id ? collectionItemById.get(values.collection_item_id) : undefined;
    return {
      seq: values.seq ?? 1,
      label: item ? item.name : values.label,
      collection_item_id: values.collection_item_id,
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
        {error || milestonesQuery.error || collectionItemsQuery.error ? (
          <Alert color="red" variant="light">
            {error ??
              (milestonesQuery.error instanceof Error
                ? milestonesQuery.error.message
                : collectionItemsQuery.error instanceof Error
                  ? collectionItemsQuery.error.message
                  : t("common.unknown_error"))}
          </Alert>
        ) : null}
        <ScrollArea>
          <Table miw={900} verticalSpacing="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("businessFinance.milestones.fields.seq")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.collectionItem")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.basis")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.value")}</Table.Th>
                <Table.Th>{t("businessFinance.milestones.fields.dueOffsetDays")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(milestonesQuery.data?.milestones ?? []).length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
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
                    collectionItemOptions={collectionItemOptions}
                    collectionItemById={collectionItemById}
                    onSave={saveMilestone}
                    onDelete={removeMilestone}
                    loading={updateMutation.isPending || deleteMutation.isPending}
                  />
                ))
              )}
              <AddMilestoneRow
                form={addForm}
                basisOptions={basisOptions}
                collectionItemOptions={collectionItemOptions}
                collectionItemById={collectionItemById}
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
  collectionItemOptions,
  collectionItemById,
  onSave,
  onDelete,
  loading
}: {
  milestone: SchemeMilestone;
  defaults: MilestoneFormValues;
  basisOptions: { value: string; label: string }[];
  collectionItemOptions: { value: string; label: string }[];
  collectionItemById: Map<string, CollectionItem>;
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
      <MilestoneCells
        form={form}
        basisOptions={basisOptions}
        collectionItemOptions={collectionItemOptions}
        collectionItemById={collectionItemById}
      />
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
  collectionItemOptions,
  collectionItemById,
  onSubmit,
  loading
}: {
  form: ReturnType<typeof useForm<MilestoneFormValues>>;
  basisOptions: { value: string; label: string }[];
  collectionItemOptions: { value: string; label: string }[];
  collectionItemById: Map<string, CollectionItem>;
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Table.Tr>
      <MilestoneCells
        form={form}
        basisOptions={basisOptions}
        collectionItemOptions={collectionItemOptions}
        collectionItemById={collectionItemById}
      />
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
  basisOptions,
  collectionItemOptions,
  collectionItemById
}: {
  form: ReturnType<typeof useForm<MilestoneFormValues>>;
  basisOptions: { value: string; label: string }[];
  collectionItemOptions: { value: string; label: string }[];
  collectionItemById: Map<string, CollectionItem>;
}) {
  const { t } = useTranslation();

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
          name="collection_item_id"
          render={({ field }) => (
            <Select
              size="xs"
              w={220}
              placeholder={t("businessFinance.fields.collectionItem")}
              data={collectionItemOptions}
              value={field.value ?? null}
              onChange={(value) => {
                field.onChange(value);
                const item = value ? collectionItemById.get(value) : undefined;
                form.setValue("label", item ? item.name : "", { shouldDirty: true });
              }}
              searchable
              clearable
            />
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

// 「基准」选项按类型收窄:分成只给 固定金额/按收入比例;成本不含毛利;收入含毛利
function basesForKind(kind: SchemeLineKind | undefined): SchemeLineBasis[] {
  // 分成可固定金额或按收入比例;收入/成本只有固定金额(价格不同→新建版本)
  if (kind === "commission") {
    return ["fixed", "percent_of_revenue"];
  }
  return ["fixed"];
}

function EditableLineRow({
  line,
  defaults,
  partyOptions,
  kindOptions,
  currency,
  recurrenceOptions,
  onSave,
  onDelete,
  onOpenMilestoneSplit,
  loading
}: {
  line: SchemeLine;
  defaults: LineFormValues;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  currency: Currency;
  recurrenceOptions: { value: string; label: string }[];
  onSave: (line: SchemeLine, values: LineFormValues) => Promise<void>;
  onDelete: (lineId: string) => Promise<void>;
  onOpenMilestoneSplit: (line: SchemeLine) => void;
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
        currency={currency}
        recurrenceOptions={recurrenceOptions}
      />
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Button size="xs" variant="light" onClick={() => void onSubmit()} loading={loading}>
            {t("common.save")}
          </Button>
          {line.kind === "commission" ? (
            <Button size="xs" variant="light" onClick={() => onOpenMilestoneSplit(line)}>
              {t("businessFinance.milestoneSplit.title")}
            </Button>
          ) : null}
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
  currency,
  recurrenceOptions,
  onSubmit,
  loading
}: {
  form: ReturnType<typeof useForm<LineFormValues>>;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  currency: Currency;
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
        currency={currency}
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
  currency,
  recurrenceOptions
}: {
  form: ReturnType<typeof useForm<LineFormValues>>;
  partyOptions: { value: string; label: string }[];
  kindOptions: { value: string; label: string }[];
  currency: Currency;
  recurrenceOptions: { value: string; label: string }[];
}) {
  const { t } = useTranslation();
  const watchedKind = form.watch("kind");
  const watchedBasis = form.watch("basis");
  const isCommission = watchedKind === "commission";
  const isPercent = watchedBasis === "percent_of_revenue";
  // 基准选项按类型收窄;若当前值不在列表(历史数据)也补进去,避免下拉空白
  const allowedBases = basesForKind(watchedKind);
  const basisValues = watchedBasis && !allowedBases.includes(watchedBasis)
    ? [...allowedBases, watchedBasis]
    : allowedBases;
  const basisOptions = basisValues.map((basis) => ({ value: basis, label: t(`schemeLineBasis.${basis}`) }));
  const rateSuffix = isPercent ? "%" : currency;

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
        {isCommission ? (
          <Controller
            control={form.control}
            name="party_id"
            render={({ field }) => (
              <Select
                size="xs"
                w={170}
                placeholder={t("businessFinance.fields.partyPlaceholder")}
                data={partyOptions}
                value={field.value ?? null}
                onChange={(value) => field.onChange(value)}
                clearable
              />
            )}
          />
        ) : (
          <Text size="xs" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Controller
          control={form.control}
          name="rate"
          render={({ field }) => (
            <NumberInput
              size="xs"
              w={120}
              hideControls
              value={field.value ?? ""}
              onChange={(value) => field.onChange(toNumberOrUndefined(value))}
              rightSection={
                <Text size="xs" c="dimmed" pr={6}>
                  {rateSuffix}
                </Text>
              }
              rightSectionWidth={rateSuffix.length > 1 ? 42 : 24}
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
