import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  brochureKeys,
  deleteBrochure,
  deleteBrochureVersion,
  listBrochureCategories,
  listBrochureIndustries,
  listBrochureTreeUsage,
  listBrochureVersions,
  listBrochures,
  setBrochureCurrentVersion,
  type Brochure,
  type BrochureVersion
} from "../../api/brochures";
import { useAuth } from "../../auth/AuthContext";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";
import {
  BrochureFormModal,
  DictionaryManagerModal,
  FilePreviewModal,
  UploadVersionModal,
  formatBrochureDate,
} from "./BrochureShared";

type Selection =
  | { type: "all" }
  | { type: "industry"; industryId: string }
  | { type: "category"; industryId: string; categoryId: string };

function selectionKey(selection: Selection) {
  if (selection.type === "all") return "all";
  if (selection.type === "industry") return `industry:${selection.industryId}`;
  return `category:${selection.industryId}:${selection.categoryId}`;
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function TreeButton({
  active,
  indent = 0,
  children,
  onClick,
  expandable = false,
  expanded = false,
  onToggle
}: {
  active: boolean;
  indent?: number;
  children: React.ReactNode;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        width: "100%",
        padding: "8px 10px",
        paddingLeft: 10 + indent,
        borderRadius: 4,
        background: active ? "#ecf5ff" : "transparent",
        color: active ? "#1890ff" : "#303133",
        border: active ? "1px solid #b3d8ff" : "1px solid transparent"
      }}
    >
      <Group gap={6} wrap="nowrap" align="center">
        {expandable ? (
          <span
            role="button"
            aria-label={expanded ? "collapse" : "expand"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle?.();
            }}
            style={{
              display: "inline-flex",
              flexShrink: 0,
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              transition: "transform 120ms",
              transform: expanded ? "rotate(90deg)" : "none"
            }}
          >
            ▸
          </span>
        ) : null}
        <Text size="sm" fw={active ? 600 : 400} truncate>
          {children}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

function fileKind(file?: Pick<BrochureVersion, "mime" | "filename"> | null) {
  const mime = file?.mime ?? "";
  const filename = file?.filename?.toLowerCase() ?? "";
  if (mime === "application/pdf" || filename.endsWith(".pdf")) return "pdf";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename)) return "image";
  return "file";
}

function FileTypeIcon({ version }: { version?: BrochureVersion | null }) {
  const kind = fileKind(version);
  const color = kind === "pdf" ? "red" : kind === "image" ? "green" : "gray";
  const label = kind === "pdf" ? "PDF" : kind === "image" ? "IMG" : "FILE";

  return (
    <ThemeIcon color={color} variant="light" radius="sm" size="lg">
      <Text size="9px" fw={700}>
        {label}
      </Text>
    </ThemeIcon>
  );
}

