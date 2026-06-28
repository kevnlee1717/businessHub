import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Group,
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
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import {
  companyExpenseCreateSchema,
  companyExpenseTypes,
  currencies,
  type CompanyExpenseCreateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { listCompanies } from "../../api/hr";
import {
  createCompanyExpense,
  deleteCompanyExpense,
  fileUrl,
  getExpenseSummary,
  listCompanyExpenses,
  searchDocuments,
  type CompanyExpense
} from "../../api/dms";

type ExpenseFormValues = {
  company_id?: string | undefined;
  type?: string | undefined;
  amount?: string | number | undefined;
  currency?: string | undefined;
  period?: string | undefined;
  paid_at?: string | undefined;
  note?: string | null | undefined;
};

function displayDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function getExpenseDefaults(companyId: string): ExpenseFormValues {
  return {
    company_id: companyId,
    type: "rent",
    amount: 0,
    currency: "SGD",
    period: "",
    paid_at: undefined,
    note: null
  };
}

export function CompanyFilesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const [paidAtLocal, setPaidAtLocal] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ["hr", "companies"],
    queryFn: listCompanies
  });
  const summaryQuery = useQuery({
    queryKey: ["documents", "company-expense-summary", selectedCompanyId],
    queryFn: () => getExpenseSummary(selectedCompanyId ?? ""),
    enabled: Boolean(selectedCompanyId)
  });
  const expensesQuery = useQuery({
    queryKey: ["documents", "company-expenses", selectedCompanyId],
    queryFn: () => listCompanyExpenses({ company_id: selectedCompanyId }),
    enabled: Boolean(selectedCompanyId)
  });
  const documentsQuery = useQuery({
    queryKey: ["documents", "company-files", selectedCompanyId],
    queryFn: () => searchDocuments({ subject_type: "company", subject_id: selectedCompanyId }),
    enabled: Boolean(selectedCompanyId)
  });

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(companyExpenseCreateSchema) as Resolver<ExpenseFormValues>,
    defaultValues: selectedCompanyId ? getExpenseDefaults(selectedCompanyId) : getExpenseDefaults("")
  });

  const createMutation = useMutation({
    mutationFn: createCompanyExpense,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", "company-expenses", selectedCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "company-expense-summary", selectedCompanyId] })
      ]);
      closeModal();
    }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCompanyExpense,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", "company-expenses", selectedCompanyId] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "company-expense-summary", selectedCompanyId] })
      ]);
    }
  });

  const companies = companiesQuery.data?.companies ?? [];
  const expenses = expensesQuery.data?.expenses ?? [];
  const documents = documentsQuery.data?.documents ?? [];
  const summary = summaryQuery.data;
  const errors = form.formState.errors;

  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: companyLabel(company)
  }));
  const expenseTypeOptions = companyExpenseTypes.map((type) => ({
    value: type,
    label: t(`companyExpenseType.${type}`)
  }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));

  function openModal() {
    if (!selectedCompanyId) {
      return;
    }

    setFormError(null);
    setPaidAtLocal("");
    form.reset(getExpenseDefaults(selectedCompanyId));
    setModalOpened(true);
  }

  function closeModal() {
    setModalOpened(false);
    setFormError(null);
    setPaidAtLocal("");
    form.reset(selectedCompanyId ? getExpenseDefaults(selectedCompanyId) : getExpenseDefaults(""));
  }

  const onSubmit = form.handleSubmit(async (values) => {
    if (!selectedCompanyId) {
      return;
    }

    setFormError(null);
    try {
      await createMutation.mutateAsync({
        ...(values as CompanyExpenseCreateInput),
        company_id: selectedCompanyId,
        period: values.period?.trim() || undefined,
        paid_at: values.paid_at || undefined,
        note: values.note?.trim() || null
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  });

  async function removeExpense(expense: CompanyExpense) {
    setFormError(null);
    try {
      await deleteMutation.mutateAsync(expense.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t("common.unknown_error"));
    }
  }

  return (
    <Stack gap="md">

      <Paper withBorder radius="md" p="md">
        <Select
          label={t("companyFiles.selectCompany")}
          placeholder={t("companyFiles.selectCompany")}
          data={companyOptions}
          value={selectedCompanyId}
          onChange={setSelectedCompanyId}
          searchable
          clearable
        />
      </Paper>

      {companiesQuery.error ? (
        <Alert color="red" variant="light">
          {companiesQuery.error instanceof Error ? companiesQuery.error.message : t("common.unknown_error")}
        </Alert>
      ) : null}

      {!selectedCompanyId ? (
        <Paper withBorder radius="md" p="lg">
          <Text c="dimmed">{t("companyFiles.selectHint")}</Text>
        </Paper>
      ) : (
        <>
          <Paper withBorder radius="md" p="md">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3}>{t("companyExpense.summary.title")}</Title>
                {summaryQuery.isFetching ? <Loader size="sm" /> : null}
              </Group>
              <Text size="xl" fw={700}>
                {summary?.total ?? "0"}
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2 }}>
                <SummaryTable
                  title={t("companyExpense.summary.byType")}
                  rows={(summary?.by_type ?? []).map((row) => ({
                    label: t(`companyExpenseType.${row.type}`),
                    total: row.total
                  }))}
                  emptyLabel={t("companyExpense.summary.empty")}
                />
                <SummaryTable
                  title={t("companyExpense.summary.byPeriod")}
                  rows={(summary?.by_period ?? []).map((row) => ({
                    label: row.period ?? t("common.not_available"),
                    total: row.total
                  }))}
                  emptyLabel={t("companyExpense.summary.empty")}
                />
              </SimpleGrid>
            </Stack>
          </Paper>

          <Paper withBorder radius="md">
            <Stack gap={0}>
              <Group justify="space-between" px="md" py="sm">
                <Title order={3}>{t("companyExpense.title")}</Title>
                <Button onClick={openModal}>{t("companyExpense.add")}</Button>
              </Group>
              {formError ? (
                <Alert color="red" variant="light" mx="md" mb="sm">
                  {formError}
                </Alert>
              ) : null}
              <ScrollArea>
                <Table miw={900} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("companyExpense.fields.type")}</Table.Th>
                      <Table.Th>{t("companyExpense.fields.amount")}</Table.Th>
                      <Table.Th>{t("companyExpense.fields.currency")}</Table.Th>
                      <Table.Th>{t("companyExpense.fields.period")}</Table.Th>
                      <Table.Th>{t("companyExpense.fields.paidAt")}</Table.Th>
                      <Table.Th>{t("companyExpense.fields.note")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {expensesQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : expenses.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={7}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("companyExpense.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      expenses.map((expense) => (
                        <Table.Tr key={expense.id}>
                          <Table.Td>{t(`companyExpenseType.${expense.type}`)}</Table.Td>
                          <Table.Td>{expense.amount}</Table.Td>
                          <Table.Td>{expense.currency}</Table.Td>
                          <Table.Td>{expense.period ?? "-"}</Table.Td>
                          <Table.Td>{displayDateTime(expense.paid_at)}</Table.Td>
                          <Table.Td>{expense.note || "-"}</Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              onClick={() => removeExpense(expense)}
                              loading={deleteMutation.isPending}
                            >
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
          </Paper>

          <Paper withBorder radius="md">
            <Stack gap={0}>
              <Group justify="space-between" px="md" py="sm">
                <Title order={3}>{t("companyFiles.filesTitle")}</Title>
              </Group>
              <ScrollArea>
                <Table miw={640} verticalSpacing="sm" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("document.fields.filename")}</Table.Th>
                      <Table.Th>{t("document.fields.uploadedAt")}</Table.Th>
                      <Table.Th>{t("common.actions")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {documentsQuery.isLoading ? (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Group justify="center" py="lg">
                            <Loader size="sm" />
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ) : documents.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={3}>
                          <Text ta="center" c="dimmed" py="lg">
                            {t("companyFiles.empty")}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      documents.map((document) => (
                        <Table.Tr key={document.id}>
                          <Table.Td>{document.filename}</Table.Td>
                          <Table.Td>{displayDateTime(document.uploaded_at)}</Table.Td>
                          <Table.Td>
                            <Button
                              component="a"
                              href={fileUrl(document.storage_path)}
                              target="_blank"
                              rel="noreferrer"
                              size="xs"
                              variant="light"
                            >
                              {t("common.preview")}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Paper>
        </>
      )}

      <Modal opened={modalOpened} onClose={closeModal} title={t("companyExpense.add")} size="lg">
        <form onSubmit={onSubmit}>
          <Stack gap="md">
            <Controller
              name="type"
              control={form.control}
              render={({ field }) => (
                <Select
                  label={t("companyExpense.fields.type")}
                  data={expenseTypeOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? "")}
                  error={errors.type?.message}
                  required
                />
              )}
            />
            <Controller
              name="amount"
              control={form.control}
              render={({ field }) => (
                <NumberInput
                  label={t("companyExpense.fields.amount")}
                  value={field.value ?? 0}
                  onChange={(value) => field.onChange(typeof value === "number" ? value : 0)}
                  error={errors.amount?.message}
                  min={0}
                  decimalScale={2}
                  required
                />
              )}
            />
            <Controller
              name="currency"
              control={form.control}
              render={({ field }) => (
                <Select
                  label={t("companyExpense.fields.currency")}
                  data={currencyOptions}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? "SGD")}
                  error={errors.currency?.message}
                />
              )}
            />
            <TextInput
              label={t("companyExpense.fields.period")}
              placeholder="YYYY-MM"
              {...form.register("period")}
              error={errors.period?.message}
            />
            <Controller
              name="paid_at"
              control={form.control}
              render={({ field }) => (
                <TextInput
                  type="datetime-local"
                  label={t("companyExpense.fields.paidAt")}
                  value={paidAtLocal}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setPaidAtLocal(value);
                    field.onChange(value ? new Date(value).toISOString() : undefined);
                  }}
                  error={errors.paid_at?.message}
                />
              )}
            />
            <Textarea
              label={t("companyExpense.fields.note")}
              {...form.register("note")}
              error={errors.note?.message}
              autosize
              minRows={3}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeModal}>
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

function SummaryTable({
  title,
  rows,
  emptyLabel
}: {
  title: string;
  rows: { label: string; total: string }[];
  emptyLabel: string;
}) {
  return (
    <Paper withBorder radius="md">
      <Stack gap={0}>
        <Text fw={600} px="md" py="sm">
          {title}
        </Text>
        <Table verticalSpacing="sm">
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td>
                  <Text c="dimmed">{emptyLabel}</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row) => (
                <Table.Tr key={row.label}>
                  <Table.Td>{row.label}</Table.Td>
                  <Table.Td ta="right">{row.total}</Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>
    </Paper>
  );
}
