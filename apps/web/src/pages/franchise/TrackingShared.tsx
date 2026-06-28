import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  ThemeIcon
} from "@mantine/core";
import {
  franchiseContractExpiries,
  franchiseDecisionMakers,
  franchiseFootfalls,
  franchiseInterestLevels,
  franchiseOrgTypes,
  franchisePriorities,
  franchisePropertyTypes,
  franchiseServices,
  franchiseSiteStatuses,
  franchiseTriStates,
  type FranchiseService
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { listCompanies, listEmployees } from "../../api/hr";
import {
  createFranchiseContact,
  createFranchiseFnbSite,
  createFranchiseFnbVisit,
  createFranchiseOrg,
  createFranchiseProperty,
  createFranchisePropertyVisit,
  deleteFranchiseContact,
  deleteFranchiseFnbSite,
  deleteFranchiseOrg,
  deleteFranchiseProperty,
  franchiseKeys,
  getFranchiseKpi,
  listFranchiseContacts,
  listFranchiseFnbSites,
  listFranchiseFnbVisits,
  listFranchiseOrgs,
  listFranchiseProperties,
  listFranchisePropertyVisits,
  listFranchiseVisits,
  updateFranchiseContact,
  updateFranchiseFnbSite,
  updateFranchiseOrg,
  updateFranchiseProperty,
  type FranchiseContact,
  type FranchiseFnbSite,
  type FranchiseOrg,
  type FranchiseProperty,
  type FranchiseVisit
} from "../../api/franchise";

const pageSize = 10;
const visitDetailKeys: Record<FranchiseService, string[]> = {
  vending_machine: ["power", "traffic", "placement"],
  massage_chair: ["space", "power", "revenue_share"],
  cleaning_robot: ["floor_type", "area", "schedule"],
  ai_mattress: ["room_count", "customer_profile", "trial_area"],
  security: ["posts", "hours", "requirements"],
  cleaning: ["area", "frequency", "scope"]
};

type Dict = Record<string, unknown>;
type Option = { value: string; label: string };

function qsKey(values: Record<string, unknown>) {
  return JSON.stringify(values);
}

function toDateTimeInput(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function toApiDateTime(value?: unknown) {
  return typeof value === "string" && value ? new Date(value).toISOString() : value;
}

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function emptyToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function optionLabel(options: Option[], value?: string | null) {
  return options.find((option) => option.value === value)?.label ?? "-";
}

function badgeColor(value: string) {
  if (["won", "high", "yes", "very_high"].includes(value)) return "green";
  if (["following", "medium", "pending", "need_management", "need_committee"].includes(value)) return "yellow";
  if (["abandoned", "low", "no"].includes(value)) return "red";
  return "blue";
}

function StatusBadge({ value, ns }: { value?: string | null; ns: string }) {
  const { t } = useTranslation();
  if (!value) return <Text c="dimmed">-</Text>;
  return <Badge color={badgeColor(value)}>{t(`franchise.${ns}.${value}`)}</Badge>;
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text ta="center" c="dimmed" py="lg">
          {t("franchise.empty")}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

function Pager({ total, page, setPage }: { total: number; page: number; setPage: (page: number) => void }) {
  if (total <= pageSize) return null;
  return (
    <Group justify="flex-end" mt={30}>
      <Pagination total={Math.ceil(total / pageSize)} value={page} onChange={setPage} />
    </Group>
  );
}

function slicePage<T>(rows: T[], page: number) {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

function useSimpleForm(initial: Dict = {}) {
  const [values, setValues] = useState<Dict>(initial);
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));
  return { values, setValues, set };
}

function useBaseOptions() {
  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: listCompanies });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees"], queryFn: listEmployees });
  const orgsQuery = useQuery({ queryKey: franchiseKeys.orgs("all"), queryFn: () => listFranchiseOrgs() });
  const contactsQuery = useQuery({ queryKey: franchiseKeys.contacts("all"), queryFn: () => listFranchiseContacts() });
  return {
    companies: companiesQuery.data?.companies ?? [],
    employees: employeesQuery.data?.employees ?? [],
    orgs: orgsQuery.data?.orgs ?? [],
    contacts: contactsQuery.data?.contacts ?? [],
    companyOptions: (companiesQuery.data?.companies ?? []).map((row) => ({ value: row.id, label: row.name })),
    employeeOptions: (employeesQuery.data?.employees ?? []).map((row) => ({ value: row.id, label: row.name })),
    orgOptions: (orgsQuery.data?.orgs ?? []).map((row) => ({ value: row.id, label: row.name })),
    contactOptions: (contactsQuery.data?.contacts ?? []).map((row) => ({ value: row.id, label: `${row.name}${row.phone ? ` · ${row.phone}` : ""}` })),
    error: companiesQuery.error ?? employeesQuery.error ?? orgsQuery.error ?? contactsQuery.error
  };
}

function FieldModal({
  opened,
  title,
  children,
  onClose,
  onSubmit,
  saving,
  size = "lg"
}: {
  opened: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  saving?: boolean;
  size?: string;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={title} size={size}>
      <Stack gap="md">
        {children}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} loading={Boolean(saving)}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function SelectField({
  label,
  value,
  data,
  onChange,
  clearable = true
}: {
  label: string;
  value: unknown;
  data: Option[];
  onChange: (value: string | null) => void;
  clearable?: boolean;
}) {
  return <Select label={label} data={data} value={(value as string | null | undefined) ?? null} onChange={onChange} clearable={clearable} searchable />;
}

function enumOptions(values: readonly string[], ns: string, t: (key: string) => string) {
  return values.map((value) => ({ value, label: t(`franchise.${ns}.${value}`) }));
}

function KpiCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card withBorder radius="sm">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" mt={4}>{value}</Text>
      {note ? <Text size="xs" c="dimmed" mt={4}>{note}</Text> : null}
    </Card>
  );
}

