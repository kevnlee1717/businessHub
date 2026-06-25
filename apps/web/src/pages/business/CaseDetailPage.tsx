import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Loader,
  Paper,
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
  caseStatuses,
  caseStepDocCreateSchema,
  caseStepStatuses,
  type CaseStatus,
  type CaseStepDocCreateInput,
  type CaseStepDocStatus,
  type CaseStepStatus
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createCaseStepDoc,
  createFollowUp,
  getCase,
  listClients,
  listFollowUps,
  updateCase,
  updateCaseStep,
  updateCaseStepDoc,
  uploadCaseStepDoc,
  type CaseStep,
  type CaseStepDoc,
  type Client
} from "../../api/cases";
import { listEmployees, type Employee } from "../../api/hr";
import { useAuth } from "../../auth/AuthContext";

type DocFormValues = {
  doc_name?: string | undefined;
  doc_name_en?: string | undefined;
  is_required?: boolean | undefined;
};

const caseManageRoles = new Set(["owner", "admin", "clerk", "sales"]);

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
    default:
      return "yellow";
  }
}

function docStatusColor(status: CaseStepDocStatus) {
  return status === "uploaded" ? "green" : "yellow";
}

function getDocDefaultValues(): DocFormValues {
  return {
    doc_name: "",
    doc_name_en: undefined,
    is_required: true
  };
}

type DocumentRowProps = {
  doc: CaseStepDoc;
  caseId: string;
  canManageCases: boolean;
};

function DocumentRow({ doc, caseId, canManageCases }: DocumentRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: ({ docId, selectedFile }: { docId: string; selectedFile: File }) =>
      uploadCaseStepDoc(docId, selectedFile),
    onSuccess: async () => {
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });
  const unlinkMutation = useMutation({
    mutationFn: () => updateCaseStepDoc(doc.id, { document_id: null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", caseId] });
    }
  });

  async function upload() {
    if (!file) {
      return;
    }

    setError(null);
    try {
      await uploadMutation.mutateAsync({ docId: doc.id, selectedFile: file });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t("common.unknown_error"));
    }
  }

  async function unlink() {
    setError(null);
    try {
      await unlinkMutation.mutateAsync();
    } catch (unlinkError) {
      setError(unlinkError instanceof Error ? unlinkError.message : t("common.unknown_error"));
    }
  }

  return (
    <Table.Tr>
      <Table.Td>
        <Stack gap={2}>
          <Group gap="xs">
            <Text fw={500}>{displayName(doc.doc_name, doc.doc_name_en)}</Text>
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
        {canManageCases && doc.status === "missing" ? (
          <Group gap="xs" wrap="nowrap">
            <FileInput
              size="xs"
              value={file}
              onChange={setFile}
              placeholder={t("caseStepDoc.chooseFile")}
              clearable
            />
            <Button size="xs" onClick={upload} loading={uploadMutation.isPending} disabled={!file}>
              {t("common.upload")}
            </Button>
          </Group>
        ) : doc.status === "uploaded" ? (
          <Group gap="xs">
            <Badge color="green" variant="light">
              {t("caseStepDoc.uploaded")}
            </Badge>
            {canManageCases ? (
              <Button size="xs" variant="light" color="red" onClick={unlink} loading={unlinkMutation.isPending}>
                {t("caseStepDoc.unlink")}
              </Button>
            ) : null}
          </Group>
        ) : (
          t("common.not_available")
        )}
      </Table.Td>
    </Table.Tr>
  );
}

type StepCardProps = {
  step: CaseStep;
  caseId: string;
  employeeById: Map<string, Employee>;
  canManageCases: boolean;
};

function StepCard({ step, caseId, employeeById, canManageCases }: StepCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stepError, setStepError] = useState<string | null>(null);
  const [docFormOpened, setDocFormOpened] = useState(false);
  const [followUpContent, setFollowUpContent] = useState("");
  const [followUpError, setFollowUpError] = useState<string | null>(null);

  const followUpsQuery = useQuery({
    queryKey: ["business", "case-step-follow-ups", step.id],
    queryFn: () => listFollowUps(step.id)
  });
  const updateStepMutation = useMutation({
    mutationFn: (status: CaseStepStatus) => updateCaseStep(step.id, { status }),
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

  const docForm = useForm<DocFormValues>({
    resolver: zodResolver(caseStepDocCreateSchema) as Resolver<DocFormValues>,
    defaultValues: getDocDefaultValues()
  });

  const stepStatusOptions = caseStepStatuses.map((status) => ({
    value: status,
    label: t(`caseStepStatus.${status}`)
  }));
  const assignee = step.assignee_id ? employeeById.get(step.assignee_id) : undefined;
  const followUps = followUpsQuery.data?.followUps ?? [];
  const docErrors = docForm.formState.errors;

  async function updateStepStatus(status: string | null) {
    if (!status) {
      return;
    }

    setStepError(null);
    try {
      await updateStepMutation.mutateAsync(status as CaseStepStatus);
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
            </Group>
            {step.description ? <Text c="dimmed">{step.description}</Text> : null}
            <Text size="sm" c="dimmed">
              {t("caseStep.fields.assignee")}:{" "}
              {assignee ? displayName(assignee.name, assignee.name_en) : t("common.not_available")}
            </Text>
            {step.completed_at ? (
              <Text size="sm" c="dimmed">
                {t("caseStep.fields.completedAt")}: {formatDateTime(step.completed_at)}
              </Text>
            ) : null}
          </Stack>
          {canManageCases ? (
            <Select
              w={180}
              data={stepStatusOptions}
              value={step.status}
              onChange={updateStepStatus}
              disabled={updateStepMutation.isPending}
            />
          ) : null}
        </Group>

        {stepError ? (
          <Alert color="red" variant="light">
            {stepError}
          </Alert>
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
                <Table.Th>{t("common.actions")}</Table.Th>
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
                  <DocumentRow key={doc.id} doc={doc} caseId={caseId} canManageCases={canManageCases} />
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
  const employeesQuery = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: listEmployees
  });
  const updateCaseMutation = useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: CaseStatus }) =>
      updateCase(caseId, { status }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["business", "case", variables.caseId] });
    }
  });

  const caseItem = caseQuery.data?.case;
  const steps = useMemo(
    () => [...(caseQuery.data?.steps ?? [])].sort((a, b) => a.step_order - b.step_order),
    [caseQuery.data?.steps]
  );
  const clients = clientsQuery.data?.clients ?? [];
  const employees = employeesQuery.data?.employees ?? [];
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
  const loadError = caseQuery.error ?? clientsQuery.error ?? employeesQuery.error;
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

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>{t("case.detailTitle")}</Title>
        <Button variant="subtle" onClick={() => navigate("/business/cases")}>
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
                          {caseItem.guarantor_name ?? t("common.not_available")}
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
                  employeeById={employeeById}
                  canManageCases={canManageCases}
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
