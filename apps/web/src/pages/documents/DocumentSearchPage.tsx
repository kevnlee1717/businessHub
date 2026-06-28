import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listClients } from "../../api/cases";
import {
  fileUrl,
  listDocumentCategories,
  searchDocuments,
  uploadDocument,
  type DocumentSearchParams
} from "../../api/dms";

type SearchForm = {
  client_id: string | null;
  category_id: string | null;
  tag: string;
  filename: string;
  date_from: string;
  date_to: string;
};

const documentsQueryKey = ["documents", "search"] as const;

function displayDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function displaySize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toIsoRange(date: string, endOfDay = false) {
  const trimmed = date.trim();
  return trimmed ? `${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : undefined;
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function DocumentSearchPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<SearchForm>({
    client_id: null,
    category_id: null,
    tag: "",
    filename: "",
    date_from: "",
    date_to: ""
  });
  const [submittedParams, setSubmittedParams] = useState<DocumentSearchParams>({});
  const [uploadOpened, setUploadOpened] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSubjectType, setUploadSubjectType] = useState("general");
  const [uploadClientId, setUploadClientId] = useState<string | null>(null);
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: listClients
  });
  const categoriesQuery = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: listDocumentCategories
  });
  const documentsQuery = useQuery({
    queryKey: [...documentsQueryKey, submittedParams],
    queryFn: () => searchDocuments(submittedParams)
  });
  const uploadMutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: documentsQueryKey });
      closeUploadModal();
    }
  });

  const clients = clientsQuery.data?.clients ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const documents = documentsQuery.data?.documents ?? [];
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: client.name_en ? `${client.name} / ${client.name_en}` : client.name
  }));
  const categoryOptions = categories
    .filter((category) => category.active)
    .map((category) => ({
      value: category.id,
      label: category.name_en ? `${category.name} / ${category.name_en}` : category.name
    }));

  function runSearch() {
    setSubmittedParams({
      client_id: filters.client_id,
      category_id: filters.category_id,
      tag: filters.tag,
      filename: filters.filename,
      date_from: toIsoRange(filters.date_from),
      date_to: toIsoRange(filters.date_to, true)
    });
  }

  function closeUploadModal() {
    setUploadOpened(false);
    setUploadFile(null);
    setUploadSubjectType("general");
    setUploadClientId(null);
    setUploadCategoryId(null);
    setUploadTags("");
    setUploadError(null);
  }

  async function submitUpload() {
    if (!uploadFile) {
      setUploadError(t("document.upload.fileRequired"));
      return;
    }

    setUploadError(null);
    try {
      await uploadMutation.mutateAsync({
        file: uploadFile,
        subject_type: uploadSubjectType,
        client_id: uploadClientId,
        category_id: uploadCategoryId,
        tags: splitTags(uploadTags)
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("document.search.title")}</Title>
        <Button onClick={() => setUploadOpened(true)}>{t("document.upload.title")}</Button>
      </Group>

      <Paper withBorder radius="md" p="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            <Select
              label={t("document.fields.client")}
              placeholder={t("common.all")}
              data={clientOptions}
              value={filters.client_id}
              onChange={(value) => setFilters((current) => ({ ...current, client_id: value }))}
              clearable
              searchable
            />
            <Select
              label={t("document.fields.category")}
              placeholder={t("common.all")}
              data={categoryOptions}
              value={filters.category_id}
              onChange={(value) => setFilters((current) => ({ ...current, category_id: value }))}
              clearable
              searchable
            />
            <TextInput
              label={t("document.fields.tag")}
              value={filters.tag}
              onChange={(event) => setFilters((current) => ({ ...current, tag: event.currentTarget.value }))}
            />
            <TextInput
              label={t("document.fields.filename")}
              value={filters.filename}
              onChange={(event) => setFilters((current) => ({ ...current, filename: event.currentTarget.value }))}
            />
            <TextInput
              label={t("document.fields.dateFrom")}
              placeholder="YYYY-MM-DD"
              value={filters.date_from}
              onChange={(event) => setFilters((current) => ({ ...current, date_from: event.currentTarget.value }))}
            />
            <TextInput
              label={t("document.fields.dateTo")}
              placeholder="YYYY-MM-DD"
              value={filters.date_to}
              onChange={(event) => setFilters((current) => ({ ...current, date_to: event.currentTarget.value }))}
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button onClick={runSearch} loading={documentsQuery.isFetching}>
              {t("document.search.submit")}
            </Button>
          </Group>
        </Stack>
      </Paper>

      {documentsQuery.error ? (
        <Alert color="red" variant="light">
          {documentsQuery.error instanceof Error ? documentsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={900} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("document.fields.filename")}</Table.Th>
                <Table.Th>{t("document.fields.category")}</Table.Th>
                <Table.Th>{t("document.fields.tags")}</Table.Th>
                <Table.Th>{t("document.fields.size")}</Table.Th>
                <Table.Th>{t("document.fields.uploadedAt")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {documentsQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : documents.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("document.search.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                documents.map((document) => (
                  <Table.Tr key={document.id}>
                    <Table.Td>{document.filename}</Table.Td>
                    <Table.Td>
                      {document.category_id
                        ? (categoryById.get(document.category_id)?.name ?? t("common.not_available"))
                        : t("documentCategory.uncategorized")}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {document.tags.length > 0
                          ? document.tags.map((tag) => (
                              <Badge key={tag} size="sm" variant="light">
                                {tag}
                              </Badge>
                            ))
                          : t("common.not_available")}
                      </Group>
                    </Table.Td>
                    <Table.Td>{displaySize(document.size)}</Table.Td>
                    <Table.Td>{displayDateTime(document.uploaded_at)}</Table.Td>
                    <Table.Td>
                      <Button
                        component="a"
                        href={fileUrl(document.storage_path)}
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

      <Modal opened={uploadOpened} onClose={closeUploadModal} title={t("document.upload.title")} size="lg">
        <Stack gap="md">
          {uploadError ? (
            <Alert color="red" variant="light">
              {uploadError}
            </Alert>
          ) : null}
          <FileInput
            label={t("document.fields.file")}
            value={uploadFile}
            onChange={setUploadFile}
            clearable
            required
          />
          <TextInput
            label={t("document.fields.subjectType")}
            value={uploadSubjectType}
            onChange={(event) => setUploadSubjectType(event.currentTarget.value)}
          />
          <Select
            label={t("document.fields.client")}
            placeholder={t("common.not_available")}
            data={clientOptions}
            value={uploadClientId}
            onChange={setUploadClientId}
            clearable
            searchable
          />
          <Select
            label={t("document.fields.category")}
            placeholder={t("documentCategory.uncategorized")}
            data={categoryOptions}
            value={uploadCategoryId}
            onChange={setUploadCategoryId}
            clearable
            searchable
          />
          <TextInput
            label={t("document.fields.tags")}
            placeholder={t("document.upload.tagsPlaceholder")}
            value={uploadTags}
            onChange={(event) => setUploadTags(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeUploadModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitUpload} loading={uploadMutation.isPending}>
              {t("common.upload")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
