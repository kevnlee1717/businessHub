import {
  Alert,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton
} from "@mantine/core";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { fileUrl, searchDocuments, uploadDocument, type DocumentMeta } from "../../api/dms";
import type { CompanyFileSection } from "./companyFileSections";

const ALL = "__all__";
const ROOT = "__root__";

function displayDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

// folder_path 去掉 section 前缀后的相对路径,如 "合同&发票/EP/旧" → "EP/旧"。
function relativePath(folderPath: string | null | undefined, prefix: string): string {
  if (!folderPath) {
    return "";
  }
  if (folderPath === prefix) {
    return "";
  }
  if (folderPath.startsWith(`${prefix}/`)) {
    return folderPath.slice(prefix.length + 1);
  }
  return folderPath;
}

// 顶层子文件夹(相对路径第一段),用于左侧分组。空 → 根目录。
function topSubfolder(folderPath: string | null | undefined, prefix: string): string {
  const rest = relativePath(folderPath, prefix);
  if (rest === "") {
    return ROOT;
  }
  return rest.split("/")[0] ?? ROOT;
}

export function FolderLibraryPage({ section }: { section: CompanyFileSection }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedFolder, setSelectedFolder] = useState<string>(ALL);
  const [uploadOpened, setUploadOpened] = useState(false);
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: ["documents", "company-library", section.folderPrefix],
    queryFn: () =>
      searchDocuments({
        subject_type: "company",
        folder_prefix: section.folderPrefix
      }),
    placeholderData: keepPreviousData
  });

  const documents = useMemo(() => documentsQuery.data?.documents ?? [], [documentsQuery.data]);

  // 左侧子文件夹及计数。
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      const key = topSubfolder(doc.folder_path, section.folderPrefix);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => {
        if (a.key === ROOT) return 1;
        if (b.key === ROOT) return -1;
        return a.key.localeCompare(b.key, "zh");
      });
  }, [documents, section.folderPrefix]);

  const visibleDocuments = useMemo(() => {
    if (selectedFolder === ALL) {
      return documents;
    }
    return documents.filter((doc) => topSubfolder(doc.folder_path, section.folderPrefix) === selectedFolder);
  }, [documents, selectedFolder, section.folderPrefix]);

  const uploadMutation = useMutation({
    mutationFn: (input: { file: File; folder: string }) =>
      uploadDocument({
        file: input.file,
        subject_type: "company",
        folder_path: input.folder
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents", "company-library", section.folderPrefix] });
      closeUpload();
    }
  });

  function openUpload() {
    setUploadError(null);
    setUploadFile(null);
    setUploadFolder(selectedFolder !== ALL && selectedFolder !== ROOT ? selectedFolder : "");
    setUploadOpened(true);
  }

  function closeUpload() {
    setUploadOpened(false);
    setUploadError(null);
    setUploadFile(null);
    setUploadFolder("");
  }

  async function submitUpload() {
    if (!uploadFile) {
      setUploadError(t("documents.library.fileRequired"));
      return;
    }
    setUploadError(null);
    const sub = uploadFolder.trim();
    const folder = sub ? `${section.folderPrefix}/${sub}` : section.folderPrefix;
    try {
      await uploadMutation.mutateAsync({ file: uploadFile, folder });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  function folderLabel(key: string) {
    return key === ROOT ? t("documents.library.rootFolder") : key;
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{t(section.labelKey)}</Title>
        <Button onClick={openUpload}>{t("documents.library.upload")}</Button>
      </Group>

      {documentsQuery.error ? (
        <Alert color="red" variant="light">
          {documentsQuery.error instanceof Error ? documentsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Group align="flex-start" gap="md" wrap="nowrap">
        <Paper withBorder radius="md" w={220} style={{ flexShrink: 0 }}>
          <Stack gap={0} py="xs">
            <FolderItem
              label={t("documents.library.allFiles")}
              count={documents.length}
              active={selectedFolder === ALL}
              onClick={() => setSelectedFolder(ALL)}
            />
            {folders.map((folder) => (
              <FolderItem
                key={folder.key}
                label={folderLabel(folder.key)}
                count={folder.count}
                active={selectedFolder === folder.key}
                onClick={() => setSelectedFolder(folder.key)}
              />
            ))}
          </Stack>
        </Paper>

        <Paper withBorder radius="md" style={{ flex: 1, minWidth: 0 }}>
          <ScrollArea>
            <Table miw={640} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("document.fields.filename")}</Table.Th>
                  <Table.Th>{t("documents.library.subfolder")}</Table.Th>
                  <Table.Th>{t("document.fields.uploadedAt")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {documentsQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : visibleDocuments.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("documents.library.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  visibleDocuments.map((doc: DocumentMeta) => (
                    <Table.Tr key={doc.id}>
                      <Table.Td>{doc.filename}</Table.Td>
                      <Table.Td>{relativePath(doc.folder_path, section.folderPrefix) || "-"}</Table.Td>
                      <Table.Td>{displayDateTime(doc.uploaded_at)}</Table.Td>
                      <Table.Td>
                        <Button
                          component="a"
                          href={fileUrl(doc.storage_path)}
                          target="_blank"
                          rel="noreferrer"
                          size="xs"
                          variant="light"
                        >
                          {t("common.preview")}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>
      </Group>

      <Modal opened={uploadOpened} onClose={closeUpload} title={t("documents.library.upload")} size="md">
        <Stack gap="md">
          {uploadError ? (
            <Alert color="red" variant="light">
              {uploadError}
            </Alert>
          ) : null}
          <TextInput
            label={t("documents.library.subfolder")}
            placeholder={t("documents.library.subfolderPlaceholder")}
            value={uploadFolder}
            onChange={(event) => setUploadFolder(event.currentTarget.value)}
          />
          <FileInput
            label={t("documents.library.file")}
            placeholder={t("documents.library.filePlaceholder")}
            value={uploadFile}
            onChange={setUploadFile}
            clearable
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUpload}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitUpload} loading={uploadMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function FolderItem({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      px="md"
      py="xs"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: active ? "var(--mantine-color-blue-light)" : undefined,
        fontWeight: active ? 600 : 400
      }}
    >
      <Text size="sm" truncate>
        {label}
      </Text>
      <Text size="xs" c="dimmed">
        {count}
      </Text>
    </UnstyledButton>
  );
}
