import { Anchor, Button, FileButton, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createMlkFolder, deleteMlkFileNode, listMlkFiles, mlkFileDownloadUrl, mlkKeys, uploadMlkFile, type MlkFileNode } from "../../../api/mlk";
import { ErrorAlert, formatDate } from "./shared";

function fileSize(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function nodeIcon(node: MlkFileNode) {
  return node.kind === "folder" ? "📁" : "📄";
}

export function MlkFilePanel({ folderId, canManage }: { folderId: string | null | undefined; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const currentFolderId = stack[stack.length - 1]?.id ?? folderId ?? null;
  const breadcrumbs = useMemo(() => [{ id: folderId ?? "", name: t("mlk.files.root") }, ...stack], [folderId, stack, t]);

  const filesQuery = useQuery({
    queryKey: currentFolderId ? mlkKeys.files(currentFolderId) : ["mlk", "files", null],
    queryFn: () => listMlkFiles(currentFolderId || ""),
    enabled: Boolean(currentFolderId)
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMlkFile(currentFolderId || "", file),
    onSuccess: async () => {
      if (currentFolderId) await queryClient.invalidateQueries({ queryKey: mlkKeys.files(currentFolderId) });
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createMlkFolder(currentFolderId || "", { name }),
    onSuccess: async () => {
      setFolderModalOpen(false);
      setFolderName("");
      if (currentFolderId) await queryClient.invalidateQueries({ queryKey: mlkKeys.files(currentFolderId) });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMlkFileNode,
    onSuccess: async () => {
      if (currentFolderId) await queryClient.invalidateQueries({ queryKey: mlkKeys.files(currentFolderId) });
    }
  });

  if (!folderId) {
    return (
      <Paper withBorder p="md">
        <Text c="dimmed">{t("mlk.files.saveFirst")}</Text>
      </Paper>
    );
  }

  function openFolder(node: MlkFileNode) {
    setStack((current) => [...current, { id: node.id, name: node.name }]);
  }

  function jumpTo(index: number) {
    if (index <= 0) {
      setStack([]);
      return;
    }
    setStack((current) => current.slice(0, index));
  }

  function remove(node: MlkFileNode) {
    if (!window.confirm(t("mlk.files.confirmDelete", { name: node.name }))) return;
    deleteMutation.mutate(node.id);
  }

  return (
    <Stack gap="md">
      <Modal opened={folderModalOpen} onClose={() => setFolderModalOpen(false)} title={t("mlk.files.newFolder")}>
        <Stack gap="md">
          <TextInput label={t("mlk.files.folderName")} value={folderName} onChange={(event) => setFolderName(event.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setFolderModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={createFolderMutation.isPending} onClick={() => folderName.trim() && createFolderMutation.mutate(folderName.trim())}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Group justify="space-between" gap="sm" wrap="wrap">
        <Group gap={4}>
          {breadcrumbs.map((crumb, index) => (
            <Group key={`${crumb.id}-${index}`} gap={4}>
              {index > 0 ? <Text c="dimmed">/</Text> : null}
              <Anchor size="sm" onClick={() => jumpTo(index)}>
                {crumb.name}
              </Anchor>
            </Group>
          ))}
        </Group>
        {canManage ? (
          <Group gap="xs">
            <FileButton onChange={(file) => file && uploadMutation.mutate(file)}>
              {(props) => (
                <Button size="xs" loading={uploadMutation.isPending} {...props}>
                  {t("common.upload")}
                </Button>
              )}
            </FileButton>
            <Button size="xs" variant="light" onClick={() => setFolderModalOpen(true)}>
              {t("mlk.files.newFolder")}
            </Button>
          </Group>
        ) : null}
      </Group>

      <ErrorAlert error={filesQuery.error ?? uploadMutation.error ?? createFolderMutation.error ?? deleteMutation.error} />
      <Paper p={0}>
        {filesQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : (filesQuery.data?.nodes ?? []).length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("mlk.files.empty")}
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>{t("mlk.files.icon")}</Table.Th>
                <Table.Th>{t("mlk.files.name")}</Table.Th>
                <Table.Th w={120}>{t("mlk.files.size")}</Table.Th>
                <Table.Th w={160}>{t("mlk.files.time")}</Table.Th>
                <Table.Th w={140}>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(filesQuery.data?.nodes ?? []).map((node) => (
                <Table.Tr key={node.id}>
                  <Table.Td>{nodeIcon(node)}</Table.Td>
                  <Table.Td>
                    {node.kind === "folder" ? (
                      <Anchor onClick={() => openFolder(node)}>{node.name}</Anchor>
                    ) : (
                      <Anchor href={mlkFileDownloadUrl(node.id)} target="_blank" rel="noreferrer">
                        {node.name}
                      </Anchor>
                    )}
                  </Table.Td>
                  <Table.Td>{fileSize(node.size)}</Table.Td>
                  <Table.Td>{formatDate(node.updated_at)}</Table.Td>
                  <Table.Td>
                    {canManage ? (
                      <Button size="xs" color="red" variant="subtle" loading={deleteMutation.isPending} onClick={() => remove(node)}>
                        {t("common.delete")}
                      </Button>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
