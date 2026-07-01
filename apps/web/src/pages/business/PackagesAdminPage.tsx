import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea
} from "@mantine/core";
import {
  packageMilestoneSchema,
  serviceCategories,
  serviceItemCreateSchema,
  serviceItemUpdateSchema,
  servicePackageCreateSchema,
  servicePackageUpdateSchema,
  type PackageMilestoneInput,
  type ServiceCategory,
  type ServiceItemCreateInput,
  type ServiceItemUpdateInput,
  type ServicePackageCreateInput,
  type ServicePackageUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  createPackage,
  createServiceItem,
  listPackages,
  listServiceItems,
  setPackageItems,
  setPackageMilestones,
  updatePackage,
  updateServiceItem,
  type PackageMilestone,
  type ServiceItem,
  type ServicePackageWithDetails
} from "../../api/epPackages";
import { useAuth } from "../../auth/AuthContext";

type ServiceItemFormValues = {
  code?: string;
  name?: string;
  name_en?: string;
  category?: ServiceCategory;
  default_price_sgd?: string | number;
  is_core?: boolean;
  billable?: boolean;
  active?: boolean;
  sort_order?: number;
};

type PackageFormValues = {
  code?: string;
  name?: string;
  name_en?: string;
  base_price_sgd?: string | number;
  tagline?: string | null;
  is_recommended?: boolean;
  active?: boolean;
  sort_order?: number;
  serviceItemIds: string[];
  milestones: PackageMilestoneInput[];
};

const serviceItemsQueryKey = ["ep-packages", "service-items"] as const;
const packagesQueryKey = ["ep-packages", "packages"] as const;
const packageEditorSchema = servicePackageCreateSchema
  .extend({
    serviceItemIds: z.array(z.string()),
    milestones: z.array(packageMilestoneSchema)
  });
const packageEditorUpdateSchema = servicePackageUpdateSchema.extend({
  serviceItemIds: z.array(z.string()),
  milestones: z.array(packageMilestoneSchema)
});

function money(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? `SGD ${numeric.toFixed(2)}` : "SGD 0.00";
}

function emptyToNull(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}

function serviceItemDefaults(item?: ServiceItem): ServiceItemFormValues {
  return {
    code: item?.code ?? "",
    name: item?.name ?? "",
    name_en: item?.name_en ?? "",
    category: item?.category ?? "core_ep",
    default_price_sgd: item?.default_price_sgd ?? "0",
    is_core: item?.is_core ?? false,
    billable: item?.billable ?? true,
    active: item?.active ?? true,
    sort_order: item?.sort_order ?? 0
  };
}

function milestoneDefaults(milestone?: PackageMilestone): PackageMilestoneInput {
  return {
    seq: milestone?.seq ?? 1,
    label: milestone?.label ?? "",
    label_en: milestone?.label_en ?? "",
    amount_sgd: milestone?.amount_sgd ?? "0",
    bind_step_order: milestone?.bind_step_order ?? null,
    refundable_note: milestone?.refundable_note ?? null
  };
}

function packageDefaults(pkg?: ServicePackageWithDetails): PackageFormValues {
  return {
    code: pkg?.code ?? "",
    name: pkg?.name ?? "",
    name_en: pkg?.name_en ?? "",
    base_price_sgd: pkg?.base_price_sgd ?? "0",
    tagline: pkg?.tagline ?? null,
    is_recommended: pkg?.is_recommended ?? false,
    active: pkg?.active ?? true,
    sort_order: pkg?.sort_order ?? 0,
    serviceItemIds: pkg?.items ?? [],
    milestones: pkg?.milestones.length ? pkg.milestones.map(milestoneDefaults) : []
  };
}

