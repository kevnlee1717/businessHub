import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  FileInput,
  Group,
  Image,
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
  type CaseStatus,
  type CaseSubmissionResult,
  type CaseStepDocCreateInput,
  type CaseStepDocStatus,
  type CaseStepStatus,
  type CaseStepUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createCase,
  createCaseStepDoc,
  updateCaseStepDoc,
  createFollowUp,
  createSubmission,
  getCase,
  listGuarantors,
  listClients,
  listFollowUps,
  listResubmissions,
  listTemplates,
  postStepReviewMessage,
  removeCaseStepDocFile,
  requestStepReview,
  updateCase,
  updateCaseStep,
  updateSubmission,
  uploadCaseStepDoc,
  uploadSubmissionFiles,
  type Case,
  type CaseSubmission,
  type SubmissionFile,
  type CaseStep,
  type CaseStepDoc,
  type Client,
  type Guarantor,
  type StepReview
} from "../../api/cases";
import { fileUrl, listDocumentCategories, type DocumentCategory } from "../../api/dms";
import { listEmployees, type Employee } from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";
import { useSetTabTitle } from "../../layout/tabTitle";
import { AddonServicesPanel } from "../../components/AddonServicesPanel";
import { CaseCommissionPanel } from "../../components/CaseCommissionPanel";
import { ChargeSchedulePanel } from "../../components/ChargeSchedulePanel";
import { type Charge } from "../../api/charges";
import { CaseFilesPanel } from "./CaseFilesPanel";
import { CaseResubmissionsPanel } from "./CaseResubmissionsPanel";
import { EpStepsPanel } from "./EpStepsPanel";

type DocFormValues = {
  doc_name?: string | undefined;
  doc_name_en?: string | undefined;
  category_id?: string | null | undefined;
  is_required?: boolean | undefined;
};

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

function formatDate(value?: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "-";
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

// 步骤健康度:有问题(待补材料/被拒) / 完成 / 进行中 / 待开始,用于步骤导航按钮的视觉区分。
type StepTone = "done" | "progress" | "problem" | "pending";
function stepTone(step: CaseStep): StepTone {
  if (step.review_status === "rejected" || step.status === "need_materials") {
    return "problem";
  }
  if (step.status === "done") {
    return "done";
  }
  if (step.status === "in_progress") {
    return "progress";
  }
  return "pending";
}
function stepToneColor(tone: StepTone) {
  switch (tone) {
    case "done":
      return "green";
    case "progress":
      return "blue";
    case "problem":
      return "red";
    default:
      return "gray";
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

// 距今天数(向下取整),用于显示"这次提交距离现在几天了"
function daysSince(value?: string | null) {
  if (!value) {
    return null;
  }
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24)));
}

function parseDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function isImageFile(file: SubmissionFile) {
  return file.mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.filename);
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
  categoryOptions: { value: string; label: string }[];
};