export function TrackingDashboardPageImpl() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ from: "", to: "", employee_id: "" });
  const base = useBaseOptions();
  const params = { from: filters.from, to: filters.to, employee_id: filters.employee_id };
  const kpiQuery = useQuery({ queryKey: franchiseKeys.kpi(qsKey(params)), queryFn: () => getFranchiseKpi(params) });
  const kpi = kpiQuery.data?.kpi;

  return (
    <Box p="md">
      <Stack gap="md">
        <Group gap="sm" wrap="wrap">
          <TextInput type="date" label={t("franchise.filters.from")} w={170} value={filters.from} onChange={(event) => setFilters((v) => ({ ...v, from: event.currentTarget.value }))} />
          <TextInput type="date" label={t("franchise.filters.to")} w={170} value={filters.to} onChange={(event) => setFilters((v) => ({ ...v, to: event.currentTarget.value }))} />
          <Select label={t("franchise.fields.owner")} data={base.employeeOptions} w={200} clearable searchable value={filters.employee_id || null} onChange={(value) => setFilters((v) => ({ ...v, employee_id: value ?? "" }))} />
        </Group>
        <ErrorAlert error={kpiQuery.error ?? base.error} />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <KpiCard label={t("franchise.dashboard.visitVolume")} value={kpi?.visit_volume.reduce((sum, row) => sum + row.count, 0) ?? 0} />
          <KpiCard label={t("franchise.dashboard.siteCoverage")} value={`${kpi?.site_coverage.visited ?? 0}/${kpi?.site_coverage.total ?? 0}`} note={`${t("franchise.dashboard.vendingSites")}: ${kpi?.site_coverage.vending_sites ?? 0}`} />
          <KpiCard label={t("franchise.dashboard.surveyCollection")} value={kpi?.survey_collection.total ?? 0} />
          <KpiCard label={t("franchise.dashboard.interestFunnel")} value={`${kpi?.interest_funnel.high_interest_sites ?? 0} → ${kpi?.interest_funnel.won_sites ?? 0}`} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, lg: 2 }}>
          <Card withBorder radius="sm">
            <Text fw={600} mb="sm">{t("franchise.dashboard.visitRanking")}</Text>
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.employee")}</Table.Th><Table.Th>{t("franchise.fields.count")}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {kpiQuery.isLoading ? <LoadingRow colSpan={2} /> : (kpi?.visit_volume.length ? kpi.visit_volume.map((row) => (
                  <Table.Tr key={row.employee_id}><Table.Td>{row.employee_name ?? row.employee_id}</Table.Td><Table.Td>{row.count}</Table.Td></Table.Tr>
                )) : <EmptyRow colSpan={2} />)}
              </Table.Tbody>
            </Table>
          </Card>
          <Card withBorder radius="sm">
            <Text fw={600} mb="sm">{t("franchise.dashboard.dueContacts")}</Text>
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.name")}</Table.Th><Table.Th>{t("franchise.fields.nextVisitAt")}</Table.Th><Table.Th>{t("franchise.fields.org")}</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {kpiQuery.isLoading ? <LoadingRow colSpan={3} /> : (kpi?.due_contacts.length ? kpi.due_contacts.map((row) => (
                  <Table.Tr key={row.id}><Table.Td>{row.name}</Table.Td><Table.Td>{fmt(row.next_visit_at)}</Table.Td><Table.Td>{row.org?.name ?? optionLabel(base.orgOptions, row.org_id)}</Table.Td></Table.Tr>
                )) : <EmptyRow colSpan={3} />)}
              </Table.Tbody>
            </Table>
          </Card>
        </SimpleGrid>
      </Stack>
    </Box>
  );
}