export function PackagesAdminPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManageCases = can("case.manage");
  const [editingServiceItem, setEditingServiceItem] = useState<ServiceItem | null>(null);
  const [serviceModalOpened, setServiceModalOpened] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackageWithDetails | null>(null);
  const [packageModalOpened, setPackageModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const serviceItemsQuery = useQuery({
    queryKey: serviceItemsQueryKey,
    queryFn: () => listServiceItems()
  });
  const packagesQuery = useQuery({
    queryKey: packagesQueryKey,
    queryFn: () => listPackages()
  });

  const serviceItemForm = useForm<ServiceItemFormValues>({
    resolver: zodResolver(editingServiceItem ? serviceItemUpdateSchema : serviceItemCreateSchema) as Resolver<ServiceItemFormValues>,
    defaultValues: serviceItemDefaults()
  });
  const packageForm = useForm<PackageFormValues>({
    resolver: zodResolver(editingPackage ? packageEditorUpdateSchema : packageEditorSchema) as Resolver<PackageFormValues>,
    defaultValues: packageDefaults()
  });
  const milestoneFields = useFieldArray({
    control: packageForm.control,
    name: "milestones"
  });

  const createServiceItemMutation = useMutation({
    mutationFn: (body: ServiceItemCreateInput) => createServiceItem(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: serviceItemsQueryKey });
      closeServiceModal();
      setSuccessMessage(t("epPackages.messages.serviceSaved"));
    }
  });
  const updateServiceItemMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ServiceItemUpdateInput }) => updateServiceItem(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: serviceItemsQueryKey });
      await queryClient.invalidateQueries({ queryKey: packagesQueryKey });
      closeServiceModal();
      setSuccessMessage(t("epPackages.messages.serviceSaved"));
    }
  });
  const savePackageMutation = useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: PackageFormValues }) => {
      const baseBody = {
        name: values.name ?? "",
        name_en: values.name_en ?? "",
        base_price_sgd: values.base_price_sgd ?? "0",
        tagline: values.tagline ?? null,
        is_recommended: values.is_recommended ?? false,
        active: values.active ?? true,
        sort_order: values.sort_order ?? 0
      };
      const packageId = id
        ? (await updatePackage(id, baseBody as ServicePackageUpdateInput)).package.id
        : (await createPackage({ ...baseBody, code: values.code ?? "" } as ServicePackageCreateInput)).package.id;

      await setPackageItems(packageId, values.serviceItemIds);
      await setPackageMilestones(packageId, values.milestones);
      return packageId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: packagesQueryKey });
      closePackageModal();
      setSuccessMessage(t("epPackages.messages.packageSaved"));
    }
  });

  const categoryOptions = serviceCategories.map((category) => ({
    value: category,
    label: t(`epPackages.categories.${category}`)
  }));
  const serviceItemOptions = useMemo(
    () =>
      (serviceItemsQuery.data?.service_items ?? []).map((item) => ({
        value: item.id,
        label: `${item.name} / ${item.name_en}`
      })),
    [serviceItemsQuery.data?.service_items]
  );
  const serviceItems = serviceItemsQuery.data?.service_items ?? [];
  const packages = packagesQuery.data?.packages ?? [];
  const serviceErrors = serviceItemForm.formState.errors;
  const packageErrors = packageForm.formState.errors;
  const isSavingService = createServiceItemMutation.isPending || updateServiceItemMutation.isPending;
  const isSavingPackage = savePackageMutation.isPending;

  function openCreateServiceModal() {
    setEditingServiceItem(null);
    setFormError(null);
    setSuccessMessage(null);
    serviceItemForm.reset(serviceItemDefaults());
    setServiceModalOpened(true);
  }

  function openEditServiceModal(item: ServiceItem) {
    setEditingServiceItem(item);
    setFormError(null);
    setSuccessMessage(null);
    serviceItemForm.reset(serviceItemDefaults(item));
    setServiceModalOpened(true);
  }

  function closeServiceModal() {
    setServiceModalOpened(false);
    setEditingServiceItem(null);
    setFormError(null);
    serviceItemForm.reset(serviceItemDefaults());
  }

  function openCreatePackageModal() {
    setEditingPackage(null);
    setFormError(null);
    setSuccessMessage(null);
    packageForm.reset(packageDefaults());
    setPackageModalOpened(true);
  }

  function openEditPackageModal(pkg: ServicePackageWithDetails) {
    setEditingPackage(pkg);
    setFormError(null);
    setSuccessMessage(null);
    packageForm.reset(packageDefaults(pkg));
    setPackageModalOpened(true);
  }

  function closePackageModal() {
    setPackageModalOpened(false);
    setEditingPackage(null);
    setFormError(null);
    packageForm.reset(packageDefaults());
  }

  const onSubmitServiceItem = serviceItemForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      const body = {
        ...values,
        default_price_sgd: values.default_price_sgd ?? "0",
        is_core: values.is_core ?? false,
        billable: values.billable ?? true,
        active: values.active ?? true,
        sort_order: values.sort_order ?? 0
      };

      if (editingServiceItem) {
        const { code: _code, ...updateBody } = body;
        await updateServiceItemMutation.mutateAsync({ id: editingServiceItem.id, body: updateBody as ServiceItemUpdateInput });
        return;
      }

      await createServiceItemMutation.mutateAsync(body as ServiceItemCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  const onSubmitPackage = packageForm.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await savePackageMutation.mutateAsync(editingPackage ? { id: editingPackage.id, values } : { values });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  return (
    <Stack gap="md">
      {successMessage ? (
        <Alert color="green" variant="light" onClose={() => setSuccessMessage(null)} withCloseButton>
          {successMessage}
        </Alert>
      ) : null}

      <Tabs defaultValue="services">
        <Tabs.List>
          <Tabs.Tab value="services">{t("epPackages.tabs.services")}</Tabs.Tab>
          <Tabs.Tab value="packages">{t("epPackages.tabs.packages")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="services" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Button onClick={openCreateServiceModal} disabled={!canManageCases}>
                {t("epPackages.addService")}
              </Button>
            </Group>

            {serviceItemsQuery.error ? (
              <Alert color="red" variant="light">
                {serviceItemsQuery.error instanceof Error ? serviceItemsQuery.error.message : t("common.unknown_error")}
              </Alert>
            ) : null}

            <Card withBorder radius="sm" p={0}>
              <ScrollArea>
                <Table miw={980} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("epPackages.fields.name")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.nameEn")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.category")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.defaultPrice")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.isCore")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.billable")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.active")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.sortOrder")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {serviceItemsQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : serviceItems.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={9}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("epPackages.emptyServices")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      serviceItems.map((item) => (
                        <Table.Tr key={item.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm">{item.name}</Text>
                              <Text size="xs" c="dimmed">
                                {item.code}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{item.name_en}</Table.Td>
                          <Table.Td>{t(`epPackages.categories.${item.category}`)}</Table.Td>
                          <Table.Td>{money(item.default_price_sgd)}</Table.Td>
                          <Table.Td>
                            <Badge color={item.is_core ? "blue" : "gray"} variant="light">
                              {item.is_core ? t("common.yes") : t("common.no")}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={item.billable ? "green" : "gray"} variant="light">
                              {item.billable ? t("common.yes") : t("common.no")}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={item.active ? "green" : "gray"} variant="light">
                              {item.active ? t("common.yes") : t("common.no")}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{item.sort_order}</Table.Td>
                          <Table.Td>
                            <Button size="xs" variant="light" onClick={() => openEditServiceModal(item)} disabled={!canManageCases}>
                              {t("common.edit")}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="packages" pt="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Button onClick={openCreatePackageModal} disabled={!canManageCases}>
                {t("epPackages.addPackage")}
              </Button>
            </Group>

            {packagesQuery.error ? (
              <Alert color="red" variant="light">
                {packagesQuery.error instanceof Error ? packagesQuery.error.message : t("common.unknown_error")}
              </Alert>
            ) : null}

            <Card withBorder radius="sm" p={0}>
              <ScrollArea>
                <Table miw={860} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("epPackages.fields.name")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.basePrice")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.recommended")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.active")}</Table.Th>
                      <Table.Th>{t("epPackages.fields.sortOrder")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {packagesQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : packages.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("epPackages.emptyPackages")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      packages.map((pkg) => (
                        <Table.Tr key={pkg.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text size="sm">{pkg.name}</Text>
                              <Text size="xs" c="dimmed">
                                {pkg.code} · {pkg.name_en}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{money(pkg.base_price_sgd)}</Table.Td>
                          <Table.Td>
                            <Badge color={pkg.is_recommended ? "yellow" : "gray"} variant="light">
                              {pkg.is_recommended ? t("epPackages.recommended") : t("common.no")}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={pkg.active ? "green" : "gray"} variant="light">
                              {pkg.active ? t("common.yes") : t("common.no")}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{pkg.sort_order}</Table.Td>
                          <Table.Td>
                            <Button size="xs" variant="light" onClick={() => openEditPackageModal(pkg)} disabled={!canManageCases}>
                              {t("common.edit")}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Modal
        opened={serviceModalOpened}
        onClose={closeServiceModal}
        title={editingServiceItem ? t("epPackages.editService") : t("epPackages.addService")}
        size="lg"
      >
        <form onSubmit={onSubmitServiceItem}>
          <Stack gap="md">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label={t("epPackages.fields.code")}
                  disabled={Boolean(editingServiceItem)}
                  error={serviceErrors.code?.message}
                  {...serviceItemForm.register("code")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={serviceItemForm.control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      label={t("epPackages.fields.category")}
                      data={categoryOptions}
                      value={field.value ?? null}
                      onChange={(value) => field.onChange(value as ServiceCategory)}
                      error={serviceErrors.category?.message}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label={t("epPackages.fields.name")} error={serviceErrors.name?.message} {...serviceItemForm.register("name")} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput
                  label={t("epPackages.fields.nameEn")}
                  error={serviceErrors.name_en?.message}
                  {...serviceItemForm.register("name_en")}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={serviceItemForm.control}
                  name="default_price_sgd"
                  render={({ field }) => (
                    <NumberInput
                      label={t("epPackages.fields.defaultPrice")}
                      value={Number(field.value ?? 0)}
                      onChange={(value) => field.onChange(value === "" ? "0" : value)}
                      min={0}
                      decimalScale={2}
                      error={serviceErrors.default_price_sgd?.message}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller
                  control={serviceItemForm.control}
                  name="sort_order"
                  render={({ field }) => (
                    <NumberInput
                      label={t("epPackages.fields.sortOrder")}
                      value={field.value ?? 0}
                      onChange={(value) => field.onChange(typeof value === "number" ? value : 0)}
                      error={serviceErrors.sort_order?.message}
                    />
                  )}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Group align="center" gap="lg">
                  <Controller
                    control={serviceItemForm.control}
                    name="is_core"
                    render={({ field }) => (
                      <Switch
                        label={t("epPackages.fields.isCore")}
                        checked={field.value ?? false}
                        onChange={(event) => field.onChange(event.currentTarget.checked)}
                      />
                    )}
                  />
                  <Controller
                    control={serviceItemForm.control}
                    name="billable"
                    render={({ field }) => (
                      <Switch
                        label={t("epPackages.fields.billable")}
                        checked={field.value ?? true}
                        onChange={(event) => field.onChange(event.currentTarget.checked)}
                      />
                    )}
                  />
                  <Controller
                    control={serviceItemForm.control}
                    name="active"
                    render={({ field }) => (
                      <Switch
                        label={t("epPackages.fields.active")}
                        checked={field.value ?? true}
                        onChange={(event) => field.onChange(event.currentTarget.checked)}
                      />
                    )}
                  />
                </Group>
              </Grid.Col>
            </Grid>
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeServiceModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingService}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={packageModalOpened}
        onClose={closePackageModal}
        title={editingPackage ? t("epPackages.editPackage") : t("epPackages.addPackage")}
        size="xl"
      >
        <form onSubmit={onSubmitPackage}>
          <Stack gap="lg">
            {formError ? (
              <Alert color="red" variant="light">
                {formError}
              </Alert>
            ) : null}
            <Card withBorder radius="sm">
              <Stack gap="md">
                <Text fw={600}>{t("epPackages.sections.basic")}</Text>
                <Grid>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t("epPackages.fields.code")}
                      disabled={Boolean(editingPackage)}
                      error={packageErrors.code?.message}
                      {...packageForm.register("code")}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <Controller
                      control={packageForm.control}
                      name="base_price_sgd"
                      render={({ field }) => (
                        <NumberInput
                          label={t("epPackages.fields.basePrice")}
                          value={Number(field.value ?? 0)}
                          onChange={(value) => field.onChange(value === "" ? "0" : value)}
                          min={0}
                          decimalScale={2}
                          error={packageErrors.base_price_sgd?.message}
                        />
                      )}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput label={t("epPackages.fields.name")} error={packageErrors.name?.message} {...packageForm.register("name")} />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput
                      label={t("epPackages.fields.nameEn")}
                      error={packageErrors.name_en?.message}
                      {...packageForm.register("name_en")}
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Textarea
                      label={t("epPackages.fields.tagline")}
                      autosize
                      minRows={2}
                      {...packageForm.register("tagline", { setValueAs: emptyToNull })}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Controller
                      control={packageForm.control}
                      name="sort_order"
                      render={({ field }) => (
                        <NumberInput
                          label={t("epPackages.fields.sortOrder")}
                          value={field.value ?? 0}
                          onChange={(value) => field.onChange(typeof value === "number" ? value : 0)}
                          error={packageErrors.sort_order?.message}
                        />
                      )}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 8 }}>
                    <Group align="center" h="100%">
                      <Controller
                        control={packageForm.control}
                        name="is_recommended"
                        render={({ field }) => (
                          <Switch
                            label={t("epPackages.fields.recommended")}
                            checked={field.value ?? false}
                            onChange={(event) => field.onChange(event.currentTarget.checked)}
                          />
                        )}
                      />
                      <Controller
                        control={packageForm.control}
                        name="active"
                        render={({ field }) => (
                          <Switch
                            label={t("epPackages.fields.active")}
                            checked={field.value ?? true}
                            onChange={(event) => field.onChange(event.currentTarget.checked)}
                          />
                        )}
                      />
                    </Group>
                  </Grid.Col>
                </Grid>
              </Stack>
            </Card>

            <Card withBorder radius="sm">
              <Stack gap="md">
                <Text fw={600}>{t("epPackages.sections.items")}</Text>
                <Controller
                  control={packageForm.control}
                  name="serviceItemIds"
                  render={({ field }) => (
                    <Checkbox.Group value={field.value} onChange={field.onChange}>
                      <Grid>
                        {serviceItemOptions.map((item) => (
                          <Grid.Col key={item.value} span={{ base: 12, sm: 6 }}>
                            <Checkbox value={item.value} label={item.label} />
                          </Grid.Col>
                        ))}
                      </Grid>
                    </Checkbox.Group>
                  )}
                />
              </Stack>
            </Card>

            <Card withBorder radius="sm">
              <Stack gap="md">
                <Group justify="space-between">
                  <Text fw={600}>{t("epPackages.sections.milestones")}</Text>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => milestoneFields.append(milestoneDefaults({ seq: milestoneFields.fields.length + 1 } as PackageMilestone))}
                  >
                    {t("epPackages.addMilestone")}
                  </Button>
                </Group>
                <ScrollArea>
                  <Table miw={940} verticalSpacing="sm" withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("epPackages.fields.seq")}</Table.Th>
                        <Table.Th>{t("epPackages.fields.label")}</Table.Th>
                        <Table.Th>{t("epPackages.fields.labelEn")}</Table.Th>
                        <Table.Th>{t("epPackages.fields.amount")}</Table.Th>
                        <Table.Th>{t("epPackages.fields.bindStepOrder")}</Table.Th>
                        <Table.Th>{t("epPackages.fields.refundableNote")}</Table.Th>
                        <Table.Th>{t("common.actions")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {milestoneFields.fields.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={7}>
                            <Text ta="center" c="dimmed" py="md">
                              {t("epPackages.emptyMilestones")}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        milestoneFields.fields.map((field, index) => (
                          <Table.Tr key={field.id}>
                            <Table.Td>
                              <Controller
                                control={packageForm.control}
                                name={`milestones.${index}.seq`}
                                render={({ field: inputField }) => (
                                  <NumberInput
                                    value={inputField.value}
                                    onChange={(value) => inputField.onChange(typeof value === "number" ? value : 0)}
                                    w={72}
                                  />
                                )}
                              />
                            </Table.Td>
                            <Table.Td>
                              <TextInput {...packageForm.register(`milestones.${index}.label`)} />
                            </Table.Td>
                            <Table.Td>
                              <TextInput {...packageForm.register(`milestones.${index}.label_en`)} />
                            </Table.Td>
                            <Table.Td>
                              <Controller
                                control={packageForm.control}
                                name={`milestones.${index}.amount_sgd`}
                                render={({ field: inputField }) => (
                                  <NumberInput
                                    value={Number(inputField.value ?? 0)}
                                    onChange={(value) => inputField.onChange(value === "" ? "0" : value)}
                                    min={0}
                                    decimalScale={2}
                                    w={120}
                                  />
                                )}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Controller
                                control={packageForm.control}
                                name={`milestones.${index}.bind_step_order`}
                                render={({ field: inputField }) => (
                                  <NumberInput
                                    value={inputField.value ?? ""}
                                    onChange={(value) => inputField.onChange(typeof value === "number" ? value : null)}
                                    w={110}
                                  />
                                )}
                              />
                            </Table.Td>
                            <Table.Td>
                              <TextInput {...packageForm.register(`milestones.${index}.refundable_note`, { setValueAs: emptyToNull })} />
                            </Table.Td>
                            <Table.Td>
                              <Button size="xs" color="red" variant="subtle" onClick={() => milestoneFields.remove(index)}>
                                {t("common.delete")}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Card>

            <Group justify="flex-end">
              <Button variant="subtle" onClick={closePackageModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={isSavingPackage}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
