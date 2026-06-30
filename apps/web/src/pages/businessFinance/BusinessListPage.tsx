import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput
} from "@mantine/core";
import {
  businessCreateSchema,
  businessStatuses,
  type BusinessCreateInput,
  type BusinessStatus,
  type BusinessUpdateInput
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  createBusiness,
  listBusinesses,
  updateBusiness,
  type Business
} from "../../api/businessSchemes";
import { listCompanies, type Company } from "../../api/hr";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type BusinessFormValues = {
  company_id?: string | undefined;
  code?: string | undefined;
  name?: string | undefined;
  name_en?: string | null | undefined;
  category?: string | null | undefined;
  status?: BusinessStatus | undefined;
};

const businessQueryKey = ["business-finance", "businesses"] as const;
const companyQueryKey = ["hr", "companies"] as const;

function displayName(name: string, nameEn?: string | null) {
  return nameEn ? `${name} / ${nameEn}` : name;
}

function formatProfitRate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? "-" : `${(numberValue * 100).toFixed(2)}%`;
}

function statusColor(status: string) {
  switch (status) {
    case "active":
      return "green";
    case "paused":
      return "yellow";
    default:
      return "gray";
  }
}

function getBusinessDefaults(companies: Company[]): BusinessFormValues {
  return {
    company_id: companies[0]?.id,
    code: "",
    name: "",
    name_en: null,
    category: null,
    status: "active"
  };
}

export function BusinessListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [modalOpened, setModalOpened] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const businessesQuery = useQuery({
    queryKey: [...businessQueryKey, page, pageSize],
    queryFn: () => listBusinesses({ page, page_size: pageSize }),
    placeholderData: keepPreviousData
  });
  const companiesQuery = useQuery({
    queryKey: companyQueryKey,
    queryFn: () => listCompanies()
  });

  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessCreateSchema) as Resolver<BusinessFormValues>,
    defaultValues: getBusinessDefaults([])
  });

  const createMutation = useMutation({
    mutationFn: createBusiness,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: businessQueryKey });
      closeModal();
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BusinessUpdateInput }) => updateBusiness(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: businessQueryKey });
    }
  });

  const businesses = businessesQuery.data?.businesses ?? [];
  const totalBusinesses = businessesQuery.data?.total ?? businesses.length;
  const companies = companiesQuery.data?.companies ?? [];
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: displayName(company.name, company.name_en)
  }));
  const statusOptions = businessStatuses.map((status) => ({
    value: status,
    label: t(`businessStatus.${status}`)
  }));
  const groupedBusinesses = useMemo(() => {
    const groups = new Map<string, Business[]>();

    businesses.forEach((business) => {
      const key = business.company_id || "__none";
      groups.set(key, [...(groups.get(key) ?? []), business]);
    });

    return Array.from(groups.entries());
  }, [businesses]);
  const loadError = businessesQuery.error ?? companiesQuery.error;

  function openModal() {
    setFormError(null);
    form.reset(getBusinessDefaults(companies));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    form.reset(getBusinessDefaults(companies));
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);

    try {
      await createMutation.mutateAsync(values as BusinessCreateInput);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function patchBusiness(id: string, body: BusinessUpdateInput) {
    setFormError(null);
    try {
      await updateMutation.mutateAsync({ id, body });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Button variant="light" onClick={() => navigate("/business-finance/parties")}>
            {t("dealParty.title")}
          </Button>
          <Button variant="light" onClick={() => navigate("/business-finance/external-parties")}>
            {t("externalParties.title")}
          </Button>
          <Button onClick={openModal}>{t("businessFinance.list.add")}</Button>
        </Group>
      </Group>

      {loadError ? (
        <Alert color="red" variant="light">
          {loadError instanceof Error ? loadError.message : t("common.unknown_error")}
        </Alert>
      ) : null}
      {formError ? (
        <Alert color="red" variant="light">
          {formError}
        </Alert>
      ) : null}

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table miw={1100} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("businessFinance.fields.company")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.code")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.name")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.category")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.status")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.defaultVersion")}</Table.Th>
                <Table.Th>{t("businessFinance.fields.profitRate")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {businessesQuery.isLoading || companiesQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : businesses.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text ta="center" c="dimmed" py="lg">
                      {t("businessFinance.list.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                groupedBusinesses.map(([companyId, rows]) => {
                  const company = companyById.get(companyId);
                  const companyLabel = company ? displayName(company.name, company.name_en) : t("common.not_available");

                  return rows.map((business, index) => (
                    <Table.Tr key={business.id}>
                      <Table.Td>{index === 0 ? companyLabel : ""}</Table.Td>
                      <Table.Td>{business.code}</Table.Td>
                      <Table.Td>{displayName(business.name, business.name_en)}</Table.Td>
                      <Table.Td>{business.category ?? t("common.uncategorized")}</Table.Td>
                      <Table.Td>
                        <Badge color={statusColor(business.status)} variant="light">
                          {t(`businessStatus.${business.status}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{business.default_version?.label ?? t("common.not_available")}</Table.Td>
                      <Table.Td>{formatProfitRate(business.profit_rate)}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => navigate(`/business-finance/${business.id}`)}
                          >
                            {t("businessFinance.list.detail")}
                          </Button>
                          <Select
                            size="xs"
                            w={170}
                            data={companyOptions}
                            value={business.company_id}
                            onChange={(value) => {
                              if (value && value !== business.company_id) {
                                void patchBusiness(business.id, { company_id: value });
                              }
                            }}
                          />
                          <Select
                            size="xs"
                            w={120}
                            data={statusOptions}
                            value={business.status}
                            onChange={(value) => {
                              if (value && value !== business.status) {
                                void patchBusiness(business.id, { status: value as BusinessStatus });
                              }
                            }}
                          />
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ));
                })
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>
      <TablePagination
        total={totalBusinesses}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Modal opened={modalOpened} onClose={closeModal} title={t("businessFinance.list.add")} size="lg">
        <form onSubmit={onSubmit}>
          {formError ? (
            <Alert color="red" variant="light" mb="md">
              {formError}
            </Alert>
          ) : null}
          <Stack gap="sm">
            <Controller
              control={form.control}
              name="company_id"
              render={({ field, fieldState }) => (
                <Select
                  label={t("businessFinance.fields.company")}
                  data={companyOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? undefined)}
                  error={fieldState.error?.message}
                  required
                />
              )}
            />
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="code"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("businessFinance.fields.code")}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
              <Controller
                control={form.control}
                name="category"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("businessFinance.fields.category")}
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.currentTarget.value || null)}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </Group>
            <Group grow align="flex-start">
              <Controller
                control={form.control}
                name="name"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("businessFinance.fields.name")}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
              <Controller
                control={form.control}
                name="name_en"
                render={({ field, fieldState }) => (
                  <TextInput
                    label={t("businessFinance.fields.nameEn")}
                    value={field.value ?? ""}
                    onChange={(event) => field.onChange(event.currentTarget.value || null)}
                    error={fieldState.error?.message}
                  />
                )}
              />
            </Group>
            <Controller
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <Select
                  label={t("businessFinance.fields.status")}
                  data={statusOptions}
                  value={field.value ?? "active"}
                  onChange={(value) => field.onChange(value ?? "active")}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="light" onClick={closeModal}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                {t("common.save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