function DocumentRow({ doc, caseId, canManageCases, categoryById, categoryOptions }: DocumentRowProps) {
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
  const updateCategoryMutation = useMutation({
    mutationFn: (categoryId: string | null) => updateCaseStepDoc(doc.id, { category_id: categoryId }),
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
            {canManageCases ? (
              <Select
                size="xs"
                w={160}
                placeholder={t("caseStepDoc.fields.category")}
                data={categoryOptions}
                value={doc.category_id ?? null}
                onChange={(value) => updateCategoryMutation.mutate(value)}
                disabled={updateCategoryMutation.isPending}
                searchable
                clearable
              />
            ) : category ? (
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
  stepCharges: Charge[];
  employees: Employee[];
  employeeById: Map<string, Employee>;
  canManageCases: boolean;
  currentUserId?: string | undefined;
  documentCategories: DocumentCategory[];
};

function StepCard({
  step,
  caseId,
  stepCharges,
  employees,
  employeeById,
  canManageCases,
  currentUserId,
  documentCategories
}: StepCardProps) {
  const { t, i18n } = useTranslation();
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
  const [reviewOpen, setReviewOpen] = useState(false);

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
  // 只有被指派的审核人本人才是"审核人";管理员能审(canReviewStep),但「进行审核」按钮仅审核人可见
  const isReviewer = Boolean(currentUserId && step.reviewer_id === currentUserId);
  const canReviewStep = isReviewer || canManageCases;
  const stepChargeOutstanding = stepCharges.reduce(
    (sum, charge) => sum + Math.max(0, Number(charge.amount_expected) - Number(charge.amount_collected)),
    0
  );
  const stepChargesPaid = stepCharges.length > 0 && stepCharges.every((charge) => charge.status === "paid" || charge.status === "waived");

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
              {stepCharges.length > 0 ? (
                <Badge color={stepChargesPaid ? "green" : "orange"} variant="light">
                  {stepChargesPaid
                    ? t("chargeSchedule.stepPaid")
                    : t("chargeSchedule.stepOutstanding", { amount: stepChargeOutstanding.toFixed(2) })}
                </Badge>
              ) : null}
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
            {isReviewer ? (
              <Button size="xs" variant={reviewOpen ? "subtle" : "light"} onClick={() => setReviewOpen((open) => !open)}>
                {reviewOpen ? t("common.collapse") : t("stepReview.doReview")}
              </Button>
            ) : null}
          </Stack>
        </Group>

        {stepError ? (
          <Alert color="red" variant="light">
            {stepError}
          </Alert>
        ) : null}

        {reviewOpen ? (
        <Stack gap="xs">
          <Group gap="xs">
            <Title order={5}>{t("stepReview.title")}</Title>
            {reviews.length > 0 ? (
              <Badge size="sm" variant="light" color="gray">
                {reviews.length}
              </Badge>
            ) : null}
          </Group>
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
        ) : null}

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
                    categoryOptions={categoryOptions}
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
                const lang = i18n.language.startsWith("en") ? "en" : "zh";
                const translated = lang === "en" ? followUp.content_en : followUp.content_zh;
                const display = translated ?? followUp.content;
                const isTranslated =
                  !!translated && !!followUp.source_lang && followUp.source_lang !== lang;
                return (
                  <Paper key={followUp.id} withBorder radius="md" p="sm">
                    <Stack gap={4}>
                      <Group gap={6} align="center" wrap="nowrap">
                        <Text>{display}</Text>
                        {isTranslated ? (
                          <Badge size="xs" variant="light" color="gray">
                            {t("common.translated")}
                          </Badge>
                        ) : null}
                      </Group>
                      {isTranslated ? (
                        <Text size="xs" c="dimmed">
                          {t("common.original")}: {followUp.content}
                        </Text>
                      ) : null}
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
            {guarantorDraft !== (caseItem.guarantor_id ?? null) ? (
              <Button onClick={saveGuarantor} loading={updateGuarantorMutation.isPending}>
                {t("guarantor.saveToCase")}
              </Button>
            ) : null}
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

function SubmissionFileLink({ file }: { file: SubmissionFile }) {
  return (
    <Anchor href={fileUrl(file.storage_path)} target="_blank" rel="noreferrer" size="sm">
      {file.filename}
    </Anchor>
  );
}

// 卡片里预览本次提交的 截图 / 申诉信 / 附件
function SubmissionFiles({ submission }: { submission: CaseSubmission }) {
  const { t } = useTranslation();
  const screenshot = submission.screenshot_document ?? null;
  const appeal = submission.appeal_document ?? null;
  const attachments = submission.attachment_documents ?? [];

  if (!screenshot && !appeal && attachments.length === 0) {
    return null;
  }

  return (
    <Group gap="lg" align="flex-start" wrap="wrap">
      {screenshot ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("caseSubmission.fields.screenshot")}
          </Text>
          {isImageFile(screenshot) ? (
            <Anchor href={fileUrl(screenshot.storage_path)} target="_blank" rel="noreferrer">
              <Image src={fileUrl(screenshot.storage_path)} alt={screenshot.filename} w={120} h={120} fit="cover" radius="sm" />
            </Anchor>
          ) : (
            <SubmissionFileLink file={screenshot} />
          )}
        </Stack>
      ) : null}
      {appeal ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("caseSubmission.fields.appeal")}
          </Text>
          <SubmissionFileLink file={appeal} />
        </Stack>
      ) : null}
      {attachments.length > 0 ? (
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            {t("caseSubmission.fields.attachments")}
          </Text>
          {attachments.map((file) => (
            <SubmissionFileLink key={file.id} file={file} />
          ))}
        </Stack>
      ) : null}
    </Group>
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
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [appealFile, setAppealFile] = useState<File | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resultDraft, setResultDraft] = useState<CaseSubmissionResult>("pending");
  const [rejectedAtDraft, setRejectedAtDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { submission } = await createSubmission(caseId, {
        submitted_at: toIsoDateTime(submittedAt),
        note: note.trim() ? note.trim() : null
      });
      if (screenshotFile || appealFile || attachmentFiles.length > 0) {
        await uploadSubmissionFiles(submission.id, {
          screenshot: screenshotFile,
          appeal: appealFile,
          attachments: attachmentFiles
        });
      }
      return submission;
    },
    onSuccess: async () => {
      setCreateOpened(false);
      setSubmittedAt(toDateTimeLocalValue(new Date().toISOString()));
      setNote("");
      setScreenshotFile(null);
      setAppealFile(null);
      setAttachmentFiles([]);
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
            {submissions.map((submission, index) => (
              <Paper key={submission.id} withBorder radius="md" p="sm">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Badge color="blue" variant="filled">
                          {t("caseSubmission.submissionNo", { n: submissions.length - index })}
                        </Badge>
                        <Badge color={submissionResultColor(submission.result)} variant="light">
                          {t(`caseSubmissionResult.${submission.result}`)}
                        </Badge>
                        <Text fw={500}>{formatDateTime(submission.submitted_at)}</Text>
                        {daysSince(submission.submitted_at) !== null ? (
                          <Badge color="gray" variant="outline">
                            {t("caseSubmission.daysSince", { count: daysSince(submission.submitted_at) ?? 0 })}
                          </Badge>
                        ) : null}
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
                  <SubmissionFiles submission={submission} />
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
          <FileInput
            label={t("caseSubmission.fields.screenshot")}
            description={t("caseSubmission.fields.screenshotHint")}
            accept="image/*"
            value={screenshotFile}
            onChange={setScreenshotFile}
            clearable
          />
          <FileInput
            label={t("caseSubmission.fields.appeal")}
            description={t("caseSubmission.fields.appealHint")}
            value={appealFile}
            onChange={setAppealFile}
            clearable
          />
          <FileInput
            label={t("caseSubmission.fields.attachments")}
            description={t("caseSubmission.fields.attachmentsHint")}
            value={attachmentFiles}
            onChange={setAttachmentFiles}
            multiple
            clearable
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

function StepLegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Box w={10} h={10} style={{ borderRadius: "50%", backgroundColor: `var(--mantine-color-${color}-6)` }} />
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Group>
  );
}

// 顶部固定的案件导航卡:固定区(案件信息/担保人/提交周期/收款计划)+ 每步一个按钮,
// 步骤按钮按健康度着色;点击切换下方显示的卡片。
export type CaseNavItem = { key: string; label: string; tone?: StepTone };
type SectionNavDuration = { days: number; typicalDays: number };

function SectionNav({
  items,
  selected,
  onSelect,
  duration,
  heading
}: {
  items: CaseNavItem[];
  selected: string;
  onSelect: (key: string) => void;
  duration?: SectionNavDuration | null;
  heading?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      style={{
        position: "sticky",
        // 贴在固定 header(高 56)正下方,避免滚动时钻到 header 底下被遮挡。
        top: "var(--app-shell-header-height, 56px)",
        zIndex: 10,
        backgroundColor: "var(--mantine-color-body)"
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="sm" align="baseline">
            <Title order={4}>{heading || t("case.nav.title")}</Title>
            {duration ? (
              <Text
                span
                fw={700}
                size="xl"
                c={duration.days <= duration.typicalDays ? "green" : "orange"}
              >
                {t("caseStep.duration.sinceSigning", { days: duration.days })}
              </Text>
            ) : null}
          </Group>
          <Group gap="md" justify="flex-end">
            <StepLegendDot color="blue" label={t("caseStep.tone.progress")} />
            <StepLegendDot color="red" label={t("caseStep.tone.problem")} />
            <StepLegendDot color="green" label={t("caseStep.tone.done")} />
            <StepLegendDot color="gray" label={t("caseStep.tone.pending")} />
          </Group>
        </Group>
        <Group gap="xs">
          {items.map((item) => {
            const isSelected = item.key === selected;
            return (
              <Button
                key={item.key}
                size="sm"
                color={item.tone ? stepToneColor(item.tone) : "blue"}
                variant={isSelected ? "filled" : item.tone ? "light" : "default"}
                onClick={() => onSelect(item.key)}
              >
                {item.label}
              </Button>
            );
          })}
        </Group>
      </Stack>
    </Paper>
  );
}

export function CaseDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, can } = useAuth();
  const { id } = useParams();
  const [statusDraft, setStatusDraft] = useState<CaseStatus | null>(null);
  const [signedAtDraft, setSignedAtDraft] = useState<string | null>(null);
  const [companyNameDraft, setCompanyNameDraft] = useState<string>("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [caseCharges, setCaseCharges] = useState<Charge[]>([]);
  const [selectedPanel, setSelectedPanel] = useState<string>("");

  const caseQuery = useQuery({
    queryKey: ["business", "case", id],
    queryFn: () => getCase(id ?? ""),
    enabled: Boolean(id)
  });
  const clientsQuery = useQuery({
    queryKey: ["business", "clients"],
    queryFn: () => listClients()
  });
  const guarantorsQuery = useQuery({
    queryKey: ["business", "guarantors"],
    queryFn: () => listGuarantors()
  });
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: () => listEmployees()
  });
  const documentCategoriesQuery = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: () => listDocumentCategories()
  });
  // 补材料轮次:用来决定顶部是否显示红色「补材料」tab。queryKey 与 CaseResubmissionsPanel 一致,共享缓存。
  const resubmissionsQuery = useQuery({
    queryKey: ["business", "case", "resubmissions", id],
    queryFn: () => listResubmissions(id ?? ""),
    enabled: Boolean(id) && ["ep", "ica"].includes(caseQuery.data?.case?.business_type ?? "")
  });
  const updateCaseMutation = useMutation({
    mutationFn: ({
      caseId,
      status,
      signedAt,
      companyName
    }: {
      caseId: string;
      status: CaseStatus;
      signedAt: string | null;
      companyName: string | null;
    }) => updateCase(caseId, { status, signed_at: signedAt, company_name: companyName }),
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
  const hasResubmissions = (resubmissionsQuery.data?.resubmissions.length ?? 0) > 0;
  const navItems = useMemo<CaseNavItem[]>(() => {
    if (!caseItem) {
      return [];
    }
    const isEp = caseItem.business_type === "ep";
    const isIca = caseItem.business_type === "ica";
    const stepNavItems: CaseNavItem[] = [];
    if (isEp || isIca) {
      const doneCount = steps.filter((step) => step.status === "done").length;
      const tones = steps.map(stepTone);
      const aggregateTone: StepTone = tones.includes("problem")
        ? "problem"
        : steps.length > 0 && doneCount === steps.length
          ? "done"
          : tones.includes("progress")
            ? "progress"
            : "pending";
      stepNavItems.push({
        key: "steps",
        label: `${t("case.section.steps")} ${doneCount}/${steps.length}`,
        tone: aggregateTone
      });
      stepNavItems.push({ key: "files", label: t("case.section.files") });
      // 有补材料轮次时,多出一个红色「补材料」tab(tone:"problem" → 红);一轮都没有则不显示。
      if (hasResubmissions) {
        stepNavItems.push({ key: "resubmissions", label: t("case.section.resubmissions"), tone: "problem" });
      }
    }
    const items: CaseNavItem[] = [{ key: "info", label: t("case.section.info") }];
    if (isIca) {
      items.push({ key: "guarantor", label: t("case.section.guarantor") });
      // 提交周期(再申请记录)是 ICA 专属概念,EP 不显示
      items.push({ key: "submissions", label: t("case.section.submissions") });
    }
    if (isEp) {
      items.push({ key: "children", label: t("case.section.children") });
    }
    if (isEp || isIca) {
      items.push({ key: "charges", label: t("case.section.charges") });
    }
    if (isEp && caseItem.package_id) {
      items.push({ key: "addon", label: t("case.section.addon") });
      items.push({ key: "commission", label: t("case.section.commission") });
    }
    if (isEp || isIca) {
      return [...stepNavItems, ...items];
    } else {
      steps.forEach((step, index) => {
        items.push({ key: step.id, label: t("caseStep.stepNo", { n: index + 1 }), tone: stepTone(step) });
      });
    }
    return items;
  }, [caseItem, steps, hasResubmissions, t]);

  const effectiveSelected = navItems.some((item) => item.key === selectedPanel)
    ? selectedPanel
    : navItems[0]?.key ?? "info";

  const selectedStep = useMemo(
    () =>
      caseItem?.business_type === "ep" || caseItem?.business_type === "ica"
        ? null
        : steps.find((step) => step.id === effectiveSelected) ?? null,
    [caseItem?.business_type, steps, effectiveSelected]
  );
  const epDuration = useMemo<SectionNavDuration | null>(() => {
    if (caseItem?.business_type !== "ep" && caseItem?.business_type !== "ica") {
      return null;
    }

    const signingStep = steps.find((step) => step.step_order === 1);
    const start = parseDateTime(signingStep?.completed_at) ?? parseDateTime(caseItem.signed_at);
    if (!start) {
      return null;
    }

    const allDone = steps.length > 0 && steps.every((step) => step.status === "done");
    const latestDone = allDone
      ? Math.max(
          ...steps
            .filter((step) => step.status === "done")
            .map((step) => parseDateTime(step.completed_at))
            .filter((time): time is number => time !== null)
        )
      : Date.now();
    if (!Number.isFinite(latestDone)) {
      return null;
    }

    return { days: Math.max(0, Math.round((latestDone - start) / 86_400_000)), typicalDays: caseItem.business_type === "ica" ? 9999 : 21 };
  }, [caseItem, steps]);
  const clients = clientsQuery.data?.clients ?? [];
  const guarantors = guarantorsQuery.data?.guarantors ?? [];
  const employees = employeesQuery.data?.employees ?? [];
  const documentCategories = documentCategoriesQuery.data?.categories ?? [];
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client] as const)),
    [clients]
  );
  // EP 案件导航标题显示「客户名 · 公司名」(有哪个显示哪个);非 EP 或都为空时回落到默认「案件导航」。
  const navHeading = useMemo(() => {
    if (!caseItem || (caseItem.business_type !== "ep" && caseItem.business_type !== "ica")) {
      return null;
    }
    const client = clientById.get(caseItem.client_id ?? "");
    const clientLabel = client ? displayName(client.name, client.name_en) : "";
    const parts = [clientLabel, caseItem.company_name ?? ""].map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [caseItem, clientById]);
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee] as const)),
    [employees]
  );
  const chargesByStepId = useMemo(() => {
    const grouped = new Map<string, Charge[]>();
    caseCharges.forEach((charge) => {
      if (!charge.case_step_id) {
        return;
      }
      grouped.set(charge.case_step_id, [...(grouped.get(charge.case_step_id) ?? []), charge]);
    });
    return grouped;
  }, [caseCharges]);
  const handleChargesLoaded = useCallback((charges: Charge[]) => {
    setCaseCharges(charges);
  }, []);
  const statusOptions = caseStatuses.map((status) => ({
    value: status,
    label: t(`caseStatus.${status}`)
  }));
  const loadError =
    caseQuery.error ?? clientsQuery.error ?? employeesQuery.error ?? guarantorsQuery.error ?? documentCategoriesQuery.error;
  const canManageCases = can("case.manage");
  const location = useLocation();
  const setTabTitle = useSetTabTitle();

  useEffect(() => {
    if (caseItem) {
      setStatusDraft(caseItem.status);
      setSignedAtDraft(caseItem.signed_at ?? null);
      setCompanyNameDraft(caseItem.company_name ?? "");
    }
  }, [caseItem]);

  // 顶部标签页显示 "EP / 客户名"(ICA 同理),替换默认的原始路由路径
  useEffect(() => {
    if (!caseItem) {
      return;
    }
    const client = clientById.get(caseItem.client_id ?? "");
    const typeLabel = t(`businessType.${caseItem.business_type}`);
    const title = client?.name ? `${typeLabel} / ${client.name}` : typeLabel;
    setTabTitle(location.pathname, title);
  }, [caseItem, clientById, location.pathname, setTabTitle, t]);

  async function updateStatus() {
    if (!id || !statusDraft) {
      return;
    }

    setStatusError(null);
    try {
      await updateCaseMutation.mutateAsync({
        caseId: id,
        status: statusDraft,
        signedAt: signedAtDraft || null,
        companyName: companyNameDraft.trim() || null
      });
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
          <SectionNav items={navItems} selected={effectiveSelected} onSelect={setSelectedPanel} duration={epDuration} heading={navHeading} />

          {selectedStep ? (
            <StepCard
              step={selectedStep}
              caseId={caseItem.id}
              stepCharges={chargesByStepId.get(selectedStep.id) ?? []}
              employees={employees}
              employeeById={employeeById}
              canManageCases={canManageCases}
              currentUserId={user?.id}
              documentCategories={documentCategories}
            />
          ) : null}

          {effectiveSelected === "steps" && (caseItem.business_type === "ep" || caseItem.business_type === "ica") ? (
            <Stack gap="md">
              <EpStepsPanel
                steps={steps}
                caseId={caseItem.id}
                businessType={caseItem.business_type === "ica" ? "ica" : "ep"}
                canManageCases={canManageCases}
                employeeById={employeeById}
              />
              {/* 还没有补材料轮次时,面板留在步骤页底部用于建第一轮;有轮次后移到红色「补材料」tab。 */}
              {!hasResubmissions ? (
                <CaseResubmissionsPanel caseId={caseItem.id} canManage={canManageCases} />
              ) : null}
            </Stack>
          ) : null}

          {effectiveSelected === "resubmissions" && (caseItem.business_type === "ep" || caseItem.business_type === "ica") ? (
            <CaseResubmissionsPanel caseId={caseItem.id} canManage={canManageCases} />
          ) : null}

          {effectiveSelected === "files" && (caseItem.business_type === "ep" || caseItem.business_type === "ica") ? (
            <CaseFilesPanel caseId={caseItem.id} canManage={canManageCases} />
          ) : null}

          {effectiveSelected === "info" ? (
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
                    {caseItem.business_type === "ep" ? (
                      <Stack gap={2}>
                        <Text size="sm" c="dimmed">
                          {t("case.fields.companyName")}
                        </Text>
                        <Text fw={500}>{caseItem.company_name || t("common.not_available")}</Text>
                      </Stack>
                    ) : null}
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {t("case.fields.currentStep")}
                      </Text>
                      <Text fw={500}>{caseItem.current_step ?? t("common.not_available")}</Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text size="sm" c="dimmed">
                        {t("case.fields.signedAt")}
                      </Text>
                      <Text fw={500}>{formatDate(caseItem.signed_at)}</Text>
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
                  <TextInput
                    type="date"
                    label={t("case.fields.signedAt")}
                    value={signedAtDraft ?? ""}
                    onChange={(event) => setSignedAtDraft(event.currentTarget.value || null)}
                  />
                  {caseItem.business_type === "ep" ? (
                    <TextInput
                      label={t("case.fields.companyName")}
                      placeholder={t("case.fields.companyNamePlaceholder")}
                      value={companyNameDraft}
                      onChange={(event) => setCompanyNameDraft(event.currentTarget.value)}
                    />
                  ) : null}
                  {statusDraft !== caseItem.status ||
                  signedAtDraft !== (caseItem.signed_at ?? null) ||
                  companyNameDraft.trim() !== (caseItem.company_name ?? "") ? (
                    <Button onClick={updateStatus} loading={updateCaseMutation.isPending}>
                      {t("case.updateStatus")}
                    </Button>
                  ) : null}
                </Group>
              </Group>
            </Stack>
          </Paper>
          ) : null}

          {effectiveSelected === "guarantor" && caseItem.business_type === "ica" ? (
            <GuarantorSection
              caseItem={caseItem}
              guarantor={guarantor}
              guarantors={guarantors}
              canManageCases={canManageCases}
            />
          ) : null}

          {effectiveSelected === "children" && caseItem.business_type === "ep" ? (
            <DpChildrenSection
              parentCaseId={caseItem.id}
              children={children}
              clients={clients}
              canManageCases={canManageCases}
            />
          ) : null}

          {effectiveSelected === "submissions" && caseItem.business_type === "ica" ? (
            <SubmissionTimeline
              caseId={caseItem.id}
              submissions={submissions}
              canManageCases={canManageCases}
            />
          ) : null}

          {effectiveSelected === "addon" && caseItem.business_type === "ep" && caseItem.package_id ? (
            <AddonServicesPanel
              caseId={caseItem.id}
              caseStepsInfo={steps.map((step) => ({ id: step.id, step_order: step.step_order, name: step.name }))}
              onGoToCharges={() => setSelectedPanel("charges")}
            />
          ) : null}

          {effectiveSelected === "commission" && caseItem.business_type === "ep" && caseItem.package_id ? (
            <CaseCommissionPanel
              caseId={caseItem.id}
              employees={employees}
              canManageCases={canManageCases}
            />
          ) : null}

          {/* 收款计划:始终挂载(用于加载 charges 供步骤卡使用),未选中时隐藏 */}
          {caseItem.business_type === "ep" || caseItem.business_type === "ica" ? (
            <div style={{ display: effectiveSelected === "charges" ? undefined : "none" }}>
              <ChargeSchedulePanel
                billingId={caseItem.billing_id ?? null}
                caseId={caseItem.id}
                caseBusinessType={caseItem.business_type}
                icaSchemeVersionId={caseItem.fee_scheme_version_id ?? null}
                onChargesLoaded={handleChargesLoaded}
              />
            </div>
          ) : null}

        </>
      ) : (
        <Text c="dimmed">{t("case.notFound")}</Text>
      )}
    </Stack>
  );
}