function OrgQuickCreate({ companyOptions }: { companyOptions: Option[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const form = useSimpleForm({ company_id: companyOptions[0]?.value ?? "", name: "", type: "property_company" });
  const [opened, setOpened] = useState(false);
  const mutation = useMutation({
    mutationFn: () => createFranchiseOrg({ ...form.values, note: emptyToNull(form.values.note) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      setOpened(false);
    }
  });
  return (
    <>
      <Button variant="light" onClick={() => setOpened(true)}>{t("franchise.actions.newOrg")}</Button>
      <FieldModal opened={opened} onClose={() => setOpened(false)} title={t("franchise.actions.newOrg")} onSubmit={() => mutation.mutate()} saving={mutation.isPending}>
        <ErrorAlert error={mutation.error} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <SelectField label={t("franchise.fields.company")} value={form.values.company_id} data={companyOptions} onChange={(v) => form.set("company_id", v)} clearable={false} />
          <Select label={t("franchise.fields.orgType")} data={enumOptions(franchiseOrgTypes, "orgType", t)} value={(form.values.type as string) ?? null} onChange={(v) => form.set("type", v)} />
          <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        </SimpleGrid>
        <Textarea label={t("franchise.fields.note")} value={(form.values.note as string) ?? ""} onChange={(e) => form.set("note", e.currentTarget.value)} />
      </FieldModal>
    </>
  );
}

function PropertyFormModal({ opened, onClose, property }: { opened: boolean; onClose: () => void; property?: FranchiseProperty }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm({
    company_id: property?.company_id ?? base.companyOptions[0]?.value ?? "",
    name: property?.name ?? "",
    property_type: property?.property_type ?? "mall",
    address: property?.address ?? "",
    org_id: property?.org_id ?? null,
    is_vending_site: property?.is_vending_site ?? false,
    vending_note: property?.vending_note ?? "",
    introduced_by_contact_id: property?.introduced_by_contact_id ?? null,
    relationship_note: property?.relationship_note ?? "",
    priority: property?.priority ?? "medium",
    footfall: property?.footfall ?? null,
    decision_maker: property?.decision_maker ?? null,
    has_public_space: property?.has_public_space ?? null,
    status: property?.status ?? "unvisited",
    owner_id: property?.owner_id ?? null
  });
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const body = {
        ...form.values,
        address: emptyToNull(form.values.address),
        vending_note: emptyToNull(form.values.vending_note),
        relationship_note: emptyToNull(form.values.relationship_note)
      };
      return property ? updateFranchiseProperty(property.id, body) : createFranchiseProperty(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onClose();
    }
  });
  return (
    <FieldModal opened={opened} onClose={onClose} title={property ? t("franchise.actions.editProperty") : t("franchise.actions.newProperty")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error ?? base.error} />
      <Group justify="flex-end"><OrgQuickCreate companyOptions={base.companyOptions} /></Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <SelectField label={t("franchise.fields.company")} value={form.values.company_id} data={base.companyOptions} onChange={(v) => form.set("company_id", v)} clearable={false} />
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <Select label={t("franchise.fields.propertyType")} data={enumOptions(franchisePropertyTypes, "propertyType", t)} value={(form.values.property_type as string) ?? null} onChange={(v) => form.set("property_type", v)} />
        <Select label={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={(form.values.priority as string) ?? null} onChange={(v) => form.set("priority", v)} />
        <SelectField label={t("franchise.fields.org")} value={form.values.org_id} data={base.orgOptions} onChange={(v) => form.set("org_id", v)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
        <Select label={t("franchise.fields.footfall")} data={enumOptions(franchiseFootfalls, "footfall", t)} value={(form.values.footfall as string | null) ?? null} onChange={(v) => form.set("footfall", v)} clearable />
        <Select label={t("franchise.fields.decisionMaker")} data={enumOptions(franchiseDecisionMakers, "decisionMaker", t)} value={(form.values.decision_maker as string | null) ?? null} onChange={(v) => form.set("decision_maker", v)} clearable />
        <Select label={t("franchise.fields.hasPublicSpace")} data={enumOptions(franchiseTriStates, "triState", t)} value={(form.values.has_public_space as string | null) ?? null} onChange={(v) => form.set("has_public_space", v)} clearable />
        <Select label={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={(form.values.status as string) ?? null} onChange={(v) => form.set("status", v)} />
        <Checkbox label={t("franchise.fields.isVendingSite")} checked={Boolean(form.values.is_vending_site)} onChange={(e) => form.set("is_vending_site", e.currentTarget.checked)} />
        <SelectField label={t("franchise.fields.introducedBy")} value={form.values.introduced_by_contact_id} data={base.contactOptions} onChange={(v) => form.set("introduced_by_contact_id", v)} />
      </SimpleGrid>
      <Textarea label={t("franchise.fields.address")} value={(form.values.address as string) ?? ""} onChange={(e) => form.set("address", e.currentTarget.value)} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Textarea label={t("franchise.fields.vendingNote")} value={(form.values.vending_note as string) ?? ""} onChange={(e) => form.set("vending_note", e.currentTarget.value)} />
        <Textarea label={t("franchise.fields.relationshipNote")} value={(form.values.relationship_note as string) ?? ""} onChange={(e) => form.set("relationship_note", e.currentTarget.value)} />
      </SimpleGrid>
    </FieldModal>
  );
}

function FnbSiteFormModal({ opened, onClose, site }: { opened: boolean; onClose: () => void; site?: FranchiseFnbSite }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm({
    company_id: site?.company_id ?? base.companyOptions[0]?.value ?? "",
    name: site?.name ?? "",
    org_id: site?.org_id ?? null,
    location: site?.location ?? "",
    has_aircon: site?.has_aircon ?? null,
    introduced_by_contact_id: site?.introduced_by_contact_id ?? null,
    relationship_note: site?.relationship_note ?? "",
    priority: site?.priority ?? "medium",
    status: site?.status ?? "unvisited",
    owner_id: site?.owner_id ?? null
  });
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const body = { ...form.values, location: emptyToNull(form.values.location), relationship_note: emptyToNull(form.values.relationship_note) };
      return site ? updateFranchiseFnbSite(site.id, body) : createFranchiseFnbSite(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onClose();
    }
  });
  return (
    <FieldModal opened={opened} onClose={onClose} title={site ? t("franchise.actions.editFnbSite") : t("franchise.actions.newFnbSite")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error ?? base.error} />
      <Group justify="flex-end"><OrgQuickCreate companyOptions={base.companyOptions} /></Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <SelectField label={t("franchise.fields.company")} value={form.values.company_id} data={base.companyOptions} onChange={(v) => form.set("company_id", v)} clearable={false} />
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <SelectField label={t("franchise.fields.org")} value={form.values.org_id} data={base.orgOptions} onChange={(v) => form.set("org_id", v)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
        <Select label={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={(form.values.priority as string) ?? null} onChange={(v) => form.set("priority", v)} />
        <Select label={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={(form.values.status as string) ?? null} onChange={(v) => form.set("status", v)} />
        <Select label={t("franchise.fields.hasAircon")} data={enumOptions(franchiseTriStates.filter((v) => v !== "pending"), "triState", t)} value={form.values.has_aircon === true ? "yes" : form.values.has_aircon === false ? "no" : null} onChange={(v) => form.set("has_aircon", v === "yes" ? true : v === "no" ? false : null)} clearable />
        <SelectField label={t("franchise.fields.introducedBy")} value={form.values.introduced_by_contact_id} data={base.contactOptions} onChange={(v) => form.set("introduced_by_contact_id", v)} />
      </SimpleGrid>
      <Textarea label={t("franchise.fields.location")} value={(form.values.location as string) ?? ""} onChange={(e) => form.set("location", e.currentTarget.value)} />
      <Textarea label={t("franchise.fields.relationshipNote")} value={(form.values.relationship_note as string) ?? ""} onChange={(e) => form.set("relationship_note", e.currentTarget.value)} />
    </FieldModal>
  );
}

function ContactFormModal({ opened, onClose, contact }: { opened: boolean; onClose: () => void; contact?: FranchiseContact }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm({
    company_id: contact?.company_id ?? base.companyOptions[0]?.value ?? "",
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    phone: contact?.phone ?? "",
    org_id: contact?.org_id ?? null,
    referred_by_contact_id: contact?.referred_by_contact_id ?? null,
    next_visit_at: toDateTimeInput(contact?.next_visit_at),
    owner_id: contact?.owner_id ?? null,
    note: contact?.note ?? ""
  });
  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        ...form.values,
        role: emptyToNull(form.values.role),
        phone: emptyToNull(form.values.phone),
        next_visit_at: form.values.next_visit_at ? toApiDateTime(form.values.next_visit_at) : null,
        note: emptyToNull(form.values.note)
      };
      return contact ? updateFranchiseContact(contact.id, body) : createFranchiseContact(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onClose();
    }
  });
  return (
    <FieldModal opened={opened} onClose={onClose} title={contact ? t("franchise.actions.editContact") : t("franchise.actions.newContact")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error ?? base.error} />
      <Group justify="flex-end"><OrgQuickCreate companyOptions={base.companyOptions} /></Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <SelectField label={t("franchise.fields.company")} value={form.values.company_id} data={base.companyOptions} onChange={(v) => form.set("company_id", v)} clearable={false} />
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <TextInput label={t("franchise.fields.role")} value={(form.values.role as string) ?? ""} onChange={(e) => form.set("role", e.currentTarget.value)} />
        <TextInput label={t("franchise.fields.phone")} value={(form.values.phone as string) ?? ""} onChange={(e) => form.set("phone", e.currentTarget.value)} />
        <SelectField label={t("franchise.fields.org")} value={form.values.org_id} data={base.orgOptions} onChange={(v) => form.set("org_id", v)} />
        <SelectField label={t("franchise.fields.referredBy")} value={form.values.referred_by_contact_id} data={base.contactOptions.filter((o) => o.value !== contact?.id)} onChange={(v) => form.set("referred_by_contact_id", v)} />
        <TextInput type="datetime-local" label={t("franchise.fields.nextVisitAt")} value={(form.values.next_visit_at as string) ?? ""} onChange={(e) => form.set("next_visit_at", e.currentTarget.value)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
      </SimpleGrid>
      <Textarea label={t("franchise.fields.note")} value={(form.values.note as string) ?? ""} onChange={(e) => form.set("note", e.currentTarget.value)} />
    </FieldModal>
  );
}

function VisitFormModal({ opened, onClose, mode, targetId }: { opened: boolean; onClose: () => void; mode: "property" | "fnb"; targetId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const [details, setDetails] = useState<Record<string, Record<string, string>>>({});
  const form = useSimpleForm({
    contact_id: null,
    by_employee_id: base.employeeOptions[0]?.value ?? "",
    visited_at: new Date().toISOString().slice(0, 16),
    interest_level: "medium",
    services_pitched: [] as string[],
    interested_services: [] as string[],
    result: "",
    note: "",
    rent_fixed: "",
    rent_revenue_share_pct: "",
    management_fee: "",
    dishwash_fee: "",
    contract_expiry: null,
    extra_conditions: ""
  });
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const common = {
        contact_id: form.values.contact_id,
        by_employee_id: form.values.by_employee_id,
        visited_at: toApiDateTime(form.values.visited_at),
        interest_level: form.values.interest_level,
        result: emptyToNull(form.values.result),
        note: emptyToNull(form.values.note)
      };
      if (mode === "property") {
        return createFranchisePropertyVisit(targetId, {
          ...common,
          services_pitched: form.values.services_pitched,
          survey: {
            interested_services: form.values.interested_services,
            details
          }
        });
      }
      return createFranchiseFnbVisit(targetId, {
        ...common,
        survey: {
          rent_fixed: emptyToNull(form.values.rent_fixed),
          rent_revenue_share_pct: emptyToNull(form.values.rent_revenue_share_pct),
          management_fee: emptyToNull(form.values.management_fee),
          dishwash_fee: emptyToNull(form.values.dishwash_fee),
          contract_expiry: form.values.contract_expiry,
          extra: { conditions: emptyToNull(form.values.extra_conditions) }
        }
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onClose();
    }
  });
  const serviceOptions = enumOptions(franchiseServices, "service", t);
  const interested = (form.values.interested_services as FranchiseService[]) ?? [];

  return (
    <FieldModal opened={opened} onClose={onClose} title={t("franchise.actions.newVisit")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error ?? base.error} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <SelectField label={t("franchise.fields.contact")} value={form.values.contact_id} data={base.contactOptions} onChange={(v) => form.set("contact_id", v)} />
        <SelectField label={t("franchise.fields.employee")} value={form.values.by_employee_id} data={base.employeeOptions} onChange={(v) => form.set("by_employee_id", v)} clearable={false} />
        <TextInput type="datetime-local" label={t("franchise.fields.visitedAt")} value={(form.values.visited_at as string) ?? ""} onChange={(e) => form.set("visited_at", e.currentTarget.value)} />
        <Select label={t("franchise.fields.interestLevel")} data={enumOptions(franchiseInterestLevels, "interestLevel", t)} value={(form.values.interest_level as string) ?? null} onChange={(v) => form.set("interest_level", v)} />
      </SimpleGrid>
      {mode === "property" ? (
        <Stack gap="md">
          <MultiSelect label={t("franchise.fields.servicesPitched")} data={serviceOptions} value={(form.values.services_pitched as string[]) ?? []} onChange={(v) => form.set("services_pitched", v)} />
          <Card withBorder radius="sm">
            <Text fw={600} mb="sm">{t("franchise.survey.interestedServices")}</Text>
            <MultiSelect data={serviceOptions} value={interested} onChange={(v) => form.set("interested_services", v)} />
          </Card>
          {interested.map((service) => (
            <Card key={service} withBorder radius="sm">
              <Text fw={600} mb="sm">{t(`franchise.service.${service}`)}</Text>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                {visitDetailKeys[service].map((key) => (
                  <TextInput
                    key={key}
                    label={t(`franchise.survey.detail.${key}`)}
                    value={details[service]?.[key] ?? ""}
                    onChange={(event) => setDetails((current) => ({ ...current, [service]: { ...(current[service] ?? {}), [key]: event.currentTarget.value } }))}
                  />
                ))}
              </SimpleGrid>
            </Card>
          ))}
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <NumberInput label={t("franchise.fields.rentFixed")} value={(form.values.rent_fixed as string) ?? ""} onChange={(v) => form.set("rent_fixed", v?.toString() ?? "")} />
          <NumberInput label={t("franchise.fields.rentRevenueSharePct")} value={(form.values.rent_revenue_share_pct as string) ?? ""} onChange={(v) => form.set("rent_revenue_share_pct", v?.toString() ?? "")} />
          <NumberInput label={t("franchise.fields.managementFee")} value={(form.values.management_fee as string) ?? ""} onChange={(v) => form.set("management_fee", v?.toString() ?? "")} />
          <NumberInput label={t("franchise.fields.dishwashFee")} value={(form.values.dishwash_fee as string) ?? ""} onChange={(v) => form.set("dishwash_fee", v?.toString() ?? "")} />
          <Select label={t("franchise.fields.contractExpiry")} data={enumOptions(franchiseContractExpiries, "contractExpiry", t)} value={(form.values.contract_expiry as string | null) ?? null} onChange={(v) => form.set("contract_expiry", v)} clearable />
          <Textarea label={t("franchise.fields.extraConditions")} value={(form.values.extra_conditions as string) ?? ""} onChange={(e) => form.set("extra_conditions", e.currentTarget.value)} />
        </SimpleGrid>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Textarea label={t("franchise.fields.result")} value={(form.values.result as string) ?? ""} onChange={(e) => form.set("result", e.currentTarget.value)} />
        <Textarea label={t("franchise.fields.note")} value={(form.values.note as string) ?? ""} onChange={(e) => form.set("note", e.currentTarget.value)} />
      </SimpleGrid>
    </FieldModal>
  );
}

export function PropertiesPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ q: "", priority: "", status: "", is_vending_site: "", owner_id: "" });
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(false);
  const params = { ...filters, is_vending_site: filters.is_vending_site };
  const query = useQuery({ queryKey: franchiseKeys.properties(qsKey(params)), queryFn: () => listFranchiseProperties(params) });
  const rows = query.data?.properties ?? [];
  const qc = useQueryClient();
  const deleteMutation = useMutation({ mutationFn: deleteFranchiseProperty, onSuccess: () => qc.invalidateQueries({ queryKey: franchiseKeys.all }) });
  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput w={200} placeholder={t("franchise.filters.search")} value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.currentTarget.value }))} />
        <Select w={140} clearable placeholder={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={filters.priority || null} onChange={(v) => setFilters((x) => ({ ...x, priority: v ?? "" }))} />
        <Select w={150} clearable placeholder={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={filters.status || null} onChange={(v) => setFilters((x) => ({ ...x, status: v ?? "" }))} />
        <Select w={170} clearable placeholder={t("franchise.fields.isVendingSite")} data={[{ value: "true", label: t("common.yes") }, { value: "false", label: t("common.no") }]} value={filters.is_vending_site || null} onChange={(v) => setFilters((x) => ({ ...x, is_vending_site: v ?? "" }))} />
        <Select w={180} clearable searchable placeholder={t("franchise.fields.owner")} data={base.employeeOptions} value={filters.owner_id || null} onChange={(v) => setFilters((x) => ({ ...x, owner_id: v ?? "" }))} />
        <Button onClick={() => setOpened(true)}>{t("franchise.actions.newProperty")}</Button>
      </Group>
      <ErrorAlert error={query.error ?? base.error ?? deleteMutation.error} />
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.name")}</Table.Th><Table.Th>{t("franchise.fields.propertyType")}</Table.Th><Table.Th>{t("franchise.fields.priority")}</Table.Th><Table.Th>{t("franchise.fields.status")}</Table.Th><Table.Th>{t("franchise.fields.owner")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? slicePage(rows, page).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td><Anchor onClick={() => navigate(`/franchise/tracking/properties/${row.id}`)}>{row.name}</Anchor>{row.is_vending_site ? <Badge ml="xs" color="green">{t("franchise.fields.isVendingSite")}</Badge> : null}</Table.Td>
              <Table.Td>{t(`franchise.propertyType.${row.property_type}`)}</Table.Td>
              <Table.Td><StatusBadge value={row.priority} ns="priority" /></Table.Td>
              <Table.Td><StatusBadge value={row.status} ns="siteStatus" /></Table.Td>
              <Table.Td>{optionLabel(base.employeeOptions, row.owner_id)}</Table.Td>
              <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/tracking/properties/${row.id}`)}>{t("common.view")}</Button><Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("common.confirm_delete")) && deleteMutation.mutate(row.id)}>{t("common.delete")}</Button></Group></Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={6} />}
        </Table.Tbody>
      </Table>
      <Pager total={rows.length} page={page} setPage={setPage} />
      <PropertyFormModal opened={opened} onClose={() => setOpened(false)} />
    </Box>
  );
}

export function PropertyDetailPageImpl() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const base = useBaseOptions();
  const [editOpen, setEditOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const propertiesQuery = useQuery({ queryKey: franchiseKeys.properties("all"), queryFn: () => listFranchiseProperties() });
  const visitsQuery = useQuery({ queryKey: franchiseKeys.propertyVisits(id), queryFn: () => listFranchisePropertyVisits(id), enabled: Boolean(id) });
  const property = propertiesQuery.data?.properties.find((row) => row.id === id);
  const introducedBy = base.contacts.find((row) => row.id === property?.introduced_by_contact_id);
  return (
    <Box p="md">
      <Stack gap="md">
        <ErrorAlert error={propertiesQuery.error ?? visitsQuery.error ?? base.error} />
        {!property && propertiesQuery.isLoading ? <Loader /> : property ? (
          <>
            <Card withBorder radius="sm">
              <Group justify="space-between" mb="md"><Text fw={700}>{property.name}</Text><Group><Button variant="light" onClick={() => setVisitOpen(true)}>{t("franchise.actions.newVisit")}</Button><Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button></Group></Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Info label={t("franchise.fields.propertyType")} value={t(`franchise.propertyType.${property.property_type}`)} />
                <Info label={t("franchise.fields.priority")} value={<StatusBadge value={property.priority} ns="priority" />} />
                <Info label={t("franchise.fields.status")} value={<StatusBadge value={property.status} ns="siteStatus" />} />
                <Info label={t("franchise.fields.org")} value={optionLabel(base.orgOptions, property.org_id)} />
                <Info label={t("franchise.fields.owner")} value={optionLabel(base.employeeOptions, property.owner_id)} />
                <Info label={t("franchise.fields.introducedBy")} value={introducedBy?.name ?? "-"} />
                <Info label={t("franchise.fields.address")} value={property.address ?? "-"} />
                <Info label={t("franchise.fields.relationshipNote")} value={property.relationship_note ?? "-"} />
                <Info label={t("franchise.fields.vendingNote")} value={property.vending_note ?? "-"} />
              </SimpleGrid>
            </Card>
            <VisitTable visits={visitsQuery.data?.visits ?? []} loading={visitsQuery.isLoading} />
            <PropertyFormModal opened={editOpen} onClose={() => setEditOpen(false)} property={property} />
            <VisitFormModal opened={visitOpen} onClose={() => setVisitOpen(false)} mode="property" targetId={property.id} />
          </>
        ) : <Text c="dimmed">{t("common.not_found")}</Text>}
      </Stack>
    </Box>
  );
}

export function FnbSitesPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ q: "", priority: "", status: "", owner_id: "" });
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(false);
  const query = useQuery({ queryKey: franchiseKeys.fnbSites(qsKey(filters)), queryFn: () => listFranchiseFnbSites(filters) });
  const rows = query.data?.sites ?? [];
  const qc = useQueryClient();
  const deleteMutation = useMutation({ mutationFn: deleteFranchiseFnbSite, onSuccess: () => qc.invalidateQueries({ queryKey: franchiseKeys.all }) });
  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput w={200} placeholder={t("franchise.filters.search")} value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.currentTarget.value }))} />
        <Select w={140} clearable placeholder={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={filters.priority || null} onChange={(v) => setFilters((x) => ({ ...x, priority: v ?? "" }))} />
        <Select w={150} clearable placeholder={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={filters.status || null} onChange={(v) => setFilters((x) => ({ ...x, status: v ?? "" }))} />
        <Select w={180} clearable searchable placeholder={t("franchise.fields.owner")} data={base.employeeOptions} value={filters.owner_id || null} onChange={(v) => setFilters((x) => ({ ...x, owner_id: v ?? "" }))} />
        <Button onClick={() => setOpened(true)}>{t("franchise.actions.newFnbSite")}</Button>
      </Group>
      <ErrorAlert error={query.error ?? base.error ?? deleteMutation.error} />
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.name")}</Table.Th><Table.Th>{t("franchise.fields.location")}</Table.Th><Table.Th>{t("franchise.fields.priority")}</Table.Th><Table.Th>{t("franchise.fields.status")}</Table.Th><Table.Th>{t("franchise.fields.owner")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? slicePage(rows, page).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td><Anchor onClick={() => navigate(`/franchise/tracking/fnb-sites/${row.id}`)}>{row.name}</Anchor></Table.Td>
              <Table.Td>{row.location ?? "-"}</Table.Td>
              <Table.Td><StatusBadge value={row.priority} ns="priority" /></Table.Td>
              <Table.Td><StatusBadge value={row.status} ns="siteStatus" /></Table.Td>
              <Table.Td>{optionLabel(base.employeeOptions, row.owner_id)}</Table.Td>
              <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/tracking/fnb-sites/${row.id}`)}>{t("common.view")}</Button><Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("common.confirm_delete")) && deleteMutation.mutate(row.id)}>{t("common.delete")}</Button></Group></Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={6} />}
        </Table.Tbody>
      </Table>
      <Pager total={rows.length} page={page} setPage={setPage} />
      <FnbSiteFormModal opened={opened} onClose={() => setOpened(false)} />
    </Box>
  );
}

