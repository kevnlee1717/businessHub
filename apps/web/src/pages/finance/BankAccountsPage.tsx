import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import {
  bankAccountTypes,
  currencies,
  type BankAccountCreateInput,
  type BankAccountType,
  type Currency
} from "@bh/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createBankAccount,
  listBankAccounts,
  updateBankAccount,
  type BankAccount
} from "../../api/ledger";
import { listCompanies } from "../../api/hr";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type AccountForm = {
  company_id: string | null;
  name: string;
  type: BankAccountType | null;
  bank_name: string;
  account_no: string;
  currency: Currency;
  is_primary: boolean;
  active: boolean;
  note: string;
};

const emptyForm: AccountForm = {
  company_id: null,
  name: "",
  type: null,
  bank_name: "",
  account_no: "",
  currency: "SGD",
  is_primary: false,
  active: true,
  note: ""
};

function companyLabel(company: { name: string; name_en?: string | null }) {
  return company.name_en ? `${company.name} / ${company.name_en}` : company.name;
}

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function toForm(account: BankAccount): AccountForm {
  return {
    company_id: account.company_id,
    name: account.name,
    type: account.type ?? null,
    bank_name: account.bank_name ?? "",
    account_no: account.account_no ?? "",
    currency: account.currency,
    is_primary: account.is_primary,
    active: account.active,
    note: account.note ?? ""
  };
}

