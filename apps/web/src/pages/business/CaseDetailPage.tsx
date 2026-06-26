import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import {
  caseSubmissionResults,
  caseStatuses,
  caseStepDocCreateSchema,
  caseStepStatuses,
  type Role,
  type CaseStatus,
  type CaseSubmissionResult,
  type CaseStepDocCreateInput,
  type CaseStepDocStatus,
  type CaseStepStatus,
  type CaseStepUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createCase,
  createCaseStepDoc,
  createFollowUp,
  createSubmission,
  getCase,
  listGuarantors,
  listClients,
  listFollowUps,
  listTemplates,
  postStepReviewMessage,
  removeCaseStepDocFile,
  requestStepReview,
  updateCase,
  updateCaseStep,
  updateSubmission,
  uploadCaseStepDoc,
  type Case,
  type CaseSubmission,
  type CaseStep,
  type CaseStepDoc,
  type Client,
  type Guarantor,
  type StepReview
} from "../../api/cases";
import { fileUrl, listDocumentCategories, type DocumentCategory } from "../../api/dms";
import { listEmployees, type Employee } from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";

type DocFormValues = {
  doc_name?: string | undefined;
  doc_name_en?: string | undefined;
  category_id?: string | null | undefined;
  is_required?: boolean | undefined;
};

const caseManageRoles = new Set(["owner", "admin", "clerk", "sales"]);
const caseReviewAdminRoles = new Set(["owner", "admin"]);

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function caseStatusColor(status: CaseStatus) {
  switch (status) {
    case "completed":
      return "green";
    case "cancelled":
      return "gray";
    case "in_progress":
      return "blue";
    default:
      return "yellow";
  }
}

function stepStatusColor(status: CaseStepStatus) {
  switch (status) {
    case "done":
      return "green";
    case "in_progress":
      return "blue";
    case "need_materials":
      return "orange";
    default:
      return "yellow";
  }
}

function submissionResultColor(result: CaseSubmissionResult) {
  switch (result) {
    case "approved":
      return "green";
    case "rejected":
      return "red";
    default:
      return "gray";
  }
}

function docStatusColor(status: CaseStepDocStatus) {
  return status === "uploaded" ? "green" : "yellow";
}

function reviewStatusColor(status: CaseStep["review_status"]) {
  switch (status) {
    case "approved":
      return "green";
    case "rejected":
      return "red";
    case "pending":
      return "yellow";
    default:
      return "gray";
  }
}

function reviewActionColor(action: StepReview["action"]) {
  switch (action) {
    case "approve":
      return "green";
    case "reject":
      return "red";
    case "request":
      return "blue";
    default:
      return "gray";
  }
}

function getDocDefaultValues(): DocFormValues {
  return {
    doc_name: "",
    doc_name_en: undefined,
    category_id: null,
    is_required: true
  };
}

type DocumentRowProps = {
  doc: CaseStepDoc;
  caseId: string;
  canManageCases: boolean;
  categoryById: Map<string, DocumentCategory>;
};