export function FnbSiteDetailPageImpl() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const base = useBaseOptions();
  const [editOpen, setEditOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const sitesQuery = useQuery({ queryKey: franchiseKeys.fnbSites("all"), queryFn: () => listFranchiseFnbSites() });
  const visitsQuery = useQuery({ queryKey: franchiseKeys.fnbVisits(id), queryFn: () => listFranchiseFnbVisits(id), enabled: Boolean(id) });
  const site = sitesQuery.data?.sites.find((row) => row.id === id);
  const introducedBy = base.contacts.find((row) => row.id === site?.introduced_by_contact_id);
  return (
    <Box p="md">
      <Stack gap="md">
        <ErrorAlert error={sitesQuery.error ?? visitsQuery.error ?? base.error} />
        {!site && sitesQuery.isLoading ? <Loader /> : site ? (
          <>
            <Card withBorder radius="sm">
              <Group justify="space-between" mb="md"><Text fw={700}>{site.name}</Text><Group><Button variant="light" onClick={() => setVisitOpen(true)}>{t("franchise.actions.newVisit")}</Button><Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button></Group></Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Info label={t("franchise.fields.org")} value={optionLabel(base.orgOptions, site.org_id)} />
                <Info label={t("franchise.fields.priority")} value={<StatusBadge value={site.priority} ns="priority" />} />
                <Info label={t("franchise.fields.status")} value={<StatusBadge value={site.status} ns="siteStatus" />} />
                <Info label={t("franchise.fields.owner")} value={optionLabel(base.employeeOptions, site.owner_id)} />
                <Info label={t("franchise.fields.hasAircon")} value={site.has_aircon === null || site.has_aircon === undefined ? "-" : t(site.has_aircon ? "common.yes" : "common.no")} />
                <Info label={t("franchise.fields.introducedBy")} value={introducedBy?.name ?? "-"} />
                <Info label={t("franchise.fields.location")} value={site.location ?? "-"} />
                <Info label={t("franchise.fields.relationshipNote")} value={site.relationship_note ?? "-"} />
              </SimpleGrid>
            </Card>
            <VisitTable visits={visitsQuery.data?.visits ?? []} loading={visitsQuery.isLoading} />
            <FnbSiteFormModal opened={editOpen} onClose={() => setEditOpen(false)} site={site} />
            <VisitFormModal opened={visitOpen} onClose={() => setVisitOpen(false)} mode="fnb" targetId={site.id} />
          </>
        ) : <Text c="dimmed">{t("common.not_found")}</Text>}
      </Stack>
    </Box>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm">{value}</Text>
    </Box>
  );
}

