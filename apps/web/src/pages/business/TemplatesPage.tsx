import { zodResolver } from "@hookform/resolvers/zod";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Input,
  Loader,
  Modal,
  NumberInput,
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
  businessTypes,
  roles,
  templateStepCreateSchema,
  templateStepUpdateSchema,
  workflowTemplateCreateSchema,
  workflowTemplateUpdateSchema,
  type BusinessType,
  type RequiredDocItemInput,
  type Role,
  type TemplateStepCreateInput,
  type TemplateStepUpdateInput,
  type WorkflowTemplateCreateInput,
  type WorkflowTemplateUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { CategorySelect } from "../../components/CategorySelect";
import { getCollectionItems } from "../../api/collectionItems";
import {
  createTemplate,
  createTemplateStep,
  deleteTemplateStep,
  getTemplate,
  listTemplates,
  updateTemplate,
  updateTemplateStep,
  type TemplateStep,
  type WorkflowTemplate
} from "../../api/cases";
import { listDocumentCategories } from "../../api/dms";

type TemplateFormValues = {
  business_type?: BusinessType | undefined;
  name?: string | undefined;
};

type StepFormValues = {
  step_order?: number | null | undefined;
  name?: string | undefined;
  name_en?: string | undefined;
  description?: string | null | undefined;
  required_documents?: RequiredDocItemInput[] | undefined;
  collections?: StepCollectionFormValue[] | undefined;
  default_assignee_role?: Role | null | undefined;
};

type StepCollectionFormValue = {
  collection_item_id: string;
  required?: boolean | undefined;
};

const templateQueryKey = ["business", "workflow-templates"] as const;
const caseManageRoles = new Set(["owner", "admin", "clerk", "sales"]);

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const emptyToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

type TemplatesPageProps = {
  businessType?: Extract<BusinessType, "ep" | "ica">;
};

function getTemplateDefaultValues(
  template?: WorkflowTemplate,
  businessType?: Extract<BusinessType, "ep" | "ica">
): TemplateFormValues {
  return {
    business_type: template?.business_type ?? businessType ?? "ep",
    name: template?.name ?? ""
  };
}

function getStepDefaultValues(step?: TemplateStep): StepFormValues {
  return {
    step_order: step?.step_order ?? null,
    name: step?.name ?? "",
    name_en: step?.name_en ?? undefined,
    description: step?.description ?? null,
    required_documents: step?.required_documents ?? [],
    collections: step?.collections ?? [],
    default_assignee_role: step?.default_assignee_role ?? null
  };
}

function normalizeStepValues(values: StepFormValues): TemplateStepCreateInput {
  return {
    ...values,
    step_order: values.step_order ?? undefined,
    required_documents: values.required_documents ?? [],
    collections: values.collections ?? []
  } as TemplateStepCreateInput;
}