function VersionHistory({
  brochure,
  canManage,
  onPreview
}: {
  brochure: Brochure;
  canManage: boolean;
  onPreview: (version: BrochureVersion) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const versionsQuery = useQuery({
    queryKey: brochureKeys.versions(brochure.id),
    queryFn: () => listBrochureVersions(brochure.id)
  });

  const setCurrentMutation = useMutation({
    mutationFn: (versionId: string) => setBrochureCurrentVersion(brochure.id, versionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      await queryClient.invalidateQueries({ queryKey: brochureKeys.versions(brochure.id) });
    }
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (versionId: string) => deleteBrochureVersion(brochure.id, versionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      await queryClient.invalidateQueries({ queryKey: brochureKeys.versions(brochure.id) });
      await queryClient.invalidateQueries({ queryKey: brochureKeys.treeUsage() });
    }
  });

  async function remove(version: BrochureVersion) {
    if (!window.confirm(t("brochure.confirmDeleteVersion", { version: `v${version.version_no}` }))) return;
    await deleteVersionMutation.mutateAsync(version.id);
  }

  return (
    <Box bg="#fafafa" p="sm">
      <Stack gap="xs">
        {versionsQuery.isLoading ? (
          <Group justify="center" py="md"><Loader size="sm" /></Group>
        ) : versionsQuery.error ? (
          <ErrorAlert error={versionsQuery.error} />
        ) : (versionsQuery.data?.versions ?? []).length === 0 ? (
          <Text c="dimmed" ta="center" py="md">{t("brochure.emptyVersions")}</Text>
        ) : (
          (versionsQuery.data?.versions ?? []).map((version) => {
            const isCurrent = brochure.current_version_id === version.id;
            return (
              <Group key={version.id} justify="space-between" gap="sm" wrap="wrap">
                <Group gap="sm" style={{ minWidth: 0 }}>
                  <Badge color={isCurrent ? "green" : "blue"}>V{version.version_no}{isCurrent ? ` ${t("brochure.current")}` : ""}</Badge>
                  <Text size="sm" truncate title={version.filename}>{version.filename}</Text>
                  <Text size="xs" c="dimmed">{formatBrochureDate(version.uploaded_at)}</Text>
                  {version.note ? <Text size="sm" c="dimmed" truncate>{version.note}</Text> : null}
                </Group>
                <Group gap="xs" wrap="wrap">
                  <Button size="xs" variant="light" onClick={() => onPreview(version)}>{t("common.preview")}</Button>
                  {version.url ? <Button size="xs" variant="subtle" component="a" href={version.url} target="_blank" rel="noreferrer">{t("brochure.download")}</Button> : null}
                  {canManage ? (
                    <Button size="xs" variant="light" disabled={isCurrent} loading={setCurrentMutation.isPending} onClick={() => setCurrentMutation.mutate(version.id)}>
                      {t("brochure.setCurrent")}
                    </Button>
                  ) : null}
                  {canManage ? (
                    <Button size="xs" color="red" variant="light" loading={deleteVersionMutation.isPending} onClick={() => void remove(version)}>
                      {t("common.delete")}
                    </Button>
                  ) : null}
                </Group>
              </Group>
            );
          })
        )}
      </Stack>
    </Box>
  );
}

function BrochureCard({
  brochure,
  canManage,
  expanded,
  onToggle,
  onPreview,
  onUpload,
  onEdit,
  onDelete,
  deleting
}: {
  brochure: Brochure;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPreview: (version: BrochureVersion) => void;
  onUpload: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTranslation();
  const versionsQuery = useQuery({
    queryKey: brochureKeys.versions(brochure.id),
    queryFn: () => listBrochureVersions(brochure.id)
  });
  const currentVersion = brochure.current_version ?? null;
  const versionCount = versionsQuery.data?.versions.length;

  return (
    <Card withBorder shadow="sm" radius="md" padding="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <FileTypeIcon version={currentVersion} />
            {currentVersion ? (
              <Anchor
                component="button"
                type="button"
                onClick={() => onPreview(currentVersion)}
                fw={700}
                truncate
                title={brochure.name}
                style={{ minWidth: 0 }}
              >
                {brochure.name}
              </Anchor>
            ) : (
              <Text fw={700} truncate title={brochure.name} style={{ minWidth: 0 }}>
                {brochure.name}
              </Text>
            )}
            {currentVersion ? <Badge color="blue">V{currentVersion.version_no}</Badge> : null}
          </Group>

          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={t("common.actions") ?? "操作"}>
                ⋮
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {currentVersion ? (
                <Menu.Item onClick={() => onPreview(currentVersion)}>{t("common.preview")}</Menu.Item>
              ) : null}
              {currentVersion?.url ? (
                <Menu.Item component="a" href={currentVersion.url} target="_blank" rel="noreferrer">
                  {t("brochure.download")}
                </Menu.Item>
              ) : null}
              <Menu.Item onClick={onToggle}>{t("brochure.history")}({versionCount ?? "..."})</Menu.Item>
              {canManage ? (
                <>
                  <Menu.Divider />
                  <Menu.Item onClick={onUpload}>{t("brochure.uploadVersion")}</Menu.Item>
                  <Menu.Item onClick={onEdit}>{t("common.edit")}</Menu.Item>
                  <Menu.Item color="red" disabled={deleting} onClick={onDelete}>
                    {t("common.delete")}
                  </Menu.Item>
                </>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </Group>

        <Group gap="xs">
          <Badge color="blue" variant="light">{brochure.category_name ?? t("common.uncategorized")}</Badge>
          <Badge color="gray" variant="light">{brochure.industry_name ?? t("common.uncategorized")}</Badge>
        </Group>

        {currentVersion ? (
          <Stack gap={3}>
            <Text size="xs" c="dimmed" truncate title={currentVersion.filename}>
              {currentVersion.filename}
            </Text>
            <Text size="xs" c="dimmed">
              {formatBrochureDate(currentVersion.uploaded_at)}
              {brochure.notes ? ` · ${t("brochure.fields.notes")}: ${brochure.notes}` : ""}
            </Text>
          </Stack>
        ) : (
          <>
            <Text c="dimmed">-</Text>
            {brochure.notes ? (
              <Text size="xs" c="dimmed">
                {t("brochure.fields.notes")}: {brochure.notes}
              </Text>
            ) : null}
          </>
        )}

        <Collapse in={expanded}>
          <Divider my="xs" />
          <VersionHistory brochure={brochure} canManage={canManage} onPreview={onPreview} />
        </Collapse>
      </Stack>
    </Card>
  );
}

export function BrochurePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("brochure.manage");
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  // 行业默认全部折叠，可点箭头切换（overrides 存用户手动改过的）
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingBrochure, setEditingBrochure] = useState<Brochure | null>(null);
  const [formOpened, setFormOpened] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState<Brochure | null>(null);
  const [dictionaryOpened, setDictionaryOpened] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<BrochureVersion | null>(null);

  const industriesQuery = useQuery({ queryKey: brochureKeys.industries(), queryFn: listBrochureIndustries });
  const categoriesQuery = useQuery({ queryKey: brochureKeys.categories(), queryFn: listBrochureCategories });
  const treeUsageQuery = useQuery({ queryKey: brochureKeys.treeUsage(), queryFn: listBrochureTreeUsage });
  const params = {
    industry_id: selection.type === "industry" || selection.type === "category" ? selection.industryId : undefined,
    category_id: selection.type === "category" ? selection.categoryId : undefined,
    q,
    page,
    page_size: pageSize
  };
  const brochuresQuery = useQuery({
    queryKey: brochureKeys.list(params),
    queryFn: () => listBrochures(params)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBrochure,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: brochureKeys.all });
      await queryClient.invalidateQueries({ queryKey: brochureKeys.treeUsage() });
    }
  });

  const industries = industriesQuery.data?.industries ?? [];
  // 所有行业默认折叠，用户点箭头再展开（overrides 记住手动切换）
  const isIndustryExpanded = (industry: { id: string }) =>
    expandedOverrides[industry.id] ?? false;
  const categories = categoriesQuery.data?.categories ?? [];
  const brochures = brochuresQuery.data?.brochures ?? [];
  const total = brochuresQuery.data?.total ?? brochures.length;
  const activeKey = selectionKey(selection);
  const usageSet = useMemo(
    () => new Set((treeUsageQuery.data?.usage ?? []).filter((row) => row.count > 0).map((row) => `${row.industry_id}:${row.category_id}`)),
    [treeUsageQuery.data?.usage]
  );

  function openCreate() {
    setEditingBrochure(null);
    setFormOpened(true);
  }

  function openEdit(brochure: Brochure) {
    setEditingBrochure(brochure);
    setFormOpened(true);
  }

  async function remove(brochure: Brochure) {
    if (!window.confirm(t("brochure.confirmDelete", { name: brochure.name }))) return;
    await deleteMutation.mutateAsync(brochure.id);
  }

  function select(next: Selection) {
    setSelection(next);
    setPage(1);
  }

  return (
    <Box>
      <Group align="stretch" gap="md" wrap="nowrap">
        <Paper withBorder radius="sm" p="sm" w={240} style={{ flexShrink: 0 }}>
          <Stack gap="xs" h="100%">
            <Text fw={600}>{t("brochure.treeTitle")}</Text>
            <ScrollArea style={{ flex: 1 }}>
              <Stack gap={4}>
                <TreeButton active={activeKey === "all"} onClick={() => select({ type: "all" })}>
                  {t("common.all")}
                </TreeButton>
                {industries.map((industry) => {
                  const expanded = isIndustryExpanded(industry);
                  return (
                    <Stack key={industry.id} gap={4}>
                      <TreeButton
                        active={activeKey === `industry:${industry.id}`}
                        expandable
                        expanded={expanded}
                        onToggle={() =>
                          setExpandedOverrides((prev) => ({ ...prev, [industry.id]: !expanded }))
                        }
                        onClick={() => select({ type: "industry", industryId: industry.id })}
                      >
                        {industry.name}
                      </TreeButton>
                      {expanded
                        ? (treeUsageQuery.isLoading
                            ? []
                            : categories.filter((category) => usageSet.has(`${industry.id}:${category.id}`))
                          ).map((category) => (
                            <TreeButton
                              key={`${industry.id}-${category.id}`}
                              indent={18}
                              active={activeKey === `category:${industry.id}:${category.id}`}
                              onClick={() => select({ type: "category", industryId: industry.id, categoryId: category.id })}
                            >
                              {category.name}
                            </TreeButton>
                          ))
                        : null}
                    </Stack>
                  );
                })}
              </Stack>
            </ScrollArea>
            {canManage ? (
              <Button variant="light" onClick={() => setDictionaryOpened(true)}>
                {t("brochure.manageDictionaries")}
              </Button>
            ) : null}
          </Stack>
        </Paper>

        <Box style={{ flex: 1, minWidth: 0 }}>
          <Stack gap="md">
            <Group justify="space-between" align="flex-end" wrap="wrap">
              <Group gap="sm" align="flex-end" wrap="wrap">
                <TextInput
                  w={240}
                  label={t("brochure.search")}
                  placeholder={t("brochure.searchPlaceholder")}
                  value={q}
                  onChange={(event) => {
                    setQ(event.currentTarget.value);
                    setPage(1);
                  }}
                />
                <Button onClick={() => void brochuresQuery.refetch()}>{t("common.search")}</Button>
              </Group>
              {canManage ? <Button onClick={openCreate}>{t("brochure.add")}</Button> : null}
            </Group>

            <ErrorAlert error={industriesQuery.error ?? categoriesQuery.error ?? treeUsageQuery.error ?? brochuresQuery.error ?? deleteMutation.error} />

            {brochuresQuery.isLoading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : brochures.length === 0 ? (
              <Text ta="center" c="dimmed" py="xl">
                {t("brochure.empty")}
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {brochures.map((brochure) => (
                  <BrochureCard
                    key={brochure.id}
                    brochure={brochure}
                    canManage={canManage}
                    expanded={expandedId === brochure.id}
                    onToggle={() => setExpandedId(expandedId === brochure.id ? null : brochure.id)}
                    onPreview={setPreviewVersion}
                    onUpload={() => setUploadingBrochure(brochure)}
                    onEdit={() => openEdit(brochure)}
                    onDelete={() => void remove(brochure)}
                    deleting={deleteMutation.isPending}
                  />
                ))}
              </SimpleGrid>
            )}

            <TablePagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </Stack>
        </Box>
      </Group>

      <BrochureFormModal
        opened={formOpened}
        brochure={editingBrochure}
        industries={industries}
        categories={categories}
        onClose={() => setFormOpened(false)}
      />
      <UploadVersionModal opened={Boolean(uploadingBrochure)} brochure={uploadingBrochure} onClose={() => setUploadingBrochure(null)} />
      <DictionaryManagerModal
        opened={dictionaryOpened}
        industries={industries}
        categories={categories}
        loading={industriesQuery.isLoading || categoriesQuery.isLoading}
        error={industriesQuery.error ?? categoriesQuery.error}
        onClose={() => setDictionaryOpened(false)}
      />
      <FilePreviewModal opened={Boolean(previewVersion)} version={previewVersion} onClose={() => setPreviewVersion(null)} />
    </Box>
  );
}