export function BankAccountsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: () => listCompanies() });
  const accountsQuery = useQuery({
    queryKey: ["finance", "bank-accounts", companyId, page, pageSize],
    queryFn: () => listBankAccounts({ company_id: companyId, page, page_size: pageSize }),
    placeholderData: keepPreviousData
  });

  const companies = companiesQuery.data?.companies ?? [];
  const accounts = accountsQuery.data?.bank_accounts ?? [];
  const totalAccounts = accountsQuery.data?.total ?? accounts.length;

  useEffect(() => {
    if (!companyId && companies[0]) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const companyOptions = companies.map((company) => ({
    value: company.id,
    label: companyLabel(company)
  }));
  const currencyOptions = currencies.map((currency) => ({ value: currency, label: currency }));
  const typeOptions = bankAccountTypes.map((type) => ({ value: type, label: t(`bankAccountType.${type}`) }));
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);

  const saveMutation = useMutation({
    mutationFn: (body: BankAccountCreateInput) =>
      editing ? updateBankAccount(editing.id, body) : createBankAccount(body),
    onSuccess: async ({ bank_account }) => {
      await queryClient.invalidateQueries({ queryKey: ["finance", "bank-accounts"] });
      setCompanyId(bank_account.company_id);
      closeModal();
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : t("common.unknown_error"))
  });

  const primaryMutation = useMutation({
    mutationFn: (account: BankAccount) => updateBankAccount(account.id, { is_primary: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["finance", "bank-accounts"] })
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, company_id: companyId ?? companies[0]?.id ?? null });
    setError(null);
    setOpened(true);
  }

  function openEdit(account: BankAccount) {
    setEditing(account);
    setForm(toForm(account));
    setError(null);
    setOpened(true);
  }

  function closeModal() {
    setOpened(false);
    setEditing(null);
    setError(null);
  }

  function submit() {
    if (!form.company_id || !form.name.trim()) {
      setError(t("finance.bankAccounts.required"));
      return;
    }

    saveMutation.mutate({
      company_id: form.company_id,
      name: form.name.trim(),
      type: form.type,
      bank_name: toNullable(form.bank_name),
      account_no: toNullable(form.account_no),
      currency: form.currency,
      is_primary: form.is_primary,
      active: form.active,
      note: toNullable(form.note)
    });
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Text c="dimmed" size="sm">
            {t("finance.bankAccounts.subtitle")}
          </Text>
        </Stack>
        <Button onClick={openCreate}>{t("finance.bankAccounts.add")}</Button>
      </Group>

      <Paper withBorder p="md">
        <Select
          label={t("finance.fields.company")}
          data={companyOptions}
          value={companyId}
          onChange={(value) => {
            setCompanyId(value);
            setPage(1);
          }}
          searchable
        />
      </Paper>

      <Paper withBorder>
        <ScrollArea>
          <Table withTableBorder withColumnBorders highlightOnHover miw={820}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("finance.fields.company")}</Table.Th>
                <Table.Th>{t("finance.fields.accountName")}</Table.Th>
                <Table.Th>{t("finance.fields.accountType")}</Table.Th>
                <Table.Th>{t("finance.fields.bankName")}</Table.Th>
                <Table.Th>{t("finance.fields.accountNo")}</Table.Th>
                <Table.Th>{t("finance.fields.currency")}</Table.Th>
                <Table.Th>{t("finance.fields.status")}</Table.Th>
                <Table.Th>{t("common.actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {accounts.map((account) => (
                <Table.Tr key={account.id}>
                  <Table.Td>{companyLabel(companyById.get(account.company_id) ?? { name: account.company_id })}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Text fw={500}>{account.name}</Text>
                      {account.is_primary ? <Badge color="blue">{t("finance.bankAccounts.primary")}</Badge> : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{account.type ? t(`bankAccountType.${account.type}`) : "-"}</Table.Td>
                  <Table.Td>{account.bank_name || "-"}</Table.Td>
                  <Table.Td>{account.account_no || "-"}</Table.Td>
                  <Table.Td>{account.currency}</Table.Td>
                  <Table.Td>
                    <Badge color={account.active ? "green" : "gray"}>
                      {account.active ? t("finance.status.active") : t("finance.status.inactive")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => openEdit(account)}>
                        {t("common.edit")}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        disabled={account.is_primary}
                        loading={primaryMutation.isPending}
                        onClick={() => primaryMutation.mutate(account)}
                      >
                        {t("finance.bankAccounts.setPrimary")}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {accounts.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" ta="center" py="lg">
                      {t("finance.bankAccounts.empty")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <TablePagination
          total={totalAccounts}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Paper>

      <Modal opened={opened} onClose={closeModal} title={editing ? t("finance.bankAccounts.edit") : t("finance.bankAccounts.add")}>
        <Stack gap="md">
          {error ? <Alert color="red">{error}</Alert> : null}
          <Select
            label={t("finance.fields.company")}
            data={companyOptions}
            value={form.company_id}
            onChange={(value) => setForm((current) => ({ ...current, company_id: value }))}
            required
            searchable
          />
          <TextInput
            label={t("finance.fields.accountName")}
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.currentTarget.value }))}
            required
          />
          <Select
            label={t("finance.fields.accountType")}
            data={typeOptions}
            value={form.type}
            onChange={(value) => setForm((current) => ({ ...current, type: value as BankAccountType | null }))}
            clearable
          />
          <TextInput
            label={t("finance.fields.bankName")}
            value={form.bank_name}
            onChange={(event) => setForm((current) => ({ ...current, bank_name: event.currentTarget.value }))}
          />
          <TextInput
            label={t("finance.fields.accountNo")}
            value={form.account_no}
            onChange={(event) => setForm((current) => ({ ...current, account_no: event.currentTarget.value }))}
          />
          <Select
            label={t("finance.fields.currency")}
            data={currencyOptions}
            value={form.currency}
            onChange={(value) => setForm((current) => ({ ...current, currency: (value as Currency | null) ?? "SGD" }))}
          />
          <Checkbox
            label={t("finance.bankAccounts.primary")}
            checked={form.is_primary}
            onChange={(event) => setForm((current) => ({ ...current, is_primary: event.currentTarget.checked }))}
          />
          <Checkbox
            label={t("finance.status.active")}
            checked={form.active}
            onChange={(event) => setForm((current) => ({ ...current, active: event.currentTarget.checked }))}
          />
          <Textarea
            label={t("finance.fields.note")}
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.currentTarget.value }))}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} loading={saveMutation.isPending}>
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
