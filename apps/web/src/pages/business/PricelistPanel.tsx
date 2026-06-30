import {
  Alert,
  Button,
  Card,
  FileButton,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  epPriceFileSlots,
  listEpPriceFiles,
  uploadEpPriceFile,
  type EpPriceFile,
  type EpPriceFileSlot
} from "../../api/epPriceFiles";
import { useAuth } from "../../auth/AuthContext";

const queryKey = ["business", "ep-price-files"] as const;

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function PricelistPanel() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [previewFile, setPreviewFile] = useState<EpPriceFile | null>(null);
  const canManage = can("case.manage");

  const filesQuery = useQuery({
    queryKey,
    queryFn: listEpPriceFiles
  });

  const uploadMutation = useMutation({
    mutationFn: ({ slot, file }: { slot: EpPriceFileSlot; file: File }) => uploadEpPriceFile(slot, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    }
  });

  const filesBySlot = new Map((filesQuery.data?.files ?? []).map((file) => [file.slot, file] as const));
  const loadingSlot = uploadMutation.variables?.slot ?? null;

  return (
    <Stack gap="md">
      {filesQuery.isLoading ? <Loader /> : null}
      {filesQuery.error ? (
        <Alert color="red" variant="light">
          {filesQuery.error.message}
        </Alert>
      ) : null}
      {uploadMutation.error ? (
        <Alert color="red" variant="light">
          {uploadMutation.error.message}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {epPriceFileSlots.map((slot) => {
          const file = filesBySlot.get(slot);
          const uploaded = Boolean(file?.url);
          const isUploading = uploadMutation.isPending && loadingSlot === slot;

          return (
            <Card key={slot} withBorder radius="sm" padding="lg">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Group gap="sm">
                    <ThemeIcon color="red" variant="light" radius="sm" size="lg">
                      <Text size="xs" fw={700}>
                        PDF
                      </Text>
                    </ThemeIcon>
                    <Stack gap={2}>
                      <Text fw={600}>{t(`business.pricelist.slots.${slot}`)}</Text>
                      <Text size="sm" c="dimmed" lineClamp={1}>
                        {file?.filename ?? t("business.pricelist.notUploaded")}
                      </Text>
                    </Stack>
                  </Group>
                </Group>

                <Text size="sm" c="dimmed">
                  {t("business.pricelist.updatedAt")}: {formatDateTime(file?.updated_at ?? null)}
                </Text>

                <Group gap="xs">
                  {uploaded ? (
                    <Button variant="light" size="xs" onClick={() => setPreviewFile(file ?? null)}>
                      {t("business.pricelist.preview")}
                    </Button>
                  ) : null}
                  {canManage ? (
                    <FileButton
                      onChange={(selectedFile) => {
                        if (selectedFile) {
                          uploadMutation.mutate({ slot, file: selectedFile });
                        }
                      }}
                      accept="application/pdf"
                    >
                      {(props) => (
                        <Button size="xs" loading={isUploading} {...props}>
                          {uploaded ? t("business.pricelist.replace") : t("business.pricelist.upload")}
                        </Button>
                      )}
                    </FileButton>
                  ) : null}
                </Group>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      <Modal
        opened={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile ? t(`business.pricelist.slots.${previewFile.slot}`) : undefined}
        size="xl"
      >
        {previewFile?.url ? (
          <iframe
            src={previewFile.url}
            title={previewFile.filename ?? t("business.pricelist.preview")}
            style={{ width: "100%", height: "80vh", border: 0 }}
          />
        ) : null}
      </Modal>
    </Stack>
  );
}
