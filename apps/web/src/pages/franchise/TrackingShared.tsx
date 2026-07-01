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
  franchiseSiteStatuses,
  franchiseTriStates,
  franchiseVisitStatuses,
  type FranchiseService
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { MapPicker } from "../../components/MapPicker";
import { CreatableCombobox } from "../../components/CreatableCombobox";
import { listEmployees } from "../../api/hr";
import {
  createFranchiseContact,
  createFranchiseFnbSite,
  createFranchiseFnbVisit,
  createFranchiseProperty,
  createFranchisePropertyVisit,
  deleteFranchiseContact,
  deleteFranchiseFnbSite,
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
  updateFranchiseFnbVisit,
  updateFranchiseProperty,
  updateFranchisePropertyVisit,
  type FranchiseContact,
  type FranchiseFnbSite,
  type FranchiseOrg,
  type FranchiseProperty,
  type FranchiseVisit
} from "../../api/franchise";
import {
  optionLabel as propertySurveyOptionLabel,
  propertySurveyServices,
  surveyLang,
  visiblePropertySurveySections,
  type PropertySurveyField
} from "./propertySurvey";
import { ContactPicker } from "./ContactPicker";
import { OrgSelect } from "./OrgSelect";
import { TablePagination } from "../../components/TablePagination";
import { usePagination } from "../../hooks/usePagination";

type Dict = Record<string, unknown>;
type Option = { value: string; label: string };
export type PropertySurveyDetails = Record<string, Record<string, string | string[]>>;

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

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
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

function StatusBadge({ value, ns }: { value?: string | null | undefined; ns: string }) {
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

function useSimpleForm(initial: Dict = {}) {
  const [values, setValues] = useState<Dict>(initial);
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));
  return { values, setValues, set };
}