function VisitTable({ visits, loading }: { visits: FranchiseVisit[]; loading: boolean }) {
  const { t } = useTranslation();
  const base = useBaseOptions();
  const sorted = [...visits].sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime());
  return (
    <Card withBorder radius="sm">
      <Text fw={600} mb="sm">{t("franchise.tabs.visits")}</Text>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.visitedAt")}</Table.Th><Table.Th>{t("franchise.fields.type")}</Table.Th><Table.Th>{t("franchise.fields.employee")}</Table.Th><Table.Th>{t("franchise.fields.interestLevel")}</Table.Th><Table.Th>{t("franchise.fields.result")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {loading ? <LoadingRow colSpan={5} /> : sorted.length ? sorted.map((row) => (
            <Table.Tr key={row.id}><Table.Td>{fmt(row.visited_at)}</Table.Td><Table.Td>{t(`franchise.visitType.${row.type}`)}</Table.Td><Table.Td>{optionLabel(base.employeeOptions, row.by_employee_id)}</Table.Td><Table.Td><StatusBadge value={row.interest_level} ns="interestLevel" /></Table.Td><Table.Td>{row.result ?? "-"}</Table.Td></Table.Tr>
          )) : <EmptyRow colSpan={5} />}
        </Table.Tbody>
      </Table>
    </Card>
  );
}

