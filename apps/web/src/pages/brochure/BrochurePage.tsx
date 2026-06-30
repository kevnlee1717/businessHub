import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  brochureKeys,
  deleteBrochure,
  deleteBrochureVersion,
  listBrochureCategories,
  listBrochureIndustries,
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
  CurrentVersionBadge,
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

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text ta="center" c="dimmed" py="lg">
          {t("brochure.empty")}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function TreeButton({
  active,
  indent = 0,
  children,
  onClick
}: {
  active: boolean;
  indent?: number;
  children: React.ReactNode;
  onClick: () => void;
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
      <Text size="sm" fw={active ? 600 : 400} truncate>
        {children}
      </Text>
    </UnstyledButton>
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
              <Group key={version.id} justify="space-between" gap="sm" wrap="nowrap">
                <Group gap="sm" style={{ minWidth: 0 }}>
                  <Badge color={isCurrent ? "green" : "gray"}>v{version.version_no}{isCurrent ? ` ${t("brochure.current")}` : ""}</Badge>
                  <Text size="sm" truncate>{version.filename}</Text>
                  <Text size="sm" c="dimmed">{formatBrochureDate(version.uploaded_at)}</Text>
                  {version.note ? <Text size="sm" c="dimmed" truncate>{version.note}</Text> : null}
                </Group>
                <Group gap="xs" wrap="nowrap">
                  <Button size="xs" variant="light" onClick={() => onPreview(version)}>{t("common.preview")}</Button>
                  {version.url ? <Button size="xs" variant="subtle" component="a" href={version.url} target="_blank" rel="noreferrer">{t("brochure.download")}</Button> : null}
                  {canManage && !isCurrent ? (
                    <Button size="xs" variant="light" loading={setCurrentMutation.isPending} onClick={() => setCurrentMutation.mutate(version.id)}>
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

export function BrochurePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("brochure.manage");
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingBrochure, setEditingBrochure] = useState<Brochure | null>(null);
  const [formOpened, setFormOpened] = useState(false);
  const [uploadingBrochure, setUploadingBrochure] = useState<Brochure | null>(null);
  const [dictionaryOpened, setDictionaryOpened] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<BrochureVersion | null>(null);

  const industriesQuery = useQuery({ queryKey: brochureKeys.industries(), queryFn: listBrochureIndustries });
  const categoriesQuery = useQuery({ queryKey: brochureKeys.categories(), queryFn: listBrochureCategories });
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
    }
  });

  const industries = industriesQuery.data?.industries ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const brochures = brochuresQuery.data?.brochures ?? [];
  const total = brochuresQuery.data?.total ?? brochures.length;
  const activeKey = selectionKey(selection);
  const categoryById = useMemo(() => new Map(categories.map((row) => [row.id, row])), [categories]);

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
    <Box p={20}>
      <Group align="stretch" gap="md" wrap="nowrap">
        <Paper withBorder radius="sm" p="sm" w={240} style={{ flexShrink: 0 }}>
          <Stack gap="xs" h="100%">
            <Text fw={600}>{t("brochure.treeTitle")}</Text>
            <ScrollArea style={{ flex: 1 }}>
              <Stack gap={4}>
                <TreeButton active={activeKey === "all"} onClick={() => select({ type: "all" })}>
                  {t("common.all")}
                </TreeButton>
                {industries.map((industry) => (
                  <Stack key={industry.id} gap={4}>
                    <TreeButton active={activeKey === `industry:${industry.id}`} onClick={() => select({ type: "industry", industryId: industry.id })}>
                      ▸ {industry.name}
                    </TreeButton>
                    {categories.map((category) => (
                      <TreeButton
                        key={`${industry.id}-${category.id}`}
                        indent={18}
                        active={activeKey === `category:${industry.id}:${category.id}`}
                        onClick={() => select({ type: "category", industryId: industry.id, categoryId: category.id })}
                      >
                        {category.name}
                      </TreeButton>
                    ))}
                  </Stack>
                ))}
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

            <ErrorAlert error={industriesQuery.error ?? categoriesQuery.error ?? brochuresQuery.error ?? deleteMutation.error} />

            <Paper withBorder radius="sm">
              <ScrollArea>
                <Table miw={980} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={80}>{t("brochure.history")}</Table.Th>
                      <Table.Th>{t("brochure.fields.name")}</Table.Th>
                      <Table.Th w={140}>{t("brochure.fields.category")}</Table.Th>
                      <Table.Th w={280}>{t("brochure.fields.currentVersion")}</Table.Th>
                      <Table.Th>{t("brochure.fields.notes")}</Table.Th>
                      <Table.Th w={300}>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {brochuresQuery.isLoading ? (
                      <LoadingRow colSpan={6} />
                    ) : brochures.length === 0 ? (
                      <EmptyRow colSpan={6} />
                    ) : (
                      brochures.map((brochure) => (
                        <Fragment key={brochure.id}>
                          <Table.Tr>
                            <Table.Td>
                              <Button size="xs" variant="subtle" onClick={() => setExpandedId(expandedId === brochure.id ? null : brochure.id)}>
                                {expandedId === brochure.id ? t("common.collapse") : t("brochure.expand")}
                              </Button>
                            </Table.Td>
                            <Table.Td>
                              <Stack gap={2}>
                                <Anchor component="button" type="button" onClick={() => setExpandedId(expandedId === brochure.id ? null : brochure.id)}>
                                  {brochure.name}
                                </Anchor>
                                <Text size="xs" c="dimmed">{brochure.industry_name ?? t("common.uncategorized")}</Text>
                              </Stack>
                            </Table.Td>
                            <Table.Td>{brochure.category_name ?? (brochure.category_id ? categoryById.get(brochure.category_id)?.name : null) ?? "-"}</Table.Td>
                            <Table.Td>
                              <CurrentVersionBadge brochure={brochure} />
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" lineClamp={2}>{brochure.notes || "-"}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs" wrap="wrap">
                                {brochure.current_version ? (
                                  <>
                                    <Button size="xs" variant="light" onClick={() => setPreviewVersion(brochure.current_version ?? null)}>
                                      {t("common.preview")}
                                    </Button>
                                    {brochure.current_version.url ? (
                                      <Button size="xs" variant="subtle" component="a" href={brochure.current_version.url} target="_blank" rel="noreferrer">
                                        {t("brochure.download")}
                                      </Button>
                                    ) : null}
                                  </>
                                ) : null}
                                {canManage ? (
                                  <>
                                    <Button size="xs" variant="light" onClick={() => setUploadingBrochure(brochure)}>
                                      {t("brochure.uploadVersion")}
                                    </Button>
                                    <Button size="xs" variant="light" onClick={() => openEdit(brochure)}>
                                      {t("common.edit")}
                                    </Button>
                                    <Button size="xs" color="red" variant="light" loading={deleteMutation.isPending} onClick={() => void remove(brochure)}>
                                      {t("common.delete")}
                                    </Button>
                                  </>
                                ) : null}
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                          {expandedId === brochure.id ? (
                            <Table.Tr>
                              <Table.Td colSpan={6}>
                                <VersionHistory brochure={brochure} canManage={canManage} onPreview={setPreviewVersion} />
                              </Table.Td>
                            </Table.Tr>
                          ) : null}
                        </Fragment>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>

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
