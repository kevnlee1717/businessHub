import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileButton,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  brochureKeys,
  createBrochure,
  createBrochureCategory,
  createBrochureIndustry,
  deleteBrochureCategory,
  deleteBrochureIndustry,
  updateBrochure,
  updateBrochureCategory,
  updateBrochureIndustry,
  uploadBrochureVersion,
  type Brochure,
  type BrochureDictionary,
  type BrochureVersion
} from "../../api/brochures";

type Dict = Record<string, unknown>;
type Option = { value: string; label: string };

function useSimpleForm(initial: Dict = {}) {
  const [values, setValues] = useState<Dict>(initial);
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));
  return { values, setValues, set };
}

function emptyToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function fileKind(file?: Pick<BrochureVersion, "mime" | "filename" | "url"> | null) {
  const mime = file?.mime ?? "";
  const filename = file?.filename?.toLowerCase() ?? "";
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename)) return "image";
  return "other";
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

export function formatBrochureDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function FilePreviewModal({
  opened,
  version,
  onClose
}: {
  opened: boolean;
  version: BrochureVersion | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const kind = fileKind(version);

  return (
    <Modal opened={opened} onClose={onClose} title={version?.filename ?? t("brochure.preview")} size="xl">
      {version?.url ? (
        kind === "pdf" ? (
          <iframe src={version.url} title={version.filename} style={{ width: "100%", height: "76vh", border: 0 }} />
        ) : kind === "image" ? (
          <img src={version.url} alt={version.filename} style={{ maxWidth: "100%", maxHeight: "76vh", display: "block", margin: "0 auto" }} />
        ) : (
          <Stack gap="sm">
            <Text c="dimmed">{t("brochure.previewUnsupported")}</Text>
            <Button component="a" href={version.url} target="_blank" rel="noreferrer">
              {t("brochure.download")}
            </Button>
          </Stack>
        )
      ) : null}
    </Modal>
  );
}

function brochureDefaults(brochure?: Brochure | null): Dict {
  return {
    name: brochure?.name ?? "",
    industry_id: brochure?.industry_id ?? null,
    category_id: brochure?.category_id ?? null,
    notes: brochure?.notes ?? "",
    sort_order: brochure?.sort_order ?? 0,
    file: null
  };
}

export function BrochureFormModal({
  opened,
  brochure,
  industries,
  categories,
  onClose
}: {
  opened: boolean;
  brochure?: Brochure | null;
  industries: BrochureDictionary[];
  categories: BrochureDictionary[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useSimpleForm(brochureDefaults(brochure));
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(brochure);

  useEffect(() => {
    if (opened) {
      form.setValues(brochureDefaults(brochure));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, brochure?.id]);

  const createMutation = useMutation({
    mutationFn: createBrochure,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      onClose();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Dict }) => updateBrochure(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      onClose();
    }
  });

  const industryOptions = useMemo<Option[]>(() => industries.map((row) => ({ value: row.id, label: row.name })), [industries]);
  const categoryOptions = useMemo<Option[]>(() => categories.map((row) => ({ value: row.id, label: row.name })), [categories]);
  const saving = createMutation.isPending || updateMutation.isPending;
  const selectedFile = form.values.file instanceof File ? form.values.file : null;

  async function submit() {
    setFormError(null);
    const name = textValue(form.values.name).trim();
    if (!name) {
      setFormError(t("brochure.validation.nameRequired"));
      return;
    }

    try {
      if (brochure) {
        await updateMutation.mutateAsync({
          id: brochure.id,
          body: {
            name,
            industry_id: form.values.industry_id ?? null,
            category_id: form.values.category_id ?? null,
            notes: emptyToNull(form.values.notes),
            sort_order: numberValue(form.values.sort_order)
          }
        });
        return;
      }

      if (!selectedFile) {
        setFormError(t("brochure.validation.fileRequired"));
        return;
      }

      await createMutation.mutateAsync({
        name,
        industry_id: (form.values.industry_id as string | null | undefined) ?? null,
        category_id: (form.values.category_id as string | null | undefined) ?? null,
        notes: emptyToNull(form.values.notes) as string | null,
        sort_order: numberValue(form.values.sort_order),
        file: selectedFile
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? t("brochure.edit") : t("brochure.add")} size="lg">
      <Stack gap="md">
        {formError ? <Alert color="red" variant="light">{formError}</Alert> : null}
        <TextInput label={t("brochure.fields.name")} value={textValue(form.values.name)} onChange={(event) => form.set("name", event.currentTarget.value)} />
        <Group grow align="flex-start">
          <Select label={t("brochure.fields.industry")} data={industryOptions} value={(form.values.industry_id as string | null) ?? null} onChange={(value) => form.set("industry_id", value)} clearable searchable />
          <Select label={t("brochure.fields.category")} data={categoryOptions} value={(form.values.category_id as string | null) ?? null} onChange={(value) => form.set("category_id", value)} clearable searchable />
        </Group>
        <Textarea label={t("brochure.fields.notes")} value={textValue(form.values.notes)} onChange={(event) => form.set("notes", event.currentTarget.value)} minRows={3} />
        <NumberInput label={t("brochure.fields.sortOrder")} value={numberValue(form.values.sort_order)} onChange={(value) => form.set("sort_order", value ?? 0)} min={0} />
        {!isEdit ? (
          <Group gap="sm">
            <FileButton onChange={(file) => form.set("file", file)}>
              {(props) => <Button {...props}>{t("brochure.chooseFile")}</Button>}
            </FileButton>
            <Text size="sm" {...(!selectedFile ? { c: "dimmed" } : {})} lineClamp={1}>
              {selectedFile?.name ?? t("brochure.noFile")}
            </Text>
          </Group>
        ) : null}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} loading={saving}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function UploadVersionModal({
  opened,
  brochure,
  onClose
}: {
  opened: boolean;
  brochure: Brochure | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useSimpleForm({ file: null, note: "", set_current: true });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      form.setValues({ file: null, note: "", set_current: true });
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, brochure?.id]);

  const mutation = useMutation({
    mutationFn: ({ id, file, note, set_current }: { id: string; file: File; note?: string | null; set_current?: boolean }) =>
      uploadBrochureVersion(id, { file, note, set_current }),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      await queryClient.invalidateQueries({ queryKey: brochureKeys.versions(vars.id) });
      onClose();
    }
  });

  const selectedFile = form.values.file instanceof File ? form.values.file : null;

  async function submit() {
    if (!brochure) return;
    setFormError(null);
    if (!selectedFile) {
      setFormError(t("brochure.validation.fileRequired"));
      return;
    }

    try {
      await mutation.mutateAsync({
        id: brochure.id,
        file: selectedFile,
        note: emptyToNull(form.values.note) as string | null,
        set_current: Boolean(form.values.set_current)
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("brochure.uploadVersion")} size="lg">
      <Stack gap="md">
        {formError ? <Alert color="red" variant="light">{formError}</Alert> : null}
        <Group gap="sm">
          <FileButton onChange={(file) => form.set("file", file)}>
            {(props) => <Button {...props}>{t("brochure.chooseFile")}</Button>}
          </FileButton>
          <Text size="sm" {...(!selectedFile ? { c: "dimmed" } : {})} lineClamp={1}>
            {selectedFile?.name ?? t("brochure.noFile")}
          </Text>
        </Group>
        <Textarea label={t("brochure.fields.versionNote")} value={textValue(form.values.note)} onChange={(event) => form.set("note", event.currentTarget.value)} minRows={3} />
        <Checkbox label={t("brochure.fields.setCurrent")} checked={Boolean(form.values.set_current)} onChange={(event) => form.set("set_current", event.currentTarget.checked)} />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} loading={mutation.isPending}>{t("common.upload")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type DictionaryKind = "industry" | "category";

function DictionaryEditor({
  kind,
  rows
}: {
  kind: DictionaryKind;
  rows: BrochureDictionary[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useSimpleForm({ id: null, name: "", sort_order: 0 });
  const [error, setError] = useState<string | null>(null);
  const isIndustry = kind === "industry";
  const title = isIndustry ? t("brochure.manageIndustries") : t("brochure.manageCategories");

  const createMutation = useMutation<unknown, Error, { name: string; sort_order: number }>({
    mutationFn: (body: { name: string; sort_order: number }) => (isIndustry ? createBrochureIndustry(body) : createBrochureCategory(body)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: isIndustry ? brochureKeys.industries() : brochureKeys.categories() });
      form.setValues({ id: null, name: "", sort_order: 0 });
    }
  });
  const updateMutation = useMutation<unknown, Error, { id: string; body: { name: string; sort_order: number } }>({
    mutationFn: ({ id, body }: { id: string; body: { name: string; sort_order: number } }) =>
      isIndustry ? updateBrochureIndustry(id, body) : updateBrochureCategory(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: isIndustry ? brochureKeys.industries() : brochureKeys.categories() });
      form.setValues({ id: null, name: "", sort_order: 0 });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => (isIndustry ? deleteBrochureIndustry(id) : deleteBrochureCategory(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: isIndustry ? brochureKeys.industries() : brochureKeys.categories() });
    }
  });

  async function submit() {
    setError(null);
    const name = textValue(form.values.name).trim();
    if (!name) {
      setError(t("brochure.validation.nameRequired"));
      return;
    }

    try {
      const body = { name, sort_order: numberValue(form.values.sort_order) };
      const id = typeof form.values.id === "string" ? form.values.id : null;
      if (id) await updateMutation.mutateAsync({ id, body });
      else await createMutation.mutateAsync(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknown_error"));
    }
  }

  async function remove(row: BrochureDictionary) {
    if (!window.confirm(t("brochure.confirmDeleteDictionary", { name: row.name }))) return;
    await deleteMutation.mutateAsync(row.id);
  }

  return (
    <Stack gap="sm">
      <Text fw={600}>{title}</Text>
      {error ? <Alert color="red" variant="light">{error}</Alert> : null}
      <Group align="flex-end" wrap="nowrap">
        <TextInput label={t("brochure.fields.name")} value={textValue(form.values.name)} onChange={(event) => form.set("name", event.currentTarget.value)} style={{ flex: 1 }} />
        <NumberInput label={t("brochure.fields.sortOrder")} value={numberValue(form.values.sort_order)} onChange={(value) => form.set("sort_order", value ?? 0)} w={110} min={0} />
        <Button onClick={() => void submit()} loading={createMutation.isPending || updateMutation.isPending}>
          {form.values.id ? t("common.save") : t("brochure.addDictionary")}
        </Button>
      </Group>
      <ScrollArea h={260}>
        <Table withTableBorder withColumnBorders highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("brochure.fields.name")}</Table.Th>
              <Table.Th w={90}>{t("brochure.fields.sortOrder")}</Table.Th>
              <Table.Th w={150}>{t("common.actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text ta="center" c="dimmed" py="md">{t("brochure.emptyDictionary")}</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.name}</Table.Td>
                  <Table.Td>{row.sort_order}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => form.setValues({ id: row.id, name: row.name, sort_order: row.sort_order })}>
                        {t("common.edit")}
                      </Button>
                      <Button size="xs" variant="light" color="red" loading={deleteMutation.isPending} onClick={() => void remove(row)}>
                        {t("common.delete")}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

export function DictionaryManagerModal({
  opened,
  industries,
  categories,
  loading,
  error,
  onClose
}: {
  opened: boolean;
  industries: BrochureDictionary[];
  categories: BrochureDictionary[];
  loading?: boolean;
  error?: unknown;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={t("brochure.manageDictionaries")} size="xl">
      <Stack gap="lg">
        {loading ? <Loader size="sm" /> : null}
        <ErrorAlert error={error} />
        <DictionaryEditor kind="industry" rows={industries} />
        <DictionaryEditor kind="category" rows={categories} />
      </Stack>
    </Modal>
  );
}

export function CurrentVersionBadge({ brochure }: { brochure: Brochure }) {
  const { t } = useTranslation();
  const version = brochure.current_version;
  if (!version) return <Text c="dimmed">-</Text>;
  return (
    <Group gap="xs">
      <Badge color="blue">v{version.version_no}</Badge>
      <Text size="sm">{formatBrochureDate(version.uploaded_at)}</Text>
      {brochure.current_filename ? <Text size="sm" c="dimmed" lineClamp={1}>{brochure.current_filename}</Text> : null}
    </Group>
  );
}