export function ContactsPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ q: "", org_type: "", due_before: "" });
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(false);
  const params = { ...filters, due_before: filters.due_before ? toApiDateTime(filters.due_before) : "" };
  const query = useQuery({ queryKey: franchiseKeys.contacts(qsKey(params)), queryFn: () => listFranchiseContacts(params) });
  const rows = query.data?.contacts ?? [];
  const qc = useQueryClient();
  const deleteMutation = useMutation({ mutationFn: deleteFranchiseContact, onSuccess: () => qc.invalidateQueries({ queryKey: franchiseKeys.all }) });
  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput w={200} placeholder={t("franchise.filters.search")} value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.currentTarget.value }))} />
        <Select w={170} clearable placeholder={t("franchise.fields.orgType")} data={enumOptions(franchiseOrgTypes, "orgType", t)} value={filters.org_type || null} onChange={(v) => setFilters((x) => ({ ...x, org_type: v ?? "" }))} />
        <TextInput w={210} type="datetime-local" placeholder={t("franchise.fields.nextVisitAt")} value={filters.due_before} onChange={(e) => setFilters((x) => ({ ...x, due_before: e.currentTarget.value }))} />
        <Button onClick={() => setOpened(true)}>{t("franchise.actions.newContact")}</Button>
      </Group>
      <ErrorAlert error={query.error ?? base.error ?? deleteMutation.error} />
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.name")}</Table.Th><Table.Th>{t("franchise.fields.role")}</Table.Th><Table.Th>{t("franchise.fields.phone")}</Table.Th><Table.Th>{t("franchise.fields.org")}</Table.Th><Table.Th>{t("franchise.fields.nextVisitAt")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? slicePage(rows, page).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td><Anchor onClick={() => navigate(`/franchise/tracking/contacts/${row.id}`)}>{row.name}</Anchor></Table.Td>
              <Table.Td>{row.role ?? "-"}</Table.Td><Table.Td>{row.phone ?? "-"}</Table.Td><Table.Td>{row.org?.name ?? optionLabel(base.orgOptions, row.org_id)}</Table.Td><Table.Td>{fmt(row.next_visit_at)}</Table.Td>
              <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/tracking/contacts/${row.id}`)}>{t("common.view")}</Button><Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("common.confirm_delete")) && deleteMutation.mutate(row.id)}>{t("common.delete")}</Button></Group></Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={6} />}
        </Table.Tbody>
      </Table>
      <Pager total={rows.length} page={page} setPage={setPage} />
      <ContactFormModal opened={opened} onClose={() => setOpened(false)} />
    </Box>
  );
}

export function ContactDetailPageImpl() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const [editOpen, setEditOpen] = useState(false);
  const base = useBaseOptions();
  const query = useQuery({ queryKey: franchiseKeys.contacts("all"), queryFn: () => listFranchiseContacts() });
  const contact = query.data?.contacts.find((row) => row.id === id);
  const referredBy = query.data?.contacts.find((row) => row.id === contact?.referred_by_contact_id);
  const introduced = (query.data?.contacts ?? []).filter((row) => row.referred_by_contact_id === id);
  return (
    <Box p="md">
      <Stack gap="md">
        <ErrorAlert error={query.error ?? base.error} />
        {!contact && query.isLoading ? <Loader /> : contact ? (
          <>
            <Card withBorder radius="sm">
              <Group justify="space-between" mb="md"><Text fw={700}>{contact.name}</Text><Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button></Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Info label={t("franchise.fields.role")} value={contact.role ?? "-"} />
                <Info label={t("franchise.fields.phone")} value={contact.phone ?? "-"} />
                <Info label={t("franchise.fields.org")} value={contact.org?.name ?? optionLabel(base.orgOptions, contact.org_id)} />
                <Info label={t("franchise.fields.referredBy")} value={referredBy?.name ?? "-"} />
                <Info label={t("franchise.fields.nextVisitAt")} value={fmt(contact.next_visit_at)} />
                <Info label={t("franchise.fields.owner")} value={optionLabel(base.employeeOptions, contact.owner_id)} />
                <Info label={t("franchise.fields.note")} value={contact.note ?? "-"} />
              </SimpleGrid>
            </Card>
            <Card withBorder radius="sm">
              <Text fw={600} mb="sm">{t("franchise.contacts.introducedByThisContact")}</Text>
              {introduced.length ? <Group gap="xs">{introduced.map((row) => <Badge key={row.id} variant="light">{row.name}</Badge>)}</Group> : <Text c="dimmed">{t("franchise.empty")}</Text>}
            </Card>
            <ContactFormModal opened={editOpen} onClose={() => setEditOpen(false)} contact={contact} />
          </>
        ) : <Text c="dimmed">{t("common.not_found")}</Text>}
      </Stack>
    </Box>
  );
}

export function VisitsPageImpl() {
  const { t } = useTranslation();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ from: "", to: "", employee_id: "" });
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: franchiseKeys.visits(qsKey(filters)), queryFn: () => listFranchiseVisits(filters) });
  const visits = query.data?.visits ?? [];
  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput type="date" w={170} label={t("franchise.filters.from")} value={filters.from} onChange={(e) => setFilters((v) => ({ ...v, from: e.currentTarget.value }))} />
        <TextInput type="date" w={170} label={t("franchise.filters.to")} value={filters.to} onChange={(e) => setFilters((v) => ({ ...v, to: e.currentTarget.value }))} />
        <Select label={t("franchise.fields.employee")} data={base.employeeOptions} w={200} clearable searchable value={filters.employee_id || null} onChange={(value) => setFilters((v) => ({ ...v, employee_id: value ?? "" }))} />
      </Group>
      <ErrorAlert error={query.error ?? base.error} />
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.visitedAt")}</Table.Th><Table.Th>{t("franchise.fields.type")}</Table.Th><Table.Th>{t("franchise.fields.employee")}</Table.Th><Table.Th>{t("franchise.fields.contact")}</Table.Th><Table.Th>{t("franchise.fields.interestLevel")}</Table.Th><Table.Th>{t("franchise.fields.result")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {query.isLoading ? <LoadingRow colSpan={6} /> : visits.length ? slicePage(visits, page).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>{fmt(row.visited_at)}</Table.Td><Table.Td>{t(`franchise.visitType.${row.type}`)}</Table.Td><Table.Td>{optionLabel(base.employeeOptions, row.by_employee_id)}</Table.Td><Table.Td>{optionLabel(base.contactOptions, row.contact_id)}</Table.Td><Table.Td><StatusBadge value={row.interest_level} ns="interestLevel" /></Table.Td><Table.Td>{row.result ?? "-"}</Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={6} />}
        </Table.Tbody>
      </Table>
      <Pager total={visits.length} page={page} setPage={setPage} />
    </Box>
  );
}

export function FranchisePropertyPlaceholder() {
  const { t } = useTranslation();
  const items = ["vending_machine", "massage_chair", "ai_mattress", "cleaning_robot", "cleaning", "security"];
  return <PlaceholderGrid title={t("nav.franchise_property")} items={items.map((key) => t(`franchise.service.${key}`))} />;
}

export function FranchiseFnbPlaceholder() {
  const { t } = useTranslation();
  return <PlaceholderGrid title={t("nav.franchise_fnb")} items={[t("franchise.placeholder.foodCourt"), t("franchise.placeholder.cafe")]} />;
}

function PlaceholderGrid({ title, items }: { title: string; items: string[] }) {
  const { t } = useTranslation();
  return (
    <Box p="md">
      <Stack gap="md">
        <Text fw={700} size="lg">{title}</Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {items.map((item, index) => (
            <Card key={item} withBorder radius="sm">
              <Group gap="md" align="flex-start">
                <ThemeIcon variant="light" size="lg">{index + 1}</ThemeIcon>
                <Box>
                  <Text fw={600}>{item}</Text>
                  <Badge mt="sm" color="gray">{t("common.comingSoon")}</Badge>
                </Box>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Box>
  );
}
