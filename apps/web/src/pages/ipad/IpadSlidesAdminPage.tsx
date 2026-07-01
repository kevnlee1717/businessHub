import {
  Alert,
  Anchor,
  Box,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteIpadSlide,
  ipadSlideKeys,
  listIpadSlides,
  updateIpadSlide,
  uploadIpadSlide,
  type IpadSlide,
} from "../../api/ipadSlides";
import { useAuth } from "../../auth/AuthContext";

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function IpadSlidesAdminPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("brochure.manage");
  const [opened, { open, close }] = useDisclosure(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const slidesQuery = useQuery({
    queryKey: ipadSlideKeys.list(),
    queryFn: listIpadSlides,
  });
  const slides = slidesQuery.data?.slides ?? [];

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error(t("ipadSlides.validation.titleRequired"));
      if (!file) throw new Error(t("ipadSlides.validation.fileRequired"));
      return uploadIpadSlide({ title: title.trim(), file });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ipadSlideKeys.all });
      setTitle("");
      setFile(null);
      close();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { title?: string; sort_order?: number; orientation?: "landscape" | "portrait" };
    }) => updateIpadSlide(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ipadSlideKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIpadSlide,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ipadSlideKeys.all });
    },
  });

  async function moveSlide(slide: IpadSlide, direction: -1 | 1) {
    const index = slides.findIndex((item) => item.id === slide.id);
    const target = slides[index + direction];
    if (!target) return;
    await Promise.all([
      updateIpadSlide(slide.id, { sort_order: target.sort_order }),
      updateIpadSlide(target.id, { sort_order: slide.sort_order }),
    ]);
    await queryClient.invalidateQueries({ queryKey: ipadSlideKeys.all });
  }

  async function removeSlide(slide: IpadSlide) {
    if (!window.confirm(t("ipadSlides.confirmDelete", { title: slide.title }))) return;
    await deleteMutation.mutateAsync(slide.id);
  }

  return (
    <Box>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Title order={2}>{t("ipadSlides.title")}</Title>
              <Text c="dimmed" size="sm">{t("ipadSlides.subtitle")}</Text>
            </Box>
            {canManage ? (
              <Button onClick={open}>{t("ipadSlides.upload")}</Button>
            ) : null}
          </Group>

          <ErrorAlert error={slidesQuery.error ?? updateMutation.error ?? deleteMutation.error} />

          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("ipadSlides.fields.title")}</Table.Th>
                <Table.Th>{t("ipadSlides.fields.filename")}</Table.Th>
                <Table.Th>朝向</Table.Th>
                <Table.Th>{t("ipadSlides.fields.sortOrder")}</Table.Th>
                <Table.Th>{t("ipadSlides.fields.createdAt")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {slidesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Group justify="center" py="lg"><Loader size="sm" /></Group>
                  </Table.Td>
                </Table.Tr>
              ) : slides.length ? (
                slides.map((slide, index) => (
                  <Table.Tr key={slide.id}>
                    <Table.Td>
                      <Text fw={600}>{slide.title}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Anchor href={slide.url} target="_blank" rel="noreferrer">
                        {slide.filename}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <SegmentedControl
                        size="xs"
                        value={slide.orientation}
                        disabled={!canManage}
                        onChange={(value) =>
                          updateMutation.mutate({ id: slide.id, body: { orientation: value as "landscape" | "portrait" } })
                        }
                        data={[
                          { label: "横屏", value: "landscape" },
                          { label: "竖屏", value: "portrait" },
                        ]}
                      />
                    </Table.Td>
                    <Table.Td>{slide.sort_order}</Table.Td>
                    <Table.Td>{formatDate(slide.created_at)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button size="xs" variant="light" component="a" href={slide.url} target="_blank" rel="noreferrer">
                          {t("common.preview")}
                        </Button>
                        {canManage ? (
                          <>
                            <Button size="xs" variant="subtle" disabled={index === 0} onClick={() => void moveSlide(slide, -1)}>
                              {t("ipadSlides.moveUp")}
                            </Button>
                            <Button size="xs" variant="subtle" disabled={index === slides.length - 1} onClick={() => void moveSlide(slide, 1)}>
                              {t("ipadSlides.moveDown")}
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
                              onClick={() => {
                                const next = window.prompt(t("ipadSlides.fields.title"), slide.title);
                                if (next?.trim()) {
                                  updateMutation.mutate({ id: slide.id, body: { title: next.trim() } });
                                }
                              }}
                            >
                              {t("common.edit")}
                            </Button>
                            <Button size="xs" color="red" variant="subtle" loading={deleteMutation.isPending} onClick={() => void removeSlide(slide)}>
                              {t("common.delete")}
                            </Button>
                          </>
                        ) : null}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text ta="center" c="dimmed" py="lg">{t("ipadSlides.empty")}</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>

      <Modal opened={opened} onClose={close} title={t("ipadSlides.upload")} size="md">
        <Stack gap="md">
          <ErrorAlert error={uploadMutation.error} />
          <TextInput
            label={t("ipadSlides.fields.title")}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            required
          />
          <FileInput
            label={t("ipadSlides.fields.file")}
            value={file}
            onChange={setFile}
            accept="application/pdf"
            required
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>{t("common.cancel")}</Button>
            <Button loading={uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
              {t("common.upload")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
