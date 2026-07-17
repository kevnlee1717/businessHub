import { Badge, Button, Group, Loader, Modal, Paper, Stack, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createResubmission,
  deleteResubmission,
  listResubmissions,
  updateResubmission,
  type CaseResubmission
} from "../../api/cases";

type ModalMode =
  | { type: "add" }
  | { type: "edit"; resubmission: CaseResubmission }
  | { type: "resubmit"; resubmission: CaseResubmission };

function formatDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "-";
}

function statusColor(status: CaseResubmission["status"]) {
  switch (status) {
    case "approved":
      return "green";
    case "resubmitted":
      return "blue";
    default:
      return "orange";
  }
}

function todayDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function CaseResubmissionsPanel({ caseId, canManage }: { caseId: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [requiredNote, setRequiredNote] = useState("");
  const [requestedAt, setRequestedAt] = useState("");
  const [resubmittedAt, setResubmittedAt] = useState("");
  const queryKey = ["business", "case", "resubmissions", caseId];
  const resubmissionsQuery = useQuery({
    queryKey,
    queryFn: () => listResubmissions(caseId)
  });
  const resubmissions = resubmissionsQuery.data?.resubmissions ?? [];
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };
  const createMutation = useMutation({
    mutationFn: () =>
      createResubmission(caseId, {
        required_note: requiredNote.trim() || undefined,
        requested_at: requestedAt || undefined
      }),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({
      rid,
      body
    }: {
      rid: string;
      body: Parameters<typeof updateResubmission>[2];
    }) => updateResubmission(caseId, rid, body),
    onSuccess: async () => {
      closeModal();
      await invalidate();
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (rid: string) => deleteResubmission(caseId, rid),
    onSuccess: invalidate
  });

  function openAddModal() {
    setRequiredNote("");
    setRequestedAt(todayDateInputValue());
    setResubmittedAt("");
    setModalMode({ type: "add" });
  }

  function openEditModal(resubmission: CaseResubmission) {
    setRequiredNote(resubmission.required_note ?? "");
    setRequestedAt(resubmission.requested_at ?? "");
    setResubmittedAt("");
    setModalMode({ type: "edit", resubmission });
  }

  function openResubmitModal(resubmission: CaseResubmission) {
    setRequiredNote("");
    setRequestedAt("");
    setResubmittedAt(resubmission.resubmitted_at ?? todayDateInputValue());
    setModalMode({ type: "resubmit", resubmission });
  }

  function closeModal() {
    setModalMode(null);
    setRequiredNote("");
    setRequestedAt("");
    setResubmittedAt("");
  }

  function saveModal() {
    if (!modalMode) {
      return;
    }

    if (modalMode.type === "add") {
      createMutation.mutate();
      return;
    }

    if (modalMode.type === "edit") {
      updateMutation.mutate({
        rid: modalMode.resubmission.id,
        body: {
          required_note: requiredNote.trim() || undefined,
          requested_at: requestedAt || null
        }
      });
      return;
    }

    updateMutation.mutate({
      rid: modalMode.resubmission.id,
      body: {
        status: "resubmitted",
        resubmitted_at: resubmittedAt || null
      }
    });
  }

  function modalTitle() {
    if (modalMode?.type === "edit") {
      return t("caseResubmission.editRound");
    }
    if (modalMode?.type === "resubmit") {
      return t("caseResubmission.markResubmitted");
    }
    return t("caseResubmission.addRound");
  }

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>{t("caseResubmission.title")}</Title>
          {canManage ? <Button onClick={openAddModal}>{t("caseResubmission.addRound")}</Button> : null}
        </Group>

        {resubmissionsQuery.isLoading ? (
          <Group gap="xs">
            <Loader size="sm" />
            <Text c="dimmed">{t("common.loading")}</Text>
          </Group>
        ) : resubmissions.length === 0 ? (
          <Stack gap="xs">
            <Text c="dimmed">{t("caseResubmission.empty")}</Text>
            {canManage ? (
              <Group>
                <Button variant="light" onClick={openAddModal}>
                  {t("caseResubmission.addRound")}
                </Button>
              </Group>
            ) : null}
          </Stack>
        ) : (
          <Stack gap="sm">
            {resubmissions.map((item) => (
              <Paper key={item.id} withBorder radius="sm" p="sm">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <Group gap="xs" wrap="wrap">
                      <Badge variant="light">{t("caseResubmission.round", { n: item.round_no })}</Badge>
                      <Badge color={statusColor(item.status)}>{t(`caseResubmission.status.${item.status}`)}</Badge>
                    </Group>
                    {canManage ? (
                      <Group gap="xs">
                        <Button size="xs" variant="light" onClick={() => openResubmitModal(item)} disabled={busy}>
                          {t("caseResubmission.markResubmitted")}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          disabled={busy}
                          onClick={() => updateMutation.mutate({ rid: item.id, body: { status: "approved" } })}
                        >
                          {t("caseResubmission.markApproved")}
                        </Button>
                        <Button size="xs" variant="subtle" disabled={busy} onClick={() => openEditModal(item)}>
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          disabled={busy}
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          {t("common.delete")}
                        </Button>
                      </Group>
                    ) : null}
                  </Group>
                  <Text size="sm">{item.required_note || t("caseResubmission.noRequiredNote")}</Text>
                  <Group gap="lg" wrap="wrap">
                    <Text size="sm" c="dimmed">
                      {t("caseResubmission.requestedAt")}: {formatDate(item.requested_at)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {t("caseResubmission.resubmittedAt")}: {formatDate(item.resubmitted_at)}
                    </Text>
                  </Group>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal opened={Boolean(modalMode)} onClose={closeModal} title={modalTitle()} size="lg">
        <Stack gap="md">
          {modalMode?.type === "resubmit" ? (
            <TextInput
              type="date"
              label={t("caseResubmission.resubmittedAt")}
              value={resubmittedAt}
              onChange={(event) => setResubmittedAt(event.currentTarget.value)}
            />
          ) : (
            <>
              <Textarea
                label={t("caseResubmission.requiredNote")}
                minRows={4}
                value={requiredNote}
                onChange={(event) => setRequiredNote(event.currentTarget.value)}
              />
              <TextInput
                type="date"
                label={t("caseResubmission.requestedAt")}
                value={requestedAt}
                onChange={(event) => setRequestedAt(event.currentTarget.value)}
              />
            </>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveModal} loading={createMutation.isPending || updateMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