function useBaseOptions() {
  const employeesQuery = useQuery({ queryKey: ["hr", "employees"], queryFn: () => listEmployees() });
  const orgsQuery = useQuery({ queryKey: franchiseKeys.orgs("all"), queryFn: () => listFranchiseOrgs() });
  const contactsQuery = useQuery({ queryKey: franchiseKeys.contacts("all"), queryFn: () => listFranchiseContacts() });
  return {
    employees: employeesQuery.data?.employees ?? [],
    orgs: orgsQuery.data?.orgs ?? [],
    contacts: contactsQuery.data?.contacts ?? [],
    employeeOptions: (employeesQuery.data?.employees ?? []).map((row) => ({ value: row.id, label: row.name })),
    orgOptions: (orgsQuery.data?.orgs ?? []).map((row) => ({ value: row.id, label: row.name })),
    contactOptions: (contactsQuery.data?.contacts ?? []).map((row) => ({ value: row.id, label: `${row.name}${row.phone ? ` · ${row.phone}` : ""}` })),
    error: employeesQuery.error ?? orgsQuery.error ?? contactsQuery.error
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

function localizedOptions<T extends { value: string; label: { zh: string; en: string } }>(items: T[], lang: "zh" | "en") {
  return items.map((item) => ({ value: item.value, label: item.label[lang] }));
}

function fieldVisible(field: PropertySurveyField, sectionValues: Record<string, string | string[]>) {
  if (!field.showWhen) return true;
  return sectionValues[field.showWhen.field] === field.showWhen.value;
}

function setSurveyField(
  setDetails: React.Dispatch<React.SetStateAction<PropertySurveyDetails>>,
  sectionKey: string,
  fieldKey: string,
  value: string | string[] | null
) {
  setDetails((current) => {
    const section = { ...(current[sectionKey] ?? {}) };
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      delete section[fieldKey];
    } else {
      section[fieldKey] = value;
    }
    return { ...current, [sectionKey]: section };
  });
}

export function buildVisibleSurveyDetails(details: PropertySurveyDetails, services: FranchiseService[]) {
  const out: PropertySurveyDetails = {};
  for (const section of visiblePropertySurveySections(services)) {
    const current = details[section.key] ?? {};
    const clean: Record<string, string | string[]> = {};
    for (const field of section.fields) {
      if (!fieldVisible(field, current)) continue;
      const value = current[field.key];
      if (value !== undefined && (!Array.isArray(value) || value.length > 0)) clean[field.key] = value;
    }
    if (Object.keys(clean).length > 0) out[section.key] = clean;
  }
  return out;
}

export function PropertySurveyFields({
  services,
  details,
  setDetails
}: {
  services: FranchiseService[];
  details: PropertySurveyDetails;
  setDetails: React.Dispatch<React.SetStateAction<PropertySurveyDetails>>;
}) {
  const { i18n } = useTranslation();
  const lang = surveyLang(i18n.language);

  return (
    <>
      {visiblePropertySurveySections(services).map((section) => {
        const sectionValues = details[section.key] ?? {};
        return (
          <Card key={section.key} withBorder radius="sm">
            <Text fw={600} mb="sm">{section.title[lang]}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {section.fields.filter((field) => fieldVisible(field, sectionValues)).map((field) =>
                field.type === "multi" ? (
                  <MultiSelect
                    key={field.key}
                    label={field.label[lang]}
                    data={localizedOptions(field.options, lang)}
                    value={(sectionValues[field.key] as string[] | undefined) ?? []}
                    onChange={(value) => setSurveyField(setDetails, section.key, field.key, value)}
                  />
                ) : (
                  <Select
                    key={field.key}
                    label={field.label[lang]}
                    data={localizedOptions(field.options, lang)}
                    value={(sectionValues[field.key] as string | undefined) ?? null}
                    onChange={(value) => setSurveyField(setDetails, section.key, field.key, value)}
                    clearable
                  />
                )
              )}
            </SimpleGrid>
          </Card>
        );
      })}
    </>
  );
}

function PropertySurveySummary({
  details,
  services
}: {
  details?: Record<string, unknown> | null | undefined;
  services?: FranchiseService[] | null | undefined;
}) {
  const { i18n, t } = useTranslation();
  const lang = surveyLang(i18n.language);
  const selectedServices = services ?? [];
  const values = (details ?? {}) as PropertySurveyDetails;
  const sections = visiblePropertySurveySections(selectedServices).filter((section) => values[section.key]);

  if (!sections.length) return null;

  return (
    <Stack gap="sm" mt="sm">
      <Text size="sm" fw={600}>{t("franchise.survey.savedSurvey")}</Text>
      {sections.map((section) => {
        const sectionValues = values[section.key] ?? {};
        const fields = section.fields.filter((field) => fieldVisible(field, sectionValues) && sectionValues[field.key] !== undefined);
        if (!fields.length) return null;
        return (
          <Card key={section.key} withBorder radius="sm" p="sm">
            <Text size="sm" fw={600} mb="xs">{section.title[lang]}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {fields.map((field) => {
                const value = sectionValues[field.key];
                const display = Array.isArray(value)
                  ? value.map((item) => propertySurveyOptionLabel(field, item, lang)).join(", ")
                  : propertySurveyOptionLabel(field, String(value), lang);
                return <Info key={field.key} label={field.label[lang]} value={display} />;
              })}
            </SimpleGrid>
          </Card>
        );
      })}
    </Stack>
  );
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

function PropertyFormModal({ opened, onClose, property }: { opened: boolean; onClose: () => void; property?: FranchiseProperty }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm({
    name: property?.name ?? "",
    property_type: property?.property_type ?? "mall",
    address: property?.address ?? "",
    lat: property?.lat ?? null,
    lng: property?.lng ?? null,
    unit_floor: property?.unit_floor ?? "",
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
        lat: emptyToNull(form.values.lat),
        lng: emptyToNull(form.values.lng),
        unit_floor: emptyToNull(form.values.unit_floor),
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
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <Select label={t("franchise.fields.propertyType")} data={enumOptions(franchisePropertyTypes, "propertyType", t)} value={(form.values.property_type as string) ?? null} onChange={(v) => form.set("property_type", v)} />
        <Select label={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={(form.values.priority as string) ?? null} onChange={(v) => form.set("priority", v)} />
        <OrgSelect label={t("franchise.fields.org")} value={form.values.org_id as string | null | undefined} onChange={(v) => form.set("org_id", v)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
        <Select label={t("franchise.fields.footfall")} data={enumOptions(franchiseFootfalls, "footfall", t)} value={(form.values.footfall as string | null) ?? null} onChange={(v) => form.set("footfall", v)} clearable />
        <Select label={t("franchise.fields.decisionMaker")} data={enumOptions(franchiseDecisionMakers, "decisionMaker", t)} value={(form.values.decision_maker as string | null) ?? null} onChange={(v) => form.set("decision_maker", v)} clearable />
        <Select label={t("franchise.fields.hasPublicSpace")} data={enumOptions(franchiseTriStates, "triState", t)} value={(form.values.has_public_space as string | null) ?? null} onChange={(v) => form.set("has_public_space", v)} clearable />
        <Select label={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={(form.values.status as string) ?? null} onChange={(v) => form.set("status", v)} />
        <Checkbox label={t("franchise.fields.isVendingSite")} checked={Boolean(form.values.is_vending_site)} onChange={(e) => form.set("is_vending_site", e.currentTarget.checked)} />
        <ContactPicker label={t("franchise.fields.introducedBy")} value={form.values.introduced_by_contact_id as string | null | undefined} onChange={(v) => form.set("introduced_by_contact_id", v)} />
      </SimpleGrid>
      <MapPicker
        lat={numberOrNull(form.values.lat)}
        lng={numberOrNull(form.values.lng)}
        radius={0}
        onChange={(lat, lng) => {
          form.set("lat", lat);
          form.set("lng", lng);
        }}
        onResolveAddress={(address) => form.set("address", address)}
      />
      <Textarea label={t("franchise.fields.address")} value={(form.values.address as string) ?? ""} onChange={(e) => form.set("address", e.currentTarget.value)} />
      <TextInput label={t("franchise.fields.unitFloor")} placeholder="#03-12" value={(form.values.unit_floor as string) ?? ""} onChange={(e) => form.set("unit_floor", e.currentTarget.value)} />
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
    name: site?.name ?? "",
    org_id: site?.org_id ?? null,
    location: site?.location ?? "",
    lat: site?.lat ?? null,
    lng: site?.lng ?? null,
    unit_floor: site?.unit_floor ?? "",
    has_aircon: site?.has_aircon ?? null,
    introduced_by_contact_id: site?.introduced_by_contact_id ?? null,
    relationship_note: site?.relationship_note ?? "",
    priority: site?.priority ?? "medium",
    status: site?.status ?? "unvisited",
    owner_id: site?.owner_id ?? null
  });
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const body = {
        ...form.values,
        location: emptyToNull(form.values.location),
        lat: emptyToNull(form.values.lat),
        lng: emptyToNull(form.values.lng),
        unit_floor: emptyToNull(form.values.unit_floor),
        relationship_note: emptyToNull(form.values.relationship_note)
      };
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
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <OrgSelect label={t("franchise.fields.org")} value={form.values.org_id as string | null | undefined} onChange={(v) => form.set("org_id", v)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
        <Select label={t("franchise.fields.priority")} data={enumOptions(franchisePriorities, "priority", t)} value={(form.values.priority as string) ?? null} onChange={(v) => form.set("priority", v)} />
        <Select label={t("franchise.fields.status")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} value={(form.values.status as string) ?? null} onChange={(v) => form.set("status", v)} />
        <Select label={t("franchise.fields.hasAircon")} data={enumOptions(franchiseTriStates.filter((v) => v !== "pending"), "triState", t)} value={form.values.has_aircon === true ? "yes" : form.values.has_aircon === false ? "no" : null} onChange={(v) => form.set("has_aircon", v === "yes" ? true : v === "no" ? false : null)} clearable />
        <ContactPicker label={t("franchise.fields.introducedBy")} value={form.values.introduced_by_contact_id as string | null | undefined} onChange={(v) => form.set("introduced_by_contact_id", v)} />
      </SimpleGrid>
      <MapPicker
        lat={numberOrNull(form.values.lat)}
        lng={numberOrNull(form.values.lng)}
        radius={0}
        onChange={(lat, lng) => {
          form.set("lat", lat);
          form.set("lng", lng);
        }}
        onResolveAddress={(address) => form.set("location", address)}
      />
      <Textarea label={t("franchise.fields.location")} value={(form.values.location as string) ?? ""} onChange={(e) => form.set("location", e.currentTarget.value)} />
      <TextInput label={t("franchise.fields.unitFloor")} placeholder="#03-12" value={(form.values.unit_floor as string) ?? ""} onChange={(e) => form.set("unit_floor", e.currentTarget.value)} />
      <Textarea label={t("franchise.fields.relationshipNote")} value={(form.values.relationship_note as string) ?? ""} onChange={(e) => form.set("relationship_note", e.currentTarget.value)} />
    </FieldModal>
  );
}

function ContactFormModal({ opened, onClose, contact }: { opened: boolean; onClose: () => void; contact?: FranchiseContact }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm({
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
  const roleOptions = useMemo(() => {
    const roles = new Set(base.contacts.map((row) => row.role?.trim()).filter((role): role is string => Boolean(role)));
    const currentRole = (form.values.role as string | undefined)?.trim();
    if (currentRole) roles.add(currentRole);
    return [...roles].sort((a, b) => a.localeCompare(b)).map((role) => ({ value: role, label: role }));
  }, [base.contacts, form.values.role]);
  return (
    <FieldModal opened={opened} onClose={onClose} title={contact ? t("franchise.actions.editContact") : t("franchise.actions.newContact")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error ?? base.error} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label={t("franchise.fields.name")} value={(form.values.name as string) ?? ""} onChange={(e) => form.set("name", e.currentTarget.value)} />
        <CreatableCombobox label={t("franchise.fields.role")} options={roleOptions} value={(form.values.role as string) || null} onChange={(value) => form.set("role", value)} onCreate={async (name) => name} />
        <TextInput label={t("franchise.fields.phone")} value={(form.values.phone as string) ?? ""} onChange={(e) => form.set("phone", e.currentTarget.value)} />
        <OrgSelect label={t("franchise.fields.org")} value={form.values.org_id as string | null | undefined} onChange={(v) => form.set("org_id", v)} />
        <ContactPicker label={t("franchise.fields.referredBy")} value={form.values.referred_by_contact_id as string | null | undefined} onChange={(v) => form.set("referred_by_contact_id", v)} excludeId={contact?.id} />
        <TextInput type="datetime-local" label={t("franchise.fields.nextVisitAt")} value={(form.values.next_visit_at as string) ?? ""} onChange={(e) => form.set("next_visit_at", e.currentTarget.value)} />
        <SelectField label={t("franchise.fields.owner")} value={form.values.owner_id} data={base.employeeOptions} onChange={(v) => form.set("owner_id", v)} />
      </SimpleGrid>
      <Textarea label={t("franchise.fields.note")} value={(form.values.note as string) ?? ""} onChange={(e) => form.set("note", e.currentTarget.value)} />
    </FieldModal>
  );
}

type VisitTarget = { type: "property" | "fnb"; id: string };

function splitVisitTarget(value: unknown): VisitTarget | null {
  if (typeof value !== "string") return null;
  const [type, id] = value.split(":");
  return (type === "property" || type === "fnb") && id ? { type, id } : null;
}

function visitTargetValue(target: VisitTarget) {
  return `${target.type}:${target.id}`;
}

function visitTime(row: FranchiseVisit) {
  return row.visited_at ?? row.planned_at ?? null;
}

function VisitPlanModal({
  opened,
  onClose,
  fixedTarget
}: {
  opened: boolean;
  onClose: () => void;
  fixedTarget?: VisitTarget;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const base = useBaseOptions();
  const propertiesQuery = useQuery({ queryKey: franchiseKeys.properties("plan-options"), queryFn: () => listFranchiseProperties(), enabled: opened && !fixedTarget });
  const fnbSitesQuery = useQuery({ queryKey: franchiseKeys.fnbSites("plan-options"), queryFn: () => listFranchiseFnbSites(), enabled: opened && !fixedTarget });
  const form = useSimpleForm({
    target: fixedTarget ? visitTargetValue(fixedTarget) : "",
    planned_at: new Date().toISOString().slice(0, 16),
    by_employee_id: base.employeeOptions[0]?.value ?? "",
    contact_id: null,
    note: ""
  });
  const targetOptions = [
    ...(propertiesQuery.data?.properties ?? []).map((property) => ({
      value: visitTargetValue({ type: "property", id: property.id }),
      label: `${t("franchise.visitType.property")} · ${property.name}${property.address ? ` · ${property.address}` : ""}`
    })),
    ...(fnbSitesQuery.data?.sites ?? []).map((site) => ({
      value: visitTargetValue({ type: "fnb", id: site.id }),
      label: `${t("franchise.visitType.fnb")} · ${site.name}${site.location ? ` · ${site.location}` : ""}`
    }))
  ];
  const mutation = useMutation({
    mutationFn: async () => {
      const target = splitVisitTarget(form.values.target) ?? fixedTarget;
      if (!target) throw new Error(t("franchise.errors.siteRequired"));
      const body = {
        status: "planned",
        planned_at: toApiDateTime(form.values.planned_at),
        by_employee_id: form.values.by_employee_id || base.employeeOptions[0]?.value,
        contact_id: form.values.contact_id,
        note: emptyToNull(form.values.note)
      };
      return target.type === "property" ? createFranchisePropertyVisit(target.id, body) : createFranchiseFnbVisit(target.id, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: franchiseKeys.all });
      onClose();
    }
  });

  return (
    <FieldModal opened={opened} onClose={onClose} title={t("franchise.actions.newVisitPlan")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="lg">
      <ErrorAlert error={mutation.error ?? base.error ?? propertiesQuery.error ?? fnbSitesQuery.error} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {fixedTarget ? null : (
          <Select label={t("franchise.fields.site")} data={targetOptions} value={(form.values.target as string) || null} onChange={(v) => form.set("target", v ?? "")} searchable />
        )}
        <TextInput type="datetime-local" label={t("franchise.fields.plannedAt")} value={(form.values.planned_at as string) ?? ""} onChange={(e) => form.set("planned_at", e.currentTarget.value)} />
        <SelectField label={t("franchise.fields.employee")} value={form.values.by_employee_id || base.employeeOptions[0]?.value} data={base.employeeOptions} onChange={(v) => form.set("by_employee_id", v)} clearable={false} />
        <ContactPicker label={t("franchise.fields.contact")} value={form.values.contact_id as string | null | undefined} onChange={(v) => form.set("contact_id", v)} />
      </SimpleGrid>
      <Textarea label={t("franchise.fields.note")} value={(form.values.note as string) ?? ""} onChange={(e) => form.set("note", e.currentTarget.value)} />
    </FieldModal>
  );
}

function CompleteVisitModal({ opened, onClose, visit }: { opened: boolean; onClose: () => void; visit: FranchiseVisit | null }) {
  const { i18n, t } = useTranslation();
  const qc = useQueryClient();
  const [details, setDetails] = useState<PropertySurveyDetails>({});
  const form = useSimpleForm({
    visited_at: new Date().toISOString().slice(0, 16),
    interest_level: "medium",
    services_pitched: [] as string[],
    interested_services: [] as string[],
    result: "",
    note: "",
    next_visit_at: "",
    rent_fixed: "",
    rent_revenue_share_pct: "",
    management_fee: "",
    dishwash_fee: "",
    contract_expiry: null,
    extra_conditions: ""
  });
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      if (!visit) return;
      const common = {
        status: "completed",
        visited_at: toApiDateTime(form.values.visited_at),
        interest_level: form.values.interest_level,
        result: emptyToNull(form.values.result),
        note: emptyToNull(form.values.note),
        next_visit_at: form.values.next_visit_at ? toApiDateTime(form.values.next_visit_at) : null
      };
      if (visit.type === "property") {
        const interestedServices = (form.values.interested_services as FranchiseService[]) ?? [];
        return updateFranchisePropertyVisit(visit.property_id, visit.id, {
          ...common,
          services_pitched: interestedServices,
          survey: {
            interested_services: interestedServices,
            details: buildVisibleSurveyDetails(details, interestedServices)
          }
        });
      }
      return updateFranchiseFnbVisit(visit.site_id, visit.id, {
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
      if (form.values.next_visit_at) window.alert(t("franchise.messages.nextVisitCreated"));
      onClose();
    }
  });
  const lang = surveyLang(i18n.language);
  const serviceOptions = localizedOptions(propertySurveyServices, lang);
  const interested = (form.values.interested_services as FranchiseService[]) ?? [];

  return (
    <FieldModal opened={opened} onClose={onClose} title={t("franchise.actions.completeVisit")} onSubmit={() => mutation.mutate()} saving={mutation.isPending} size="xl">
      <ErrorAlert error={mutation.error} />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput type="datetime-local" label={t("franchise.fields.visitedAt")} value={(form.values.visited_at as string) ?? ""} onChange={(e) => form.set("visited_at", e.currentTarget.value)} />
        <Select label={t("franchise.fields.interestLevel")} data={enumOptions(franchiseInterestLevels, "interestLevel", t)} value={(form.values.interest_level as string) ?? null} onChange={(v) => form.set("interest_level", v)} />
      </SimpleGrid>
      {visit?.type === "property" ? (
        <Stack gap="md">
          <Card withBorder radius="sm">
            <Text fw={600} mb="sm">{t("franchise.survey.interestedServices")}</Text>
            <MultiSelect data={serviceOptions} value={interested} onChange={(v) => form.set("interested_services", v)} />
          </Card>
          <PropertySurveyFields services={interested} details={details} setDetails={setDetails} />
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
      <TextInput type="datetime-local" label={t("franchise.fields.nextVisitAt")} value={(form.values.next_visit_at as string) ?? ""} onChange={(e) => form.set("next_visit_at", e.currentTarget.value)} />
    </FieldModal>
  );
}

export function PropertiesPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ q: "", priority: "", status: "", is_vending_site: "", owner_id: "" });
  const { page, pageSize, setPage, setPageSize } = usePagination(10);
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
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
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
      <TablePagination total={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
              <Group justify="space-between" mb="md"><Text fw={700}>{property.name}</Text><Group><Button variant="light" onClick={() => setVisitOpen(true)}>{t("franchise.actions.newVisitPlan")}</Button><Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button></Group></Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Info label={t("franchise.fields.propertyType")} value={t(`franchise.propertyType.${property.property_type}`)} />
                <Info label={t("franchise.fields.priority")} value={<StatusBadge value={property.priority} ns="priority" />} />
                <Info label={t("franchise.fields.status")} value={<StatusBadge value={property.status} ns="siteStatus" />} />
                <Info label={t("franchise.fields.org")} value={optionLabel(base.orgOptions, property.org_id)} />
                <Info label={t("franchise.fields.owner")} value={optionLabel(base.employeeOptions, property.owner_id)} />
                <Info label={t("franchise.fields.introducedBy")} value={introducedBy?.name ?? "-"} />
                <Info label={t("franchise.fields.address")} value={property.address ?? "-"} />
                <Info label={t("franchise.fields.unitFloor")} value={property.unit_floor ?? "-"} />
                <Info label={t("franchise.fields.relationshipNote")} value={property.relationship_note ?? "-"} />
                <Info label={t("franchise.fields.vendingNote")} value={property.vending_note ?? "-"} />
              </SimpleGrid>
            </Card>
            <VisitTable visits={visitsQuery.data?.visits ?? []} loading={visitsQuery.isLoading} />
            <PropertyFormModal opened={editOpen} onClose={() => setEditOpen(false)} property={property} />
            <VisitPlanModal opened={visitOpen} onClose={() => setVisitOpen(false)} fixedTarget={{ type: "property", id: property.id }} />
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
  const { page, pageSize, setPage, setPageSize } = usePagination(10);
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
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
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
      <TablePagination total={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
              <Group justify="space-between" mb="md"><Text fw={700}>{site.name}</Text><Group><Button variant="light" onClick={() => setVisitOpen(true)}>{t("franchise.actions.newVisitPlan")}</Button><Button onClick={() => setEditOpen(true)}>{t("common.edit")}</Button></Group></Group>
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Info label={t("franchise.fields.org")} value={optionLabel(base.orgOptions, site.org_id)} />
                <Info label={t("franchise.fields.priority")} value={<StatusBadge value={site.priority} ns="priority" />} />
                <Info label={t("franchise.fields.status")} value={<StatusBadge value={site.status} ns="siteStatus" />} />
                <Info label={t("franchise.fields.owner")} value={optionLabel(base.employeeOptions, site.owner_id)} />
                <Info label={t("franchise.fields.hasAircon")} value={site.has_aircon === null || site.has_aircon === undefined ? "-" : t(site.has_aircon ? "common.yes" : "common.no")} />
                <Info label={t("franchise.fields.introducedBy")} value={introducedBy?.name ?? "-"} />
                <Info label={t("franchise.fields.location")} value={site.location ?? "-"} />
                <Info label={t("franchise.fields.unitFloor")} value={site.unit_floor ?? "-"} />
                <Info label={t("franchise.fields.relationshipNote")} value={site.relationship_note ?? "-"} />
              </SimpleGrid>
            </Card>
            <VisitTable visits={visitsQuery.data?.visits ?? []} loading={visitsQuery.isLoading} />
            <FnbSiteFormModal opened={editOpen} onClose={() => setEditOpen(false)} site={site} />
            <VisitPlanModal opened={visitOpen} onClose={() => setVisitOpen(false)} fixedTarget={{ type: "fnb", id: site.id }} />
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
  const [completeVisit, setCompleteVisit] = useState<FranchiseVisit | null>(null);
  const [viewVisit, setViewVisit] = useState<FranchiseVisit | null>(null);
  const sorted = [...visits].sort((a, b) => new Date(visitTime(b) ?? 0).getTime() - new Date(visitTime(a) ?? 0).getTime());
  return (
    <Card withBorder radius="sm">
      <Text fw={600} mb="sm">{t("franchise.tabs.visits")}</Text>
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.visitTime")}</Table.Th><Table.Th>{t("franchise.fields.status")}</Table.Th><Table.Th>{t("franchise.fields.type")}</Table.Th><Table.Th>{t("franchise.fields.employee")}</Table.Th><Table.Th>{t("franchise.fields.interestLevel")}</Table.Th><Table.Th>{t("franchise.fields.result")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {loading ? <LoadingRow colSpan={7} /> : sorted.length ? sorted.map((row) => (
            <Fragment key={row.id}>
              <Table.Tr key={row.id}>
                <Table.Td>{fmt(visitTime(row))}</Table.Td>
                <Table.Td><StatusBadge value={row.status} ns="visitStatus" /></Table.Td>
                <Table.Td>{t(`franchise.visitType.${row.type}`)}</Table.Td>
                <Table.Td>{optionLabel(base.employeeOptions, row.by_employee_id)}</Table.Td>
                <Table.Td><StatusBadge value={row.interest_level} ns="interestLevel" /></Table.Td>
                <Table.Td>{row.result ?? "-"}</Table.Td>
                <Table.Td>{row.status === "planned" ? <Button size="xs" variant="light" onClick={() => setCompleteVisit(row)}>{t("franchise.actions.completeVisit")}</Button> : <Button size="xs" variant="subtle" onClick={() => setViewVisit(row)}>{t("common.view")}</Button>}</Table.Td>
              </Table.Tr>
              {row.type === "property" && row.survey?.details ? (
                <Table.Tr key={`${row.id}-survey`}>
                  <Table.Td colSpan={7}>
                    <PropertySurveySummary details={row.survey.details} services={row.survey.interested_services ?? row.services_pitched} />
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Fragment>
          )) : <EmptyRow colSpan={7} />}
        </Table.Tbody>
      </Table>
      <CompleteVisitModal opened={Boolean(completeVisit)} onClose={() => setCompleteVisit(null)} visit={completeVisit} />
      <VisitDetailModal opened={Boolean(viewVisit)} onClose={() => setViewVisit(null)} visit={viewVisit} />
    </Card>
  );
}

function VisitDetailModal({ opened, onClose, visit }: { opened: boolean; onClose: () => void; visit: FranchiseVisit | null }) {
  const { t } = useTranslation();
  const base = useBaseOptions();
  return (
    <Modal opened={opened} onClose={onClose} title={t("franchise.tabs.visits")} size="lg">
      {visit ? (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Info label={t("franchise.fields.visitTime")} value={fmt(visitTime(visit))} />
            <Info label={t("franchise.fields.visitStatus")} value={<StatusBadge value={visit.status} ns="visitStatus" />} />
            <Info label={t("franchise.fields.type")} value={t(`franchise.visitType.${visit.type}`)} />
            <Info label={t("franchise.fields.site")} value={visit.site_name ?? "-"} />
            <Info label={t("franchise.fields.employee")} value={optionLabel(base.employeeOptions, visit.by_employee_id)} />
            <Info label={t("franchise.fields.contact")} value={optionLabel(base.contactOptions, visit.contact_id)} />
            <Info label={t("franchise.fields.interestLevel")} value={<StatusBadge value={visit.interest_level} ns="interestLevel" />} />
            <Info label={t("franchise.fields.result")} value={visit.result ?? "-"} />
            <Info label={t("franchise.fields.note")} value={visit.note ?? "-"} />
          </SimpleGrid>
          {visit.type === "property" ? (
            <PropertySurveySummary details={visit.survey?.details} services={visit.survey?.interested_services ?? visit.services_pitched} />
          ) : visit.survey ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Info label={t("franchise.fields.rentFixed")} value={visit.survey.rent_fixed ?? "-"} />
              <Info label={t("franchise.fields.rentRevenueSharePct")} value={visit.survey.rent_revenue_share_pct ?? "-"} />
              <Info label={t("franchise.fields.managementFee")} value={visit.survey.management_fee ?? "-"} />
              <Info label={t("franchise.fields.dishwashFee")} value={visit.survey.dishwash_fee ?? "-"} />
              <Info label={t("franchise.fields.contractExpiry")} value={visit.survey.contract_expiry ? t(`franchise.contractExpiry.${visit.survey.contract_expiry}`) : "-"} />
            </SimpleGrid>
          ) : null}
        </Stack>
      ) : null}
    </Modal>
  );
}

export function ContactsPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [filters, setFilters] = useState({ q: "", org_type: "", due_before: "" });
  const { page, pageSize, setPage, setPageSize } = usePagination(10);
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
          {query.isLoading ? <LoadingRow colSpan={6} /> : rows.length ? rows.slice((page - 1) * pageSize, page * pageSize).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td><Anchor onClick={() => navigate(`/franchise/tracking/contacts/${row.id}`)}>{row.name}</Anchor></Table.Td>
              <Table.Td>{row.role ?? "-"}</Table.Td><Table.Td>{row.phone ?? "-"}</Table.Td><Table.Td>{row.org?.name ?? optionLabel(base.orgOptions, row.org_id)}</Table.Td><Table.Td>{fmt(row.next_visit_at)}</Table.Td>
              <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/tracking/contacts/${row.id}`)}>{t("common.view")}</Button><Button size="xs" color="red" variant="subtle" onClick={() => window.confirm(t("common.confirm_delete")) && deleteMutation.mutate(row.id)}>{t("common.delete")}</Button></Group></Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={6} />}
        </Table.Tbody>
      </Table>
      <TablePagination total={rows.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
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
  const [filters, setFilters] = useState({ from: "", to: "", employee_id: "", status: "", q: "", interest_level: "", site_status: "" });
  const { page, pageSize, setPage, setPageSize } = usePagination(10);
  const [planOpen, setPlanOpen] = useState(false);
  const [completeVisit, setCompleteVisit] = useState<FranchiseVisit | null>(null);
  const [viewVisit, setViewVisit] = useState<FranchiseVisit | null>(null);
  const query = useQuery({ queryKey: franchiseKeys.visits(qsKey(filters)), queryFn: () => listFranchiseVisits(filters) });
  const visits = query.data?.visits ?? [];
  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput w={220} label={t("franchise.filters.search")} value={filters.q} onChange={(e) => setFilters((v) => ({ ...v, q: e.currentTarget.value }))} />
        <Select label={t("franchise.fields.visitStatus")} data={enumOptions(franchiseVisitStatuses, "visitStatus", t)} w={160} clearable value={filters.status || null} onChange={(value) => setFilters((v) => ({ ...v, status: value ?? "" }))} />
        <Select label={t("franchise.fields.interestLevel")} data={enumOptions(franchiseInterestLevels, "interestLevel", t)} w={150} clearable value={filters.interest_level || null} onChange={(value) => setFilters((v) => ({ ...v, interest_level: value ?? "" }))} />
        <Select label={t("franchise.fields.siteStatus")} data={enumOptions(franchiseSiteStatuses, "siteStatus", t)} w={160} clearable value={filters.site_status || null} onChange={(value) => setFilters((v) => ({ ...v, site_status: value ?? "" }))} />
        <Select label={t("franchise.fields.employee")} data={base.employeeOptions} w={200} clearable searchable value={filters.employee_id || null} onChange={(value) => setFilters((v) => ({ ...v, employee_id: value ?? "" }))} />
        <TextInput type="date" w={170} label={t("franchise.filters.from")} value={filters.from} onChange={(e) => setFilters((v) => ({ ...v, from: e.currentTarget.value }))} />
        <TextInput type="date" w={170} label={t("franchise.filters.to")} value={filters.to} onChange={(e) => setFilters((v) => ({ ...v, to: e.currentTarget.value }))} />
        <Button mt={24} onClick={() => setPlanOpen(true)}>{t("franchise.actions.newVisitPlan")}</Button>
      </Group>
      <ErrorAlert error={query.error ?? base.error} />
      <Table withTableBorder withColumnBorders highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>{t("franchise.fields.visitTime")}</Table.Th><Table.Th>{t("franchise.fields.type")}</Table.Th><Table.Th>{t("franchise.fields.visitStatus")}</Table.Th><Table.Th>{t("franchise.fields.site")}</Table.Th><Table.Th>{t("franchise.fields.employee")}</Table.Th><Table.Th>{t("franchise.fields.contact")}</Table.Th><Table.Th>{t("franchise.fields.interestLevel")}</Table.Th><Table.Th>{t("franchise.fields.siteStatus")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {query.isLoading ? <LoadingRow colSpan={9} /> : visits.length ? visits.slice((page - 1) * pageSize, page * pageSize).map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>{fmt(visitTime(row))}</Table.Td>
              <Table.Td>{t(`franchise.visitType.${row.type}`)}</Table.Td>
              <Table.Td><StatusBadge value={row.status} ns="visitStatus" /></Table.Td>
              <Table.Td>{row.site_name ?? "-"}</Table.Td>
              <Table.Td>{optionLabel(base.employeeOptions, row.by_employee_id)}</Table.Td>
              <Table.Td>{optionLabel(base.contactOptions, row.contact_id)}</Table.Td>
              <Table.Td><StatusBadge value={row.interest_level} ns="interestLevel" /></Table.Td>
              <Table.Td><StatusBadge value={row.site_status} ns="siteStatus" /></Table.Td>
              <Table.Td>{row.status === "planned" ? <Button size="xs" variant="light" onClick={() => setCompleteVisit(row)}>{t("franchise.actions.completeVisit")}</Button> : <Button size="xs" variant="subtle" onClick={() => setViewVisit(row)}>{t("common.view")}</Button>}</Table.Td>
            </Table.Tr>
          )) : <EmptyRow colSpan={9} />}
        </Table.Tbody>
      </Table>
      <TablePagination total={visits.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
      <VisitPlanModal opened={planOpen} onClose={() => setPlanOpen(false)} />
      <CompleteVisitModal opened={Boolean(completeVisit)} onClose={() => setCompleteVisit(null)} visit={completeVisit} />
      <VisitDetailModal opened={Boolean(viewVisit)} onClose={() => setViewVisit(null)} visit={viewVisit} />
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