function DocumentRow({ doc, caseId, canManageCases, categoryById }: DocumentRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const category = doc.category_id ? categoryById.get(doc.category_id) : undefined;
  const uploadedFiles = doc.files ?? [];

  const uploadMutation = useMutation({
    mutationFn: ({ docId, selectedFiles }: { docId: string; selectedFiles: File[] }) =>
      uploadCaseStepDoc(docId, selectedFiles),
    onSuccess: async () => {
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });
  const removeFileMutation = useMutation({
    mutationFn: (documentId: string) => removeCaseStepDocFile(doc.id, documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });

  async function upload() {
    if (files.length === 0) {
      return;
    }

    setError(null);
    try {
      await uploadMutation.mutateAsync({ docId: doc.id, selectedFiles: files });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("common.unknown_error"));
    }
  }

  async function removeFile(documentId: string) {
    setError(null);
    try {
      await removeFileMutation.mutateAsync(documentId);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : t("common.unknown_error"));
    }
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={500}>{displayName(doc.doc_name, doc.doc_name_en)}</Text>
            {category ? (
              <Badge size="xs" variant="light" color="blue">
                {displayName(category.name, category.name_en)}
              </Badge>
            ) : null}
            {doc.is_required ? (
              <Badge size="xs" variant="light" color="red">
                {t("caseStepDoc.required")}
              </Badge>
            ) : null}
          </Group>
          {error ? (
            <Text size="xs" c="red">
              {error}
            </Text>
          ) : null}
        </Stack>
      </Table.Td>
      <Table.Td>
        <Badge color={docStatusColor(doc.status)} variant="light">
          {t(`caseStepDocStatus.${doc.status}`)}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Stack gap="xs">
          {uploadedFiles.length > 0 ? (
            <Stack gap={4}>
              {uploadedFiles.map((file) => (
                <Group key={file.id} gap="xs" wrap="nowrap">
                  <Button
                    component="a"
                    href={fileUrl(file.storage_path)}
                    target="_blank"
                    rel="noreferrer"
                    size="compact-xs"
                    variant="subtle"
                  >
                    {file.filename}
                  </Button>
                  {canManageCases ? (
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="red"
                      onClick={() => removeFile(file.id)}
                      loading={removeFileMutation.isPending}
                    >
                      {t("caseStepDoc.removeFile")}
                    </Button>
                  ) : null}
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {t("caseStepDoc.noFiles")}
            </Text>
          )}
          {canManageCases ? (
            <Group gap="xs" wrap="nowrap">
              <FileInput
                size="xs"
                value={files}
                onChange={(value) => setFiles(value ?? [])}
                placeholder={t("caseStepDoc.chooseFiles")}
                clearable
                multiple
              />
              <Button size="xs" onClick={upload} loading={uploadMutation.isPending} disabled={files.length === 0}>
                {t("caseStepDoc.uploadFiles")}
              </Button>
            </Group>
          ) : null}
        </Stack>
      </Table.Td>
    </Table.Tr>
  );
}

type StepCardProps = {
  step: CaseStep;
  caseId: string;
  employees: Employee[];
  employeeById: Map<string, Employee>;
  canManageCases: boolean;
  currentUserId?: string | undefined;
  currentUserRole?: Role | undefined;
  documentCategories: DocumentCategory[];
};

function StepCard({
  step,
  caseId,
  employees,
  employeeById,
  canManageCases,
  currentUserId,
  currentUserRole,
  documentCategories
}: StepCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stepError, setStepError] = useState<string | null>(null);
  const [docFormOpened, setDocFormOpened] = useState(false);
  const [reviewRequestOpened, setReviewRequestOpened] = useState(false);
  const [reviewerId, setReviewerId] = useState<string | null>(step.reviewer_id ?? null);
  const [reviewRequestContent, setReviewRequestContent] = useState("");
  const [reviewMessageContent, setReviewMessageContent] = useState("");
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [followUpContent, setFollowUpContent] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [appointmentDraft, setAppointmentDraft] = useState(() =>
    toDateTimeLocalValue(typeof step.meta?.appointment_at === "string" ? step.meta.appointment_at : null)
  );

  const followUpsQuery = useQuery({
    queryKey: ["business", "case-step-follow-ups", step.id],
    queryFn: () => listFollowUps(step.id)
  });
  const updateStepMutation = useMutation({
    mutationFn: (body: CaseStepUpdateInput) => updateCaseStep(step.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });
  const createDocMutation = useMutation({
    mutationFn: (body: CaseStepDocCreateInput) => createCaseStepDoc(step.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
      docForm.reset(getDocDefaultValues());
      setDocFormOpened(false);
    }
  });
  const createFollowUpMutation = useMutation({
    mutationFn: (content: string) => createFollowUp(step.id, content),
    onSuccess: async () => {
      setFollowUpContent("");
      await queryClient.invalidateQueries({ queryKey: ["business", "case-step-follow-ups", step.id] });
    }
  });
  const requestReviewMutation = useMutation({
    mutationFn: () =>
      requestStepReview(step.id, {
        reviewer_id: reviewerId ?? "",
        content: reviewRequestContent.trim() ? reviewRequestContent.trim() : null
      }),
    onSuccess: async () => {
      setReviewRequestOpened(false);
      setReviewRequestContent("");
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });
  const postReviewMessageMutation = useMutation({
    mutationFn: (action: "comment" | "approve" | "reject") =>
      postStepReviewMessage(step.id, {
        action,
        content: reviewMessageContent.trim() ? reviewMessageContent.trim() : null,
        files: reviewFiles
      }),
    onSuccess: async () => {
      setReviewMessageContent("");
      setReviewFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });

  const docForm = useForm<DocFormValues>({
    resolver: zodResolver(caseStepDocCreateSchema) as Resolver<DocFormValues>,
    defaultValues: getDocDefaultValues()
  });

  const stepStatusOptions = caseStepStatuses.map((status) => ({
    value: status,
    label: t(`caseStepStatus.${status}`)
  }));
  const assignee = step.assignee_id ? employeeById.get(step.assignee_id) : undefined;
  const reviewer = step.reviewer_id ? employeeById.get(step.reviewer_id) : undefined;
  const reviews = step.reviews ?? [];
  const followUps = followUpsQuery.data?.followUps ?? [];
  const docErrors = docForm.formState.errors;
  const categoryById = useMemo(
    () => new Map(documentCategories.map((category) => [category.id, category] as const)),
    [documentCategories]
  );
  const categoryOptions = documentCategories.map((category) => ({
    value: category.id,
    label: displayName(category.name, category.name_en)
  }));
  const employeeOptions = employees.map((employee) => ({
    value: employee.id,
    label: displayName(employee.name, employee.name_en)
  }));
  const requiredDocuments = step.documents.filter((doc) => doc.is_required);
  const readyRequiredDocuments = requiredDocuments.filter((doc) => (doc.document_ids?.length ?? 0) > 0).length;
  const canReviewStep =
    Boolean(currentUserId && step.reviewer_id === currentUserId) ||
    Boolean(currentUserRole && caseReviewAdminRoles.has(currentUserRole));

  useEffect(() => {
    setAppointmentDraft(toDateTimeLocalValue(typeof step.meta?.appointment_at === "string" ? step.meta.appointment_at : null));
  }, [step.id, step.meta]);

  useEffect(() => {
    setReviewerId(step.reviewer_id ?? null);
  }, [step.id, step.reviewer_id]);

  async function updateStepStatus(status: string | null) {
    if (!status) {
      return;
    }

    setStepError(null);
    try {
      await updateStepMutation.mutateAsync({ status: status as CaseStepStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : t("common.unknown_error");
      setStepError(message === "missing_required_documents" ? t("caseStepDoc.missingRequiredDocuments") : message);
    }
  }

  async function saveAppointment() {
    setStepError(null);
    try {
      await updateStepMutation.mutateAsync({
        meta: {
          ...(step.meta ?? {}),
          appointment_at: toIsoDateTime(appointmentDraft) ?? null
        }
      });
    } catch (error) {
      setStepError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  const onDocSubmit = docForm.handleSubmit(async (values) => {
    setStepError(null);

    try {
      await createDocMutation.mutateAsync(values as CaseStepDocCreateInput);
    } catch (error) {
      setStepError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function addFollowUp() {
    const content = followUpContent.trim();
    if (!content) {
      return;
    }

    setFollowUpError(null);
    try {
      await createFollowUpMutation.mutateAsync(content);
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function submitReviewRequest() {
    if (!reviewerId) {
      setReviewError(t("stepReview.reviewerRequired"));
      return;
    }

    setReviewError(null);
    try {
      await requestReviewMutation.mutateAsync();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  async function submitReviewMessage(action: "comment" | "approve" | "reject") {
    if (action === "comment" && !reviewMessageContent.trim() && reviewFiles.length === 0) {
      return;
    }

    setReviewError(null);
    try {
      await postReviewMessageMutation.mutateAsync(action);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="xs">
              <Title order={4}>
                {step.step_order}. {displayName(step.name, step.name_en)}
              </Title>
              <Badge color={stepStatusColor(step.status)} variant="light">
                {t(`caseStepStatus.${step.status}`)}
              </Badge>
              <Badge color={reviewStatusColor(step.review_status)} variant="light">
                {t(`reviewStatus.${step.review_status}`)}
              </Badge>
            </Group>
            {step.description ? <Text c="dimmed">{step.description}</Text> : null}
            <Text size="sm" c="dimmed">
              {t("caseStep.fields.assignee")}:{" "}
              {assignee ? displayName(assignee.name, assignee.name_en) : t("common.not_available")}
            </Text>
            <Text size="sm" c="dimmed">
              {t("stepReview.reviewer")}:{" "}
              {reviewer ? displayName(reviewer.name, reviewer.name_en) : t("common.not_available")}
            </Text>
            {step.completed_at ? (
              <Text size="sm" c="dimmed">
                {t("caseStep.fields.completedAt")}: {formatDateTime(step.completed_at)}
              </Text>
            ) : null}
            {requiredDocuments.length > 0 ? (
              <Text size="sm" c={readyRequiredDocuments === requiredDocuments.length ? "green" : "orange"}>
                {t("caseStepDoc.requiredReady", {
                  ready: readyRequiredDocuments,
                  total: requiredDocuments.length
                })}
              </Text>
            ) : null}
            {step.reviewer_id && step.review_status !== "approved" ? (
              <Text size="sm" c="orange">
                {t("stepReview.gateHint")}
              </Text>
            ) : null}
          </Stack>
          <Stack gap="xs" align="flex-end">
            {canManageCases ? (
              <Select
                w={180}
                data={stepStatusOptions}
                value={step.status}
                onChange={updateStepStatus}
                disabled={updateStepMutation.isPending}
              />
            ) : null}
            {step.review_status === "none" || step.review_status === "rejected" ? (
              <Button size="xs" variant="light" onClick={() => setReviewRequestOpened(true)}>
                {t("stepReview.request")}
              </Button>
            ) : null}
          </Stack>
        </Group>

        {stepError ? (
          <Alert color="red" variant="light">
            {stepError}
          </Alert>
        ) : null}

        <Group align="flex-end">
          <TextInput
            type="datetime-local"
            label={t("kyc.appointmentAt")}
            value={appointmentDraft}
            onChange={(event) => setAppointmentDraft(event.currentTarget.value)}
            disabled={!canManageCases}
          />
          {canManageCases ? (
            <Button variant="light" onClick={saveAppointment} loading={updateStepMutation.isPending}>
              {t("kyc.saveAppointment")}
            </Button>
          ) : null}
        </Group>

        <Stack gap="xs">
          <Title order={5}>{t("stepReview.title")}</Title>
          {reviewError ? (
            <Alert color="red" variant="light">
              {reviewError}
            </Alert>
          ) : null}
          {reviews.length === 0 ? (
            <Text c="dimmed">{t("stepReview.empty")}</Text>
          ) : (
            <Stack gap="xs">
              {reviews.map((review) => {
                const author = review.author_id ? employeeById.get(review.author_id) : undefined;
                return (
                  <Paper key={review.id} withBorder radius="md" p="sm">
                    <Stack gap={6}>
                      <Group gap="xs">
                        <Badge size="sm" color={reviewActionColor(review.action)} variant="light">
                          {t(`reviewAction.${review.action}`)}
                        </Badge>
                        <Text size="sm" fw={500}>
                          {author ? displayName(author.name, author.name_en) : t("common.not_available")}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDateTime(review.created_at)}
                        </Text>
                      </Group>
                      {review.content ? <Text size="sm">{review.content}</Text> : null}
                      {review.files.length > 0 ? (
                        <Group gap="xs">
                          {review.files.map((file) => (
                            <Button
                              key={file.id}
                              component="a"
                              href={fileUrl(file.storage_path)}
                              target="_blank"
                              rel="noreferrer"
                              size="compact-xs"
                              variant="subtle"
                            >
                              {file.filename}
                            </Button>
                          ))}
                        </Group>
                      ) : null}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          <Stack gap="xs">
            <Textarea
              label={t("stepReview.fields.content")}
              value={reviewMessageContent}
              onChange={(event) => setReviewMessageContent(event.currentTarget.value)}
              autosize
              minRows={2}
            />
            <FileInput
              label={t("stepReview.fields.files")}
              value={reviewFiles}
              onChange={(value) => setReviewFiles(value ?? [])}
              multiple
              clearable
            />
            <Group justify="flex-end">
              <Button
                variant="light"
                onClick={() => submitReviewMessage("comment")}
                loading={postReviewMessageMutation.isPending}
                disabled={!reviewMessageContent.trim() && reviewFiles.length === 0}
              >
                {t("stepReview.comment")}
              </Button>
              {canReviewStep ? (
                <>
                  <Button
                    color="green"
                    variant="light"
                    onClick={() => submitReviewMessage("approve")}
                    loading={postReviewMessageMutation.isPending}
                  >
                    {t("stepReview.approve")}
                  </Button>
                  <Button
                    color="red"
                    variant="light"
                    onClick={() => submitReviewMessage("reject")}
                    loading={postReviewMessageMutation.isPending}
                  >
                    {t("stepReview.reject")}
                  </Button>
                </>
              ) : null}
            </Group>
          </Stack>
        </Stack>

        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{t("caseStepDoc.title")}</Title>
            {canManageCases ? (
              <Button size="xs" variant="light" onClick={() => setDocFormOpened((opened) => !opened)}>
                {t("caseStepDoc.add")}
              </Button>
            ) : null}
          </Group>
          {docFormOpened ? (
            <Paper withBorder radius="md" p="sm">
              <form onSubmit={onDocSubmit}>
                <Stack gap="sm">
                  <Group grow align="flex-start">
                    <TextInput
                      label={t("caseStepDoc.fields.docName")}
                      error={docErrors.doc_name?.message}
                      {...docForm.register("doc_name")}
                    />
                    <TextInput
                      label={t("caseStepDoc.fields.docNameEn")}
                      error={docErrors.doc_name_en?.message}
                      {...docForm.register("doc_name_en", { setValueAs: emptyToUndefined })}
                    />
                  </Group>
                  <Controller
                    name="category_id"
                    control={docForm.control}
                    render={({ field }) => (
                      <Select
                        label={t("caseStepDoc.fields.category")}
                        data={categoryOptions}
                        value={field.value ?? null}
                        onChange={field.onChange}
                        searchable
                        clearable
                      />
                    )}
                  />
                  <Controller
                    name="is_required"
                    control={docForm.control}
                    render={({ field }) => (
                      <Checkbox
                        label={t("caseStepDoc.fields.isRequired")}
                        checked={Boolean(field.value)}
                        onChange={(event) => field.onChange(event.currentTarget.checked)}
                      />
                    )}
                  />
                  <Group justify="flex-end">
                    <Button variant="subtle" onClick={() => setDocFormOpened(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" loading={createDocMutation.isPending}>
                      {t("common.save")}
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Paper>
          ) : null}
          <Table miw={760} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("caseStepDoc.fields.docName")}</Table.Th>
                <Table.Th>{t("caseStepDoc.fields.status")}</Table.Th>
                <Table.Th>{t("caseStepDoc.files")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {step.documents.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text ta="center" c="dimmed" py="sm">
                      {t("caseStepDoc.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                step.documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    caseId={caseId}
                    canManageCases={canManageCases}
                    categoryById={categoryById}
                  />
                ))
              )}
            </Table.Tbody>
          </Table>
        </Stack>

        <Stack gap="xs">
          <Title order={5}>{t("followUp.title")}</Title>
          {followUpsQuery.error ? (
            <Alert color="red" variant="light">
              {followUpsQuery.error instanceof Error ? followUpsQuery.error.message : t("common.unknown_error")}
            </Alert>
          ) : null}
          {followUpsQuery.isLoading ? (
            <Group justify="center" py="sm">
              <Loader size="sm" />
            </Group>
          ) : followUps.length === 0 ? (
            <Text c="dimmed">{t("followUp.empty")}</Text>
          ) : (
            <Stack gap="xs">
              {followUps.map((followUp) => {
                const author = followUp.author_id ? employeeById.get(followUp.author_id) : undefined;
                return (
                  <Paper key={followUp.id} withBorder radius="md" p="sm">
                    <Stack gap={4}>
                      <Text>{followUp.content}</Text>
                      <Text size="xs" c="dimmed">
                        {author ? displayName(author.name, author.name_en) : t("common.not_available")} ·{" "}
                        {formatDateTime(followUp.created_at)}
                      </Text>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
          {canManageCases ? (
            <Stack gap="xs">
              {followUpError ? (
                <Text size="sm" c="red">
                  {followUpError}
                </Text>
              ) : null}
              <Textarea
                label={t("followUp.fields.content")}
                value={followUpContent}
                onChange={(event) => setFollowUpContent(event.currentTarget.value)}
                autosize
                minRows={2}
              />
              <Group justify="flex-end">
                <Button onClick={addFollowUp} loading={createFollowUpMutation.isPending} disabled={!followUpContent.trim()}>
                  {t("followUp.add")}
                </Button>
              </Group>
            </Stack>
          ) : null}
        </Stack>
      </Stack>

      <Modal opened={reviewRequestOpened} onClose={() => setReviewRequestOpened(false)} title={t("stepReview.request")} size="lg">
        <Stack gap="md">
          {reviewError ? (
            <Alert color="red" variant="light">
              {reviewError}
            </Alert>
          ) : null}
          <Select
            label={t("stepReview.reviewer")}
            data={employeeOptions}
            value={reviewerId}
            onChange={setReviewerId}
            searchable
            clearable
          />
          <Textarea
            label={t("stepReview.fields.content")}
            value={reviewRequestContent}
            onChange={(event) => setReviewRequestContent(event.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setReviewRequestOpened(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitReviewRequest} loading={requestReviewMutation.isPending} disabled={!reviewerId}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

type GuarantorSectionProps = {
  caseItem: Case;
  guarantor: Guarantor | null;
  guarantors: Guarantor[];
  canManageCases: boolean;
};

function GuarantorSection({ caseItem, guarantor, guarantors, canManageCases }: GuarantorSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [guarantorDraft, setGuarantorDraft] = useState<string | null>(caseItem.guarantor_id ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGuarantorDraft(caseItem.guarantor_id ?? null);
  }, [caseItem.guarantor_id]);

  const updateGuarantorMutation = useMutation({
    mutationFn: () => updateCase(caseItem.id, { guarantor_id: guarantorDraft }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseItem.id] });
      await queryClient.invalidateQueries({ queryKey: ["business", "guarantors"] });
    }
  });

  const guarantorOptions = guarantors.map((item) => ({
    value: item.id,
    label: `${item.name}${item.nric ? ` / ${item.nric}` : ""}`
  }));

  async function saveGuarantor() {
    setError(null);
    try {
      await updateGuarantorMutation.mutateAsync();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Title order={3}>{t("guarantor.caseSectionTitle")}</Title>
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Stack gap={2}>
            <Text size="sm" c="dimmed">
              {t("guarantor.fields.name")}
            </Text>
            <Text fw={500}>{guarantor?.name ?? t("common.not_available")}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="sm" c="dimmed">
              {t("guarantor.fields.nric")}
            </Text>
            <Text fw={500}>{guarantor?.nric ?? t("common.not_available")}</Text>
          </Stack>
          <Stack gap={2}>
            <Text size="sm" c="dimmed">
              {t("guarantor.fields.sponsoredCount")}
            </Text>
            <Text fw={500}>
              {guarantor ? t("guarantor.sponsoredCount", { count: guarantor.sponsored_count }) : t("common.not_available")}
            </Text>
          </Stack>
        </SimpleGrid>
        {canManageCases ? (
          <Group align="flex-end">
            <Select
              label={t("guarantor.select")}
              data={guarantorOptions}
              value={guarantorDraft}
              onChange={setGuarantorDraft}
              searchable
              clearable
              w={360}
            />
            <Button onClick={saveGuarantor} loading={updateGuarantorMutation.isPending}>
              {t("guarantor.saveToCase")}
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
}

type DpChildrenSectionProps = {
  parentCaseId: string;
  children: Case[];
  clients: Client[];
  canManageCases: boolean;
};

function DpChildrenSection({ parentCaseId, children, clients, canManageCases }: DpChildrenSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpened, setModalOpened] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["business", "workflow-templates", "dp"],
    queryFn: () => listTemplates("dp")
  });

  const createDpMutation = useMutation({
    mutationFn: () =>
      createCase({
        business_type: "dp",
        parent_case_id: parentCaseId,
        template_id: templateId ?? undefined,
        client_id: clientId
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", parentCaseId] });
      await queryClient.invalidateQueries({ queryKey: ["business", "cases"] });
      setModalOpened(false);
      navigate(`/business/cases/${data.case.id}`);
    }
  });

  const templateOptions = (templatesQuery.data?.templates ?? []).map((template) => ({
    value: template.id,
    label: template.name
  }));
  const clientOptions = clients.map((client) => ({
    value: client.id,
    label: displayName(client.name, client.name_en)
  }));

  async function createDpCase() {
    if (!templateId) {
      setError(t("dp.templateRequired"));
      return;
    }

    setError(null);
    try {
      await createDpMutation.mutateAsync();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3}>{t("dp.childrenTitle")}</Title>
          {canManageCases ? <Button onClick={() => setModalOpened(true)}>{t("dp.add")}</Button> : null}
        </Group>
        {children.length === 0 ? (
          <Text c="dimmed">{t("dp.empty")}</Text>
        ) : (
          <ScrollArea>
            <Table miw={640} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("case.fields.status")}</Table.Th>
                  <Table.Th>{t("case.fields.currentStep")}</Table.Th>
                  <Table.Th>{t("case.fields.createdAt")}</Table.Th>
                  <Table.Th>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {children.map((child) => (
                  <Table.Tr key={child.id}>
                    <Table.Td>
                      <Badge color={caseStatusColor(child.status)} variant="light">
                        {t(`caseStatus.${child.status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{child.current_step ?? t("common.not_available")}</Table.Td>
                    <Table.Td>{formatDateTime(child.created_at)}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="light" onClick={() => navigate(`/business/cases/${child.id}`)}>
                        {t("common.view")}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>

      <Modal opened={modalOpened} onClose={() => setModalOpened(false)} title={t("dp.add")} size="lg">
        <Stack gap="md">
          {error ? (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          ) : null}
          <Select
            label={t("case.fields.template")}
            data={templateOptions}
            value={templateId}
            onChange={setTemplateId}
            searchable
            clearable
          />
          <Select
            label={t("case.fields.client")}
            data={clientOptions}
            value={clientId}
            onChange={setClientId}
            searchable
            clearable
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setModalOpened(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={createDpCase} loading={createDpMutation.isPending} disabled={!templateId}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

type SubmissionTimelineProps = {
  caseId: string;
  submissions: CaseSubmission[];
  canManageCases: boolean;
};

function SubmissionTimeline({ caseId, submissions, canManageCases }: SubmissionTimelineProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [createOpened, setCreateOpened] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(toDateTimeLocalValue(new Date().toISOString()));
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resultDraft, setResultDraft] = useState<CaseSubmissionResult>("pending");
  const [rejectedAtDraft, setRejectedAtDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      createSubmission(caseId, {
        submitted_at: toIsoDateTime(submittedAt),
        note: note.trim() ? note.trim() : null
      }),
    onSuccess: async () => {
      setCreateOpened(false);
      setSubmittedAt(toDateTimeLocalValue(new Date().toISOString()));
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (submissionId: string) =>
      updateSubmission(submissionId, {
        result: resultDraft,
        rejected_at: resultDraft === "rejected" ? toIsoDateTime(rejectedAtDraft) ?? null : null
      }),
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });

  const resultOptions = caseSubmissionResults.map((result) => ({
    value: result,
    label: t(`caseSubmissionResult.${result}`)
  }));

  function startEdit(submission: CaseSubmission) {
    setEditingId(submission.id);
    setResultDraft(submission.result);
    setRejectedAtDraft(toDateTimeLocalValue(submission.rejected_at));
    setError(null);
  }

  async function recordSubmission() {
    setError(null);
    try {
      await createMutation.mutateAsync();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("common.unknown_error"));
    }
  }

  async function saveResult(submissionId: string) {
    setError(null);
    try {
      await updateMutation.mutateAsync(submissionId);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("common.unknown_error"));
    }
  }

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={3}>{t("caseSubmission.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("caseSubmission.hint")}
            </Text>
          </Stack>
          {canManageCases ? <Button onClick={() => setCreateOpened(true)}>{t("caseSubmission.add")}</Button> : null}
        </Group>
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}
        {submissions.length === 0 ? (
          <Text c="dimmed">{t("caseSubmission.empty")}</Text>
        ) : (
          <Stack gap="sm">
            {submissions.map((submission) => (
              <Paper key={submission.id} withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Badge color={submissionResultColor(submission.result)} variant="light">
                          {t(`caseSubmissionResult.${submission.result}`)}
                        </Badge>
                        <Text fw={500}>{formatDateTime(submission.submitted_at)}</Text>
                      </Group>
                      {submission.rejected_at ? (
                        <Text size="sm" c="dimmed">
                          {t("caseSubmission.fields.rejectedAt")}: {formatDateTime(submission.rejected_at)}
                        </Text>
                      ) : null}
                      {submission.note ? <Text size="sm">{submission.note}</Text> : null}
                    </Stack>
                    {canManageCases ? (
                      <Button size="xs" variant="light" onClick={() => startEdit(submission)}>
                        {t("caseSubmission.markResult")}
                      </Button>
                    ) : null}
                  </Group>
                  {editingId === submission.id ? (
                    <Group align="flex-end">
                      <Select
                        label={t("caseSubmission.fields.result")}
                        data={resultOptions}
                        value={resultDraft}
                        onChange={(value) => setResultDraft((value as CaseSubmissionResult | null) ?? "pending")}
                      />
                      {resultDraft === "rejected" ? (
                        <TextInput
                          type="datetime-local"
                          label={t("caseSubmission.fields.rejectedAt")}
                          value={rejectedAtDraft}
                          onChange={(event) => setRejectedAtDraft(event.currentTarget.value)}
                        />
                      ) : null}
                      <Button onClick={() => saveResult(submission.id)} loading={updateMutation.isPending}>
                        {t("common.save")}
                      </Button>
                      <Button variant="subtle" onClick={() => setEditingId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </Group>
                  ) : null}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal opened={createOpened} onClose={() => setCreateOpened(false)} title={t("caseSubmission.add")} size="lg">
        <Stack gap="md">
          <TextInput
            type="datetime-local"
            label={t("caseSubmission.fields.submittedAt")}
            value={submittedAt}
            onChange={(event) => setSubmittedAt(event.currentTarget.value)}
          />
          <Textarea
            label={t("caseSubmission.fields.note")}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCreateOpened(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={recordSubmission} loading={createMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}

export function CaseDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { id } = useParams();
  const [statusDraft, setStatusDraft] = useState<CaseStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const caseQuery = useQuery({
    queryKey: ["business", "case", id],
    queryFn: () => getCase(id ?? ""),
    enabled: Boolean(id)
  });
  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: listClients
  });
  const guarantorsQuery = useQuery({
    queryKey: ["business", "guarantors"],
    queryFn: listGuarantors
  });
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: listEmployees
  });
  const documentCategoriesQuery = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: listDocumentCategories
  });
  const updateCaseMutation = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: CaseStatus }) =>
      updateCase(caseId, { status }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", variables.caseId] });
      await queryClient.invalidateQueries({ queryKey: ["business", "cases"] });
    }
  });

  const caseItem = caseQuery.data?.case;
  const children = caseQuery.data?.children ?? [];
  const guarantor = caseQuery.data?.guarantor ?? null;
  const submissions = caseQuery.data?.submissions ?? [];
  const steps = useMemo(
    () => [...(caseQuery.data?.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
    [caseQuery.data?.steps]
  );
  const clients = clientsQuery.data?.clients ?? [];
  const guarantors = guarantorsQuery.data?.guarantors ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const documentCategories = documentCategoriesQuery.data?.categories ?? [];
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client] as const)),
    [clients]
  );
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee] as const)),
    [employees]
  );
  const statusOptions = caseStatuses.map((status) => ({
    value: status,
    label: t(`caseStatus.${status}`)
  }));
  const loadError =
    caseQuery.error ?? clientsQuery.error ?? employeesQuery.error ?? guarantorsQuery.error ?? documentCategoriesQuery.error;
  const canManageCases = user ? caseManageRoles.has(user.role) : false;

  useEffect(() => {
    if (caseItem) {
      setStatusDraft(caseItem.status);
    }
  }, [caseItem]);

  async function updateStatus() {
    if (!id || !statusDraft) {
      return;
    }

    setStatusError(null);
    try {
      await updateCaseMutation.mutateAsync({ caseId: id, status: statusDraft });
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  function clientName(client?: Client) {
    return client ? displayName(client.name, client.name_en) : t("common.not_available");
  }

  function getBackPath(caseItem?: Case) {
    if (caseItem?.business_type === "ica") {
      return "/business/ica";
    }

    return "/business/ep";
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("case.detailTitle")}</Title>
        <Button variant="subtle" onClick={() => navigate(getBackPath(caseItem))}>
          {t("common.back")}
        </Button>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      {caseQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : caseItem ? (
        <>
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              {statusError ? (
                <Alert color="red" variant="light">
                  {statusError}
                </Alert>
              ) : null}
              <Group justify="space-between" align="flex-start">
                <Stack gap="xs">
                  <Group gap="xs">
                    <Badge variant="light">{t(`businessType.${caseItem.business_type}`)}</Badge>
                    <Badge color={caseStatusColor(caseItem.status)} variant="light">
                      {t(`caseStatus.${caseItem.status}`)}
                    </Badge>
                  </Group>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {t("case.fields.client")}
                      </Text>
                      <Text fw={500}>{clientName(clientById.get(caseItem.client_id ?? ""))}</Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {t("case.fields.currentStep")}
                      </Text>
                      <Text fw={500}>{caseItem.current_step ?? t("common.not_available")}</Text>
                    </Stack>
                    {caseItem.business_type === "dp" ? (
                      <Stack gap={2}>
                        <Text size="sm" c="dimmed">
                          {t("case.fields.parentCase")}
                        </Text>
                        {caseItem.parent_case_id ? (
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            px={0}
                            onClick={() => navigate(`/business/cases/${caseItem.parent_case_id}`)}
                          >
                            {t("dp.viewParent")}
                          </Button>
                        ) : (
                          <Text fw={500}>{t("common.not_available")}</Text>
                        )}
                      </Stack>
                    ) : null}
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {t("case.fields.createdAt")}
                      </Text>
                      <Text fw={500}>{formatDateTime(caseItem.created_at)}</Text>
                    </Stack>
                    {caseItem.business_type === "ica" ? (
                      <Stack gap={2}>
                        <Text size="sm" c="dimmed">
                          {t("case.fields.guarantor")}
                        </Text>
                        <Text fw={500}>
                          {guarantor?.name ?? caseItem.guarantor_name ?? t("common.not_available")}
                          {guarantor?.nric ? ` / ${guarantor.nric}` : ""}
                          {caseItem.guarantor_relation ? ` / ${caseItem.guarantor_relation}` : ""}
                          {caseItem.guarantor_contact ? ` / ${caseItem.guarantor_contact}` : ""}
                        </Text>
                      </Stack>
                    ) : null}
                  </SimpleGrid>
                </Stack>
                <Group align="flex-end">
                  <Select
                    label={t("case.fields.status")}
                    data={statusOptions}
                    value={statusDraft}
                    onChange={(value) => setStatusDraft(value as CaseStatus | null)}
                  />
                  <Button onClick={updateStatus} loading={updateCaseMutation.isPending}>
                    {t("case.updateStatus")}
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Paper>

          {caseItem.business_type === "ica" ? (
            <GuarantorSection
              caseItem={caseItem}
              guarantor={guarantor}
              guarantors={guarantors}
              canManageCases={canManageCases}
            />
          ) : null}

          {caseItem.business_type === "ep" ? (
            <DpChildrenSection
              parentCaseId={caseItem.id}
              children={children}
              clients={clients}
              canManageCases={canManageCases}
            />
          ) : null}

          {caseItem.business_type === "ep" || caseItem.business_type === "ica" ? (
            <SubmissionTimeline
              caseId={caseItem.id}
              submissions={submissions}
              canManageCases={canManageCases}
            />
          ) : null}

          <Stack gap="md">
            <Title order={3}>{t("caseStep.title")}</Title>
            {steps.length === 0 ? (
              <Paper withBorder radius="md" p="lg">
                <Text ta="center" c="dimmed">
                  {t("caseStep.empty")}
                </Text>
              </Paper>
            ) : (
              steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  caseId={caseItem.id}
                  employees={employees}
                  employeeById={employeeById}
                  canManageCases={canManageCases}
                  currentUserId={user?.id}
                  currentUserRole={user?.role}
                  documentCategories={documentCategories}
                />
              ))
            )}
          </Stack>
        </>
      ) : (
        <Text c="dimmed">{t("case.notFound")}</Text>
      )}
    </Stack>
  );
}
