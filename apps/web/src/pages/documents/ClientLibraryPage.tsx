import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title
} from "@mantine/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listClients } from "../../api/cases";
import { fileUrl, getClientDocuments, listDocumentCategories } from "../../api/dms";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

function displayDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function ClientLibraryPage() {
  const { t } = useTranslation();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: () => listClients()
  });
  const categoriesQuery = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: () => listDocumentCategories()
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", "client-library", selectedClientId, page, pageSize],
    queryFn: () => getClientDocuments(selectedClientId ?? "", { page, page_size: pageSize }),
    enabled: Boolean(selectedClientId),
    placeholderData: keepPreviousData
  });

  const clients = clientsQuery.data?.clients ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const groups = documentsQuery.data?.groups ?? [];
  const totalDocuments = documentsQuery.data?.total ?? groups.reduce((total, group) => total + group.documents.length, 0);
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: client.name_en ? `${client.name} / ${client.name_en}` : client.name
  }));

  function updateSelectedClient(value: string | null) {
    setSelectedClientId(value);
    setPage(1);
  }

  return (
    <Stack gap="md">

      <Paper withBorder radius="md" p="md">
        <Select
          label={t("document.fields.client")}
          placeholder={t("document.clientLibrary.selectClient")}
          data={clientOptions}
          value={selectedClientId}
          onChange={updateSelectedClient}
          searchable
          clearable
        />
      </Paper>

      {documentsQuery.error ? (
        <Alert color="red" variant="light">
          {documentsQuery.error instanceof Error ? documentsQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      {!selectedClientId ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{t("document.clientLibrary.selectHint")}</Text>
        </Paper>
      ) : documentsQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : groups.length === 0 ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{t("document.clientLibrary.empty")}</Text>
        </Paper>
      ) : (
        groups.map((group) => (
          <Paper key={group.category_id ?? "uncategorized"} withBorder radius="md">
            <Stack gap={0}>
              <Group justify="space-between" px="md" py="sm">
                <Title order={4}>
                  {group.category_id
                    ? (categoryById.get(group.category_id)?.name ?? t("common.not_available"))
                    : t("documentCategory.uncategorized")}
                </Title>
                <Text size="sm" c="dimmed">
                  {t("document.clientLibrary.count", { count: group.documents.length })}
                </Text>
              </Group>
              <ScrollArea>
                <Table miw={720} verticalSpacing="sm" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("document.fields.filename")}</Table.Th>
                      <Table.Th>{t("document.fields.uploadedAt")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {group.documents.map((document) => (
                      <Table.Tr key={document.id}>
                        <Table.Td>{document.filename}</Table.Td>
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
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Paper>
        ))
      )}
      {selectedClientId ? (
        <TablePagination
          total={totalDocuments}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </Stack>
  );
}