export function TemplatesPage({ businessType }: TemplatesPageProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [businessTypeFilter, setBusinessTypeFilter] = useState<BusinessType | null>(businessType ?? null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateModalOpened, setTemplateModalOpened] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);
  const [stepModalOpened, setStepModalOpened] = useState(false);
  const [editingStep, setEditingStep] = useState<TemplateStep | null>(null);
  const [stepFormError, setStepFormError] = useState<string | null>(null);
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocItemInput[]>([]);
  const [stepCollections, setStepCollections] = useState<StepCollectionFormValue[]>([]);
  const canManageCases = user ? caseManageRoles.has(user.role) : false;

  const templatesQuery = useQuery({
    queryKey: [...templateQueryKey, businessType ?? businessTypeFilter],
    queryFn: () => listTemplates(businessType ?? businessTypeFilter ?? undefined)
  });
  const selectedTemplateQuery = useQuery({
    queryKey: [...templateQueryKey, selectedTemplateId],
    queryFn: () => getTemplate(selectedTemplateId ?? ""),
    enabled: Boolean(selectedTemplateId)
  });
  const documentCategoriesQuery = useQuery({
    queryKey: ["documents", "categories"],
    queryFn: listDocumentCategories
  });
  const collectionItemsQuery = useQuery({
    queryKey: ["collection-items"],
    queryFn: getCollectionItems
  });

  const templateForm = useForm<TemplateFormValues>({
    resolver: zodResolver(
      editingTemplate ? workflowTemplateUpdateSchema : workflowTemplateCreateSchema
    ) as Resolver<TemplateFormValues>,
    defaultValues: getTemplateDefaultValues(editingTemplate ?? undefined, businessType)
  });
  const stepForm = useForm<StepFormValues>({
    resolver: zodResolver(editingStep ? templateStepUpdateSchema : templateStepCreateSchema) as Resolver<StepFormValues>,
    defaultValues: getStepDefaultValues(editingStep ?? undefined)
  });

  const createTemplateMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKey });
      setSelectedTemplateId(data.template.id);
      closeTemplateModal();
    }
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WorkflowTemplateUpdateInput }) => updateTemplate(id, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: templateQueryKey });
      await queryClient.invalidateQueries({ queryKey: [...templateQueryKey, variables.id] });
      closeTemplateModal();
    }
  });
  const createStepMutation = useMutation({
    mutationFn: ({ templateId, body }: { templateId: string; body: TemplateStepCreateInput }) =>
      createTemplateStep(templateId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: [...templateQueryKey, variables.templateId] });
      closeStepModal();
    }
  });
  const updateStepMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TemplateStepUpdateInput }) => updateTemplateStep(id, body),
    onSuccess: async () => {
      if (selectedTemplateId) {
        await queryClient.invalidateQueries({ queryKey: [...templateQueryKey, selectedTemplateId] });
      }
      closeStepModal();
    }
  });
  const deleteStepMutation = useMutation({
    mutationFn: deleteTemplateStep,
    onSuccess: async () => {
      if (selectedTemplateId) {
        await queryClient.invalidateQueries({ queryKey: [...templateQueryKey, selectedTemplateId] });
      }
    }
  });

  const templates = templatesQuery.data?.templates ?? [];
  const selectedTemplate = selectedTemplateQuery.data?.template;
  const steps = selectedTemplateQuery.data?.steps ?? [];
  const templateErrors = templateForm.formState.errors;
  const stepErrors = stepForm.formState.errors;
  const isSavingTemplate = createTemplateMutation.isPending || updateTemplateMutation.isPending;
  const isSavingStep = createStepMutation.isPending || updateStepMutation.isPending;
  const businessTypeOptions = businessTypes.map((type) => ({
    value: type,
    label: t(`businessType.${type}`)
  }));
  const roleOptions = roles.map((role) => ({
    value: role,
    label: t(`role.${role}`)
  }));
  const documentCategories = documentCategoriesQuery.data?.categories ?? [];
  const collectionItems = collectionItemsQuery.data?.collection_items ?? [];
  const collectionItemOptions = collectionItems.map((item) => ({
    value: item.id,
    label: displayName(item.name, item.name_en)
  }));
  const documentCategoryNameById = useMemo(
    () => new Map(documentCategories.map((category) => [category.id, displayName(category.name, category.name_en)])),
    [documentCategories]
  );
  const collectionItemNameById = useMemo(
    () => new Map(collectionItems.map((item) => [item.id, displayName(item.name, item.name_en)])),
    [collectionItems]
  );
  const selectedTemplateInList = useMemo(
    () => templates.some((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates]
  );

  useEffect(() => {
    if (templatesQuery.isLoading) {
      return;
    }

    if (selectedTemplateId && selectedTemplateInList) {
      return;
    }

    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, selectedTemplateInList, templates, templatesQuery.isLoading]);

  function syncRequiredDocs(nextDocs: RequiredDocItemInput[]) {
    setRequiredDocs(nextDocs);
    stepForm.setValue("required_documents", nextDocs, { shouldDirty: true, shouldValidate: false });
  }

  function syncStepCollections(nextCollections: StepCollectionFormValue[]) {
    setStepCollections(nextCollections);
    stepForm.setValue("collections", nextCollections, { shouldDirty: true, shouldValidate: false });
  }

  function openCreateTemplateModal() {
    setEditingTemplate(null);
    setTemplateFormError(null);
    templateForm.reset(getTemplateDefaultValues(undefined, businessType));
    setTemplateModalOpened(true);
  }

  function openEditTemplateModal(template: WorkflowTemplate) {
    setEditingTemplate(template);
    setTemplateFormError(null);
    templateForm.reset(getTemplateDefaultValues(template, businessType));
    setTemplateModalOpened(true);
  }

  function closeTemplateModal() {
    setTemplateModalOpened(false);
    setEditingTemplate(null);
    setTemplateFormError(null);
    templateForm.reset(getTemplateDefaultValues(undefined, businessType));
  }

  function openCreateStepModal() {
    setEditingStep(null);
    setStepFormError(null);
    syncRequiredDocs([]);
    syncStepCollections([]);
    stepForm.reset(getStepDefaultValues());
    setStepModalOpened(true);
  }

  function openEditStepModal(step: TemplateStep) {
    setEditingStep(step);
    setStepFormError(null);
    setRequiredDocs(step.required_documents);
    setStepCollections(step.collections);
    stepForm.reset(getStepDefaultValues(step));
    setStepModalOpened(true);
  }

  function closeStepModal() {
    setStepModalOpened(false);
    setEditingStep(null);
    setStepFormError(null);
    setRequiredDocs([]);
    setStepCollections([]);
    stepForm.reset(getStepDefaultValues());
  }

  function addRequiredDoc() {
    syncRequiredDocs([...requiredDocs, { name: "", name_en: undefined, required: true }]);
  }

  function updateRequiredDoc(index: number, patch: Partial<RequiredDocItemInput>) {
    const nextDocs = requiredDocs.map((doc, docIndex) => (docIndex === index ? { ...doc, ...patch } : doc));
    syncRequiredDocs(nextDocs);
  }

  function removeRequiredDoc(index: number) {
    syncRequiredDocs(requiredDocs.filter((_doc, docIndex) => docIndex !== index));
  }

  function addStepCollection() {
    syncStepCollections([...stepCollections, { collection_item_id: "", required: true }]);
  }

  function updateStepCollection(index: number, patch: Partial<StepCollectionFormValue>) {
    const nextCollections = stepCollections.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    );
    syncStepCollections(nextCollections);
  }

  function removeStepCollection(index: number) {
    syncStepCollections(stepCollections.filter((_item, itemIndex) => itemIndex !== index));
  }

  function getDocumentCategoryName(categoryId?: string | null) {
    return categoryId ? documentCategoryNameById.get(categoryId) ?? t("common.uncategorized") : t("common.uncategorized");
  }

  function getCollectionItemName(collectionItemId?: string | null) {
    return collectionItemId
      ? collectionItemNameById.get(collectionItemId) ?? t("collectionItem.unknown")
      : t("collectionItem.unknown");
  }

  async function handleDeleteStep(step: TemplateStep) {
    if (!window.confirm(t("templateStep.confirmDelete", { name: step.name }))) {
      return;
    }

    await deleteStepMutation.mutateAsync(step.id);
  }

  const onTemplateSubmit = templateForm.handleSubmit(async (values) => {
    setTemplateFormError(null);

    try {
      if (editingTemplate) {
        await updateTemplateMutation.mutateAsync({
          id: editingTemplate.id,
          body: { ...values, business_type: businessType ?? values.business_type }
        });
        return;
      }

      await createTemplateMutation.mutateAsync({
        ...values,
        business_type: businessType ?? values.business_type
      } as WorkflowTemplateCreateInput);
    } catch (error) {
      setTemplateFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onStepSubmit = stepForm.handleSubmit(async (values) => {
    if (!selectedTemplateId) {
      return;
    }

    setStepFormError(null);

    try {
      const collections = stepCollections.filter((item) => item.collection_item_id);
      const body = normalizeStepValues({ ...values, required_documents: requiredDocs, collections });
      if (editingStep) {
        await updateStepMutation.mutateAsync({ id: editingStep.id, body: body as TemplateStepUpdateInput });
        return;
      }

      await createStepMutation.mutateAsync({ templateId: selectedTemplateId, body });
    } catch (error) {
      setStepFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Group align="flex-end">
          <Title order={2}>{t("template.title")}</Title>
          {businessType ? null : (
            <Select
              label={t("template.filters.businessType")}
              data={businessTypeOptions}
              value={businessTypeFilter}
              onChange={(value) => setBusinessTypeFilter(value as BusinessType | null)}
              clearable
              w={220}
            />
          )}
        </Group>
        {canManageCases ? <Button onClick={openCreateTemplateModal}>{t("template.add")}</Button> : null}
      </Group>

      {templatesQuery.error ? (
        <Alert color="red" variant="light">
          {templatesQuery.error instanceof Error ? templatesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper withBorder radius="md">
          <ScrollArea>
            <Table miw={520} verticalSpacing="sm" striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("template.fields.name")}</Table.Th>
                  <Table.Th>{t("template.fields.businessType")}</Table.Th>
                  {canManageCases ? <Table.Th>{t("common.actions")}</Table.Th> : null}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {templatesQuery.isLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={canManageCases ? 3 : 2}>
                      <Group justify="center" py="lg">
                        <Loader size="sm" />
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ) : templates.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={canManageCases ? 3 : 2}>
                      <Text ta="center" c="dimmed" py="lg">
                        {t("template.empty")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  templates.map((template) => (
                    <Table.Tr
                      key={template.id}
                      style={{
                        cursor: "pointer",
                        ...(template.id === selectedTemplateId
                          ? { backgroundColor: "var(--mantine-color-blue-light)" }
                          : {})
                      }}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <Table.Td>{template.name}</Table.Td>
                      <Table.Td>{t(`businessType.${template.business_type}`)}</Table.Td>
                      {canManageCases ? (
                        <Table.Td>
                          <Button
                            size="xs"
                            variant="light"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditTemplateModal(template);
                            }}
                          >
                            {t("common.edit")}
                          </Button>
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Paper>

        <Paper withBorder radius="md" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Title order={3}>{selectedTemplate?.name ?? t("templateStep.title")}</Title>
                <Text size="sm" c="dimmed">
                  {selectedTemplate ? t(`businessType.${selectedTemplate.business_type}`) : t("templateStep.selectHint")}
                </Text>
              </div>
              {canManageCases ? (
                <Button onClick={openCreateStepModal} disabled={!selectedTemplateId}>
                  {t("templateStep.add")}
                </Button>
              ) : null}
            </Group>

            {selectedTemplateQuery.error ? (
              <Alert color="red" variant="light">
                {selectedTemplateQuery.error instanceof Error
                  ? selectedTemplateQuery.error.message
                  : t("common.unknown_error")}
              </Alert>
            ) : null}

            {selectedTemplateQuery.isLoading ? (
              <Group justify="center" py="lg">
                <Loader size="sm" />
              </Group>
            ) : !selectedTemplateId ? (
              <Text ta="center" c="dimmed" py="lg">
                {t("templateStep.selectHint")}
              </Text>
            ) : steps.length === 0 ? (
              <Text ta="center" c="dimmed" py="lg">
                {t("templateStep.empty")}
              </Text>
            ) : (
              <Stack gap="sm">
                {steps.map((step) => (
                  <Paper key={step.id} withBorder radius="md" p="md">
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start" gap="sm">
                        <div>
                          <Text fw={600}>{`${step.step_order}. ${displayName(step.name, step.name_en)}`}</Text>
                        </div>
                        {canManageCases ? (
                          <Group gap="xs" wrap="nowrap">
                            <Button size="xs" variant="light" onClick={() => openEditStepModal(step)}>
                              {t("common.edit")}
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              loading={deleteStepMutation.isPending}
                              onClick={() => void handleDeleteStep(step)}
                            >
                              {t("common.delete")}
                            </Button>
                          </Group>
                        ) : null}
                      </Group>

                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <div>
                          <Text size="xs" c="dimmed">
                            {t("templateStep.fields.description")}
                          </Text>
                          <Text size="sm">{step.description ?? t("common.not_available")}</Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">
                            {t("templateStep.fields.defaultAssigneeRole")}
                          </Text>
                          <Text size="sm">
                            {step.default_assignee_role
                              ? t(`role.${step.default_assignee_role}`)
                              : t("common.not_available")}
                          </Text>
                        </div>
                      </SimpleGrid>

                      <Stack gap={6}>
                        <Text size="xs" c="dimmed">
                          {t("templateStep.fields.requiredDocuments")}
                        </Text>
                        {step.required_documents.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            {t("requiredDoc.empty")}
                          </Text>
                        ) : (
                          step.required_documents.map((doc, index) => (
                            <Group key={`${doc.name}-${index}`} gap="xs" wrap="wrap">
                              <Text size="sm">{displayName(doc.name, doc.name_en)}</Text>
                              <Badge size="sm" variant="light">
                                {getDocumentCategoryName(doc.category_id)}
                              </Badge>
                              <Badge size="sm" color={doc.required ? "green" : "gray"} variant="light">
                                {doc.required ? t("requiredDoc.fields.required") : t("requiredDoc.fields.optional")}
                              </Badge>
                            </Group>
                          ))
                        )}
                      </Stack>

                      <Stack gap={6}>
                        <Text size="xs" c="dimmed">
                          {t("collectionBinding.title")}
                        </Text>
                        {step.collections.length === 0 ? (
                          <Text size="sm" c="dimmed">
                            {t("collectionBinding.empty")}
                          </Text>
                        ) : (
                          step.collections.map((item, index) => (
                            <Group key={`${item.collection_item_id}-${index}`} gap="xs" wrap="wrap">
                              <Text size="sm">{getCollectionItemName(item.collection_item_id)}</Text>
                              <Badge size="sm" color={item.required ? "green" : "gray"} variant="light">
                                {item.required
                                  ? t("collectionBinding.fields.required")
                                  : t("collectionBinding.fields.optional")}
                              </Badge>
                            </Group>
                          ))
                        )}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Modal
        opened={templateModalOpened}
        onClose={closeTemplateModal}
        title={editingTemplate ? t("template.edit") : t("template.add")}
        size="md"
      >
        <form onSubmit={onTemplateSubmit}>
          <Stack gap="md">
            {templateFormError ? (
              <Alert color="red" variant="light">
                {templateFormError}
              </Alert>
            ) : null}
            {businessType ? null : (
              <Controller
                control={templateForm.control}
                name="business_type"
                render={({ field }) => (
                  <Select
                    label={t("template.fields.businessType")}
                    data={businessTypeOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as BusinessType | null)}
                    error={templateErrors.business_type?.message}
                  />
                )}
              />
            )}
            <TextInput
              label={t("template.fields.name")}
              error={templateErrors.name?.message}
              {...templateForm.register("name")}
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeTemplateModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingTemplate}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={stepModalOpened}
        onClose={closeStepModal}
        title={editingStep ? t("templateStep.edit") : t("templateStep.add")}
        size="xl"
      >
        <form onSubmit={onStepSubmit}>
          <Stack gap="md">
            {stepFormError ? (
              <Alert color="red" variant="light">
                {stepFormError}
              </Alert>
            ) : null}
            <Group grow align="flex-start">
              <TextInput
                label={t("templateStep.fields.name")}
                error={stepErrors.name?.message}
                {...stepForm.register("name")}
              />
              <TextInput
                label={t("templateStep.fields.nameEn")}
                error={stepErrors.name_en?.message}
                {...stepForm.register("name_en", { setValueAs: emptyToUndefined })}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={stepForm.control}
                name="step_order"
                render={({ field }) => (
                  <NumberInput
                    label={t("templateStep.fields.stepOrder")}
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(typeof value === "number" ? value : null)}
                    error={stepErrors.step_order?.message}
                  />
                )}
              />
              <Controller
                control={stepForm.control}
                name="default_assignee_role"
                render={({ field }) => (
                  <Select
                    label={t("templateStep.fields.defaultAssigneeRole")}
                    data={roleOptions}
                    value={field.value ?? null}
                    onChange={(value) => field.onChange(value as Role | null)}
                    error={stepErrors.default_assignee_role?.message}
                    clearable
                  />
                )}
              />
            </Group>
            <Textarea
              label={t("templateStep.fields.description")}
              error={stepErrors.description?.message}
              {...stepForm.register("description", { setValueAs: emptyToNull })}
            />

            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={500}>{t("requiredDoc.title")}</Text>
                <Button size="xs" variant="light" onClick={addRequiredDoc}>
                  {t("requiredDoc.add")}
                </Button>
              </Group>
              {requiredDocs.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("requiredDoc.empty")}
                </Text>
              ) : (
                requiredDocs.map((doc, index) => (
                  <Group key={index} align="flex-end" wrap="wrap">
                    <TextInput
                      label={t("requiredDoc.fields.name")}
                      value={doc.name}
                      onChange={(event) => updateRequiredDoc(index, { name: event.currentTarget.value })}
                      style={{ flex: "1 1 180px" }}
                    />
                    <TextInput
                      label={t("requiredDoc.fields.nameEn")}
                      value={doc.name_en ?? ""}
                      onChange={(event) =>
                        updateRequiredDoc(index, { name_en: event.currentTarget.value.trim() || undefined })
                      }
                      style={{ flex: "1 1 180px" }}
                    />
                    <Input.Wrapper label={t("requiredDoc.fields.category")} style={{ flex: "1 1 220px" }}>
                      <CategorySelect
                        value={doc.category_id ?? null}
                        onChange={(value) => updateRequiredDoc(index, { category_id: value })}
                        placeholder={t("requiredDoc.placeholders.category")}
                      />
                    </Input.Wrapper>
                    <Checkbox
                      label={t("requiredDoc.fields.required")}
                      checked={doc.required}
                      onChange={(event) => updateRequiredDoc(index, { required: event.currentTarget.checked })}
                      pb={8}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      aria-label={t("common.delete")}
                      onClick={() => removeRequiredDoc(index)}
                      mb={2}
                    >
                      x
                    </ActionIcon>
                  </Group>
                ))
              )}
              {stepErrors.required_documents ? (
                <Text size="sm" c="red">
                  {t("requiredDoc.invalid")}
                </Text>
              ) : null}
            </Stack>

            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text fw={500}>{t("collectionBinding.title")}</Text>
                <Button size="xs" variant="light" onClick={addStepCollection}>
                  {t("collectionBinding.add")}
                </Button>
              </Group>
              {collectionItemsQuery.error ? (
                <Alert color="red" variant="light">
                  {collectionItemsQuery.error instanceof Error
                    ? collectionItemsQuery.error.message
                    : t("common.unknown_error")}
                </Alert>
              ) : null}
              {stepCollections.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("collectionBinding.empty")}
                </Text>
              ) : (
                stepCollections.map((item, index) => (
                  <Group key={index} align="flex-end" wrap="wrap">
                    <Select
                      label={t("collectionBinding.fields.collectionItem")}
                      data={collectionItemOptions}
                      value={item.collection_item_id || null}
                      onChange={(value) => updateStepCollection(index, { collection_item_id: value ?? "" })}
                      searchable
                      disabled={collectionItemsQuery.isLoading}
                      style={{ flex: "1 1 280px" }}
                    />
                    <Checkbox
                      label={t("collectionBinding.fields.required")}
                      checked={item.required ?? true}
                      onChange={(event) => updateStepCollection(index, { required: event.currentTarget.checked })}
                      pb={8}
                    />
                    <ActionIcon
                      color="red"
                      variant="light"
                      aria-label={t("common.delete")}
                      onClick={() => removeStepCollection(index)}
                      mb={2}
                    >
                      x
                    </ActionIcon>
                  </Group>
                ))
              )}
              {stepErrors.collections ? (
                <Text size="sm" c="red">
                  {t("collectionBinding.invalid")}
                </Text>
              ) : null}
            </Stack>

            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeStepModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingStep}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
