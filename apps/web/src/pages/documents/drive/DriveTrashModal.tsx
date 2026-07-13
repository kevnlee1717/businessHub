import { Alert, Badge, Box, Button, Group, Loader, Modal, Stack, Table, Text, ThemeIcon } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  driveKeys,
  emptyTrash,
  getTrash,
  purgeTrashItem,
  restoreTrashItem,
  type TrashItem
} from "../../../api/drive";

function formatSize(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function TrashIcon({ kind }: { kind: TrashItem["kind"] }) {
  return (
    <ThemeIcon color={kind === "folder" ? "yellow" : "gray"} variant="light" radius="sm" size="md">
      {kind === "folder" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h4.02c.73 0 1.43.29 1.94.8l1.2 1.2h5.34A2.75 2.75 0 0 1 21 8.75v7.5A3.75 3.75 0 0 1 17.25 20H6.75A3.75 3.75 0 0 1 3 16.25v-9.5Z" fill="#D99A00" />
          <path d="M3.5 9h17v7.25a3.25 3.25 0 0 1-3.25 3.25H6.75a3.25 3.25 0 0 1-3.25-3.25V9Z" fill="#F9C74F" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 2.75h8.5L19 7.25v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z" stroke="#667085" strokeWidth="1.8" />
          <path d="M14.5 2.75v4.5H19M8 12.5h8M8 16h6" stroke="#667085" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
    </ThemeIcon>
  );
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

export function DriveTrashModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const trashQuery = useQuery({
    queryKey: driveKeys.trash(),
    queryFn: getTrash,
    enabled: opened
  });

  async function invalidateDrive() {
    await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
    await queryClient.invalidateQueries({ queryKey: driveKeys.tree() });
  }

  const restoreMutation = useMutation({
    mutationFn: restoreTrashItem,
    onSuccess: invalidateDrive
  });

  const purgeMutation = useMutation({
    mutationFn: purgeTrashItem,
    onSuccess: invalidateDrive
  });

  const emptyMutation = useMutation({
    mutationFn: emptyTrash,
    onSuccess: invalidateDrive
  });

  const items = trashQuery.data?.items ?? [];
  const busy = restoreMutation.isPending || purgeMutation.isPending || emptyMutation.isPending;

  function purge(item: TrashItem) {
    if (!window.confirm(t("drive.trash.confirmPurge", { name: item.name }))) return;
    purgeMutation.mutate(item.id);
  }

  function clearAll() {
    if (!window.confirm(t("drive.trash.confirmEmpty"))) return;
    emptyMutation.mutate();
  }

  return (
    <Modal opened={opened} onClose={onClose} title={t("drive.trash.title")} size="xl">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {t("drive.trash.subtitle")}
          </Text>
          <Button color="red" variant="light" loading={emptyMutation.isPending} disabled={items.length === 0 || busy} onClick={clearAll}>
            {t("drive.trash.empty")}
          </Button>
        </Group>

        <ErrorAlert error={trashQuery.error ?? restoreMutation.error ?? purgeMutation.error ?? emptyMutation.error} />

        {trashQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : items.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("drive.trash.emptyState")}
          </Text>
        ) : (
          <Box style={{ overflowX: "auto" }}>
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("drive.columns.name")}</Table.Th>
                  <Table.Th>{t("drive.trash.originalPath")}</Table.Th>
                  <Table.Th w={150}>{t("drive.trash.typeSize")}</Table.Th>
                  <Table.Th w={180}>{t("drive.trash.deletedAt")}</Table.Th>
                  <Table.Th w={170}>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <TrashIcon kind={item.kind} />
                        <Stack gap={0} style={{ minWidth: 0 }}>
                          <Text size="sm" truncate title={item.name}>
                            {item.name}
                          </Text>
                          {item.kind === "folder" && item.child_count ? (
                            <Text size="xs" c="dimmed">
                              {t("drive.trash.childCount", { count: item.child_count })}
                            </Text>
                          ) : null}
                        </Stack>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" truncate title={item.original_path || t("drive.root")}>
                        {item.original_path || t("drive.root")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Badge color={item.kind === "folder" ? "yellow" : "gray"}>{t(`drive.kind.${item.kind}`)}</Badge>
                        <Text size="sm" c="dimmed">
                          {item.kind === "file" ? formatSize(item.size) : "-"}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {formatDate(item.deleted_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" variant="light" loading={restoreMutation.isPending} disabled={busy} onClick={() => restoreMutation.mutate(item.id)}>
                          {t("drive.trash.restore")}
                        </Button>
                        <Button size="xs" color="red" variant="light" loading={purgeMutation.isPending} disabled={busy} onClick={() => purge(item)}>
                          {t("drive.trash.purge")}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Stack>
    </Modal>
  );
}
