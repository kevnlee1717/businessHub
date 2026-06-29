import {
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  FileButton,
  Grid,
  Group,
  Image,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  Progress,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  TypographyStylesProvider,
} from "@mantine/core";
import {
  recruitmentCampaignStatuses,
  recruitmentCampaignTypes,
  recruitmentCandidateStatuses,
  recruitmentFollowupTypes,
  recruitmentInterviewResults,
  recruitmentInterviewStatuses,
  recruitmentJobPriorities,
  recruitmentJobStatuses,
  recruitmentMaterialTypes,
  recruitmentPostingStatuses,
  recruitmentSourceTypes,
  type RecruitmentCampaignStatus,
  type RecruitmentCandidateStatus,
  type RecruitmentJobPriority,
  type RecruitmentJobStatus,
  type RecruitmentMaterialType,
  type RecruitmentPostingStatus
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import { BilingualInput } from "../../components/BilingualInput";
import { CreatableCombobox, type Option } from "../../components/CreatableCombobox";
import { fileUrl } from "../../api/dms";
import { listCompanies, listEmployees } from "../../api/hr";
import { translateText } from "../../api/translate";
import {
  createRecruitmentCampaign,
  createRecruitmentCandidate,
  createRecruitmentFollowup,
  createRecruitmentIndustry,
  createRecruitmentInterview,
  createRecruitmentJob,
  createRecruitmentMaterial,
  createRecruitmentPosting,
  deleteRecruitmentMaterial,
  generateRecruitmentCopy,
  getRecruitmentCampaign,
  getRecruitmentCandidate,
  getRecruitmentDashboard,
  getRecruitmentJob,
  listRecruitmentCampaigns,
  listRecruitmentCandidates,
  listRecruitmentIndustries,
  listRecruitmentJobs,
  listRecruitmentPostings,
  listRecruitmentSettings,
  recruitmentKeys,
  updateRecruitmentCandidate,
  updateRecruitmentCampaign,
  updateRecruitmentIndustry,
  updateRecruitmentInterview,
  updateRecruitmentJob,
  updateRecruitmentMaterial,
  updateRecruitmentPosting,
  updateRecruitmentSettings,
  uploadRecruitmentPostingScreenshot,
  type RecruitmentCampaign,
  type RecruitmentCandidate,
  type RecruitmentIndustry,
  type RecruitmentJob,
  type RecruitmentMaterial,
  type RecruitmentPosting
} from "../../api/recruitment";
import { normalizeLang, pickLang, tField, type AppLang, type I18nValue } from "../../lib/i18nField";

const pageSize = 10;

type Dict = Record<string, unknown>;
type EmploymentType = "full_time" | "part_time";

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toDateTimeInput(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function emptyToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function nullableFirstText(...values: unknown[]) {
  return firstText(...values) || null;
}

function renderJobSalary(job: RecruitmentJob, t: (key: string) => string, lang: AppLang) {
  const employmentTypes = job.employment_types?.length ? job.employment_types : ["full_time"];
  const rows = [];
  if (employmentTypes.includes("full_time") && (job.salary_min != null || job.salary_max != null)) {
    rows.push(`${t("recruitment.fields.salaryFullTimeTag")} ${job.salary_min ?? "-"}-${job.salary_max ?? "-"}${t("recruitment.fields.perMonth")}`);
  }
  if (employmentTypes.includes("part_time") && (job.pt_salary_min != null || job.pt_salary_max != null)) {
    rows.push(`${t("recruitment.fields.salaryPartTimeTag")} ${job.pt_salary_min ?? "-"}-${job.pt_salary_max ?? "-"}${t("recruitment.fields.perHour")}`);
  }
  if (!rows.length) return tField(job, "salaryNote", lang) || "-";
  return <Stack gap={2}>{rows.map((row) => <Text key={row} size="sm">{row}</Text>)}</Stack>;
}

function looksChinese(value: string) {
  return /[一-鿿]/.test(value);
}

function fieldI18n(row: any, field: string): I18nValue {
  return row?.[`${field}_i18n`];
}

function editPair(row: any, field: string) {
  const i18n = fieldI18n(row, field);
  const zh = i18n?.zh?.trim() ?? "";
  const en = i18n?.en?.trim() ?? "";
  if (zh || en) return { zh, en };

  const original = typeof row?.[field] === "string" ? row[field].trim() : "";
  if (!original) return { zh: "", en: "" };
  return looksChinese(original) ? { zh: original, en: "" } : { zh: "", en: original };
}

async function industryBody(companyId: unknown, nameZh: string, nameEn: string) {
  const zh = nameZh.trim();
  const en = nameEn.trim();
  const name = firstText(zh, en);
  return {
    company_id: companyId,
    name,
    nameZh: zh,
    nameEn: en
  };
}

async function industryBodyFromName(companyId: unknown, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { company_id: companyId, name: trimmed, nameZh: "", nameEn: "" };

  if (looksChinese(trimmed)) {
    return industryBody(companyId, trimmed, await translateText(trimmed, "en"));
  }

  return industryBody(companyId, await translateText(trimmed, "zh"), trimmed);
}

async function jobBodyFromTitle(companyId: unknown, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { company_id: companyId, title: trimmed, titleZh: "", titleEn: "" };

  if (looksChinese(trimmed)) {
    const titleEn = await translateText(trimmed, "en");
    return { company_id: companyId, title: trimmed, titleZh: trimmed, titleEn };
  }

  const titleZh = await translateText(trimmed, "zh");
  return { company_id: companyId, title: trimmed, titleZh, titleEn: trimmed };
}

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function badgeColor(status: string) {
  if (["open", "publishing", "planned", "new", "scheduled", "pending"].includes(status)) return "blue";
  if (["done", "filled", "offered", "pass"].includes(status)) return "green";
  if (["paused", "invited", "interview_scheduled", "interviewed", "on_hold"].includes(status)) return "yellow";
  if (["closed", "ended", "cancelled", "rejected", "fail", "no_show"].includes(status)) return "red";
  return "gray";
}

function StatusBadge({ value, ns }: { value: string; ns: string }) {
  const { t } = useTranslation();
  return <Badge color={badgeColor(value)}>{t(`recruitment.${ns}.${value}`)}</Badge>;
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td colSpan={colSpan}>
        <Text ta="center" c="dimmed" py="lg">
          {t("recruitment.empty")}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
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

function useBaseOptions() {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const companiesQuery = useQuery({ queryKey: ["hr", "companies"], queryFn: listCompanies });
  const employeesQuery = useQuery({ queryKey: ["hr", "employees"], queryFn: listEmployees });
  const industriesQuery = useQuery({ queryKey: recruitmentKeys.industries(), queryFn: () => listRecruitmentIndustries({ active: "1" }) });
  const jobsQuery = useQuery({ queryKey: recruitmentKeys.jobs("all"), queryFn: () => listRecruitmentJobs() });
  const campaignsQuery = useQuery({ queryKey: recruitmentKeys.campaigns("all"), queryFn: () => listRecruitmentCampaigns() });

  return {
    companies: companiesQuery.data?.companies ?? [],
    employees: employeesQuery.data?.employees ?? [],
    industries: industriesQuery.data?.industries ?? [],
    jobs: jobsQuery.data?.jobs ?? [],
    campaigns: campaignsQuery.data?.campaigns ?? [],
    companyOptions: (companiesQuery.data?.companies ?? []).map((row) => ({ value: row.id, label: row.name })),
    employeeOptions: (employeesQuery.data?.employees ?? []).map((row) => ({ value: row.id, label: row.name })),
    industryOptions: (industriesQuery.data?.industries ?? []).map((row) => ({ value: row.id, label: pickLang(row.name_i18n, lang) || row.name })),
    jobOptions: (jobsQuery.data?.jobs ?? []).map((row) => ({ value: row.id, label: tField(row, "title", lang) })),
    campaignOptions: (campaignsQuery.data?.campaigns ?? []).map((row) => ({ value: row.id, label: row.name })),
    error: companiesQuery.error ?? employeesQuery.error ?? industriesQuery.error ?? jobsQuery.error ?? campaignsQuery.error
  };
}

function optionLabel(options: Option[], value?: string | null) {
  return options.find((option) => option.value === value)?.label ?? "-";
}

function matchesPlatform(material: RecruitmentMaterial, platform: string) {
  const platforms = material.platforms?.map((item) => item.trim().toLowerCase()).filter(Boolean) ?? [];
  return platforms.length === 0 || platforms.includes(platform.trim().toLowerCase());
}

function FieldModal({
  opened,
  title,
  children,
  onClose,
  onSubmit,
  saving
}: {
  opened: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  saving?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
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

function useSimpleForm(initial: Dict = {}) {
  const [values, setValues] = useState<Dict>(initial);
  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }));
  return { values, setValues, set };
}

function JobFormModal({
  opened,
  onClose,
  job
}: {
  opened: boolean;
  onClose: () => void;
  job?: RecruitmentJob | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm();
  const [titleError, setTitleError] = useState<string | undefined>();
  const [employmentTypeError, setEmploymentTypeError] = useState<string | undefined>();
  const mutation = useMutation({
    mutationFn: (body: Dict) => (job ? updateRecruitmentJob(job.id, body) : createRecruitmentJob(body)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
      onClose();
    }
  });

  useMemo(() => {
    if (opened) {
      const title = job ? editPair(job, "title") : { zh: "", en: "" };
      const jobContent = job ? editPair(job, "jobContent") : { zh: "", en: "" };
      const requirements = job ? editPair(job, "requirements") : { zh: "", en: "" };
      const salaryNote = job ? editPair(job, "salaryNote") : { zh: "", en: "" };
      form.setValues({
        company_id: job?.company_id ?? base.companyOptions[0]?.value ?? "",
        industry_id: job?.industry_id ?? "",
        titleZh: title.zh,
        titleEn: title.en,
        headcount: job?.headcount ?? 1,
        salary_min: job?.salary_min ?? undefined,
        salary_max: job?.salary_max ?? undefined,
        employment_types: job?.employment_types?.length ? job.employment_types : ["full_time"],
        pt_salary_min: job?.pt_salary_min ?? undefined,
        pt_salary_max: job?.pt_salary_max ?? undefined,
        salaryNoteZh: salaryNote.zh,
        salaryNoteEn: salaryNote.en,
        jobContentZh: jobContent.zh,
        jobContentEn: jobContent.en,
        requirementsZh: requirements.zh,
        requirementsEn: requirements.en,
        nationalities: job?.nationalities ?? [],
        status: job?.status ?? "open",
        priority: job?.priority ?? "normal",
        owner_id: job?.owner_id ?? null
      });
      setTitleError(undefined);
      setEmploymentTypeError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, job?.id, base.companyOptions.length]);

  const submit = () => {
    const title = firstText(form.values.titleZh, form.values.titleEn);
    if (!title) {
      setTitleError(t("bilingual.titleRequired"));
      return;
    }
    const employmentTypes = (form.values.employment_types as EmploymentType[] | undefined) ?? [];
    if (!employmentTypes.length) {
      setEmploymentTypeError(t("recruitment.fields.employmentType"));
      return;
    }

    setTitleError(undefined);
    setEmploymentTypeError(undefined);
    mutation.mutate({
      ...form.values,
      title,
      industry_id: emptyToNull(form.values.industry_id),
      job_content: nullableFirstText(form.values.jobContentZh, form.values.jobContentEn),
      requirements: nullableFirstText(form.values.requirementsZh, form.values.requirementsEn),
      salary_note: nullableFirstText(form.values.salaryNoteZh, form.values.salaryNoteEn),
      salary_min: emptyToNull(form.values.salary_min),
      salary_max: emptyToNull(form.values.salary_max),
      employment_types: employmentTypes,
      pt_salary_min: emptyToNull(form.values.pt_salary_min),
      pt_salary_max: emptyToNull(form.values.pt_salary_max),
      titleZh: firstText(form.values.titleZh),
      titleEn: firstText(form.values.titleEn),
      jobContentZh: firstText(form.values.jobContentZh),
      jobContentEn: firstText(form.values.jobContentEn),
      requirementsZh: firstText(form.values.requirementsZh),
      requirementsEn: firstText(form.values.requirementsEn),
      salaryNoteZh: firstText(form.values.salaryNoteZh),
      salaryNoteEn: firstText(form.values.salaryNoteEn),
      owner_id: emptyToNull(form.values.owner_id)
    });
  };

  return (
    <FieldModal
      opened={opened}
      onClose={onClose}
      title={job ? t("recruitment.jobs.edit") : t("recruitment.jobs.add")}
      saving={mutation.isPending}
      onSubmit={submit}
    >
      <ErrorAlert error={base.error ?? mutation.error} />
      <Group grow align="flex-start">
        <Select label={t("recruitment.fields.company")} data={base.companyOptions} value={String(form.values.company_id ?? "")} onChange={(v) => form.set("company_id", v)} disabled={Boolean(job)} />
        <CreatableCombobox
          label={t("recruitment.fields.industry")}
          options={base.industryOptions}
          value={String(form.values.industry_id ?? "")}
          onChange={(v) => form.set("industry_id", v)}
          createDisabled={!form.values.company_id}
          onCreate={async (name) => {
            const data = await createRecruitmentIndustry(await industryBodyFromName(form.values.company_id, name));
            await queryClient.invalidateQueries({ queryKey: recruitmentKeys.industries() });
            return data.industry.id;
          }}
        />
      </Group>
      <BilingualInput
        label={t("recruitment.fields.title")}
        valueZh={String(form.values.titleZh ?? "")}
        valueEn={String(form.values.titleEn ?? "")}
        onChangeZh={(value) => form.set("titleZh", value)}
        onChangeEn={(value) => form.set("titleEn", value)}
        required
        error={titleError}
      />
      <NumberInput label={t("recruitment.fields.headcount")} min={1} value={Number(form.values.headcount ?? 1)} onChange={(v) => form.set("headcount", v)} />
      <Checkbox.Group label={t("recruitment.fields.employmentType")} value={(form.values.employment_types as string[]) ?? []} onChange={(v) => form.set("employment_types", v)} error={employmentTypeError}>
        <Group mt="xs">
          <Checkbox value="full_time" label={t("recruitment.fields.fullTime")} />
          <Checkbox value="part_time" label={t("recruitment.fields.partTime")} />
        </Group>
      </Checkbox.Group>
      {((form.values.employment_types as string[] | undefined) ?? []).includes("full_time") ? (
        <Group grow align="flex-start">
          <NumberInput label={t("recruitment.fields.fullTimeSalaryMin")} min={0} value={(form.values.salary_min as number | undefined) ?? ""} onChange={(v) => form.set("salary_min", v)} />
          <NumberInput label={t("recruitment.fields.fullTimeSalaryMax")} min={0} value={(form.values.salary_max as number | undefined) ?? ""} onChange={(v) => form.set("salary_max", v)} />
        </Group>
      ) : null}
      {((form.values.employment_types as string[] | undefined) ?? []).includes("part_time") ? (
        <Group grow align="flex-start">
          <NumberInput label={t("recruitment.fields.partTimeSalaryMin")} min={0} decimalScale={2} step={0.5} value={(form.values.pt_salary_min as number | undefined) ?? ""} onChange={(v) => form.set("pt_salary_min", v)} />
          <NumberInput label={t("recruitment.fields.partTimeSalaryMax")} min={0} decimalScale={2} step={0.5} value={(form.values.pt_salary_max as number | undefined) ?? ""} onChange={(v) => form.set("pt_salary_max", v)} />
        </Group>
      ) : null}
      <BilingualInput
        label={t("recruitment.fields.salaryNote")}
        valueZh={String(form.values.salaryNoteZh ?? "")}
        valueEn={String(form.values.salaryNoteEn ?? "")}
        onChangeZh={(value) => form.set("salaryNoteZh", value)}
        onChangeEn={(value) => form.set("salaryNoteEn", value)}
      />
      <MultiSelect label={t("recruitment.fields.nationalities")} data={["SG", "PR", "Malaysia", "China"].map((v) => ({ value: v, label: v }))} value={(form.values.nationalities as string[]) ?? []} onChange={(v) => form.set("nationalities", v)} searchable />
      <Group grow align="flex-start">
        <Select label={t("recruitment.fields.status")} data={recruitmentJobStatuses.map((v) => ({ value: v, label: t(`recruitment.jobStatus.${v}`) }))} value={String(form.values.status ?? "open")} onChange={(v) => form.set("status", v)} />
        <Select label={t("recruitment.fields.priority")} data={recruitmentJobPriorities.map((v) => ({ value: v, label: t(`recruitment.jobPriority.${v}`) }))} value={String(form.values.priority ?? "normal")} onChange={(v) => form.set("priority", v)} />
      </Group>
      <Select label={t("recruitment.fields.owner")} data={base.employeeOptions} value={(form.values.owner_id as string | null) ?? null} onChange={(v) => form.set("owner_id", v)} clearable searchable />
      <BilingualInput
        label={t("recruitment.fields.jobContent")}
        valueZh={String(form.values.jobContentZh ?? "")}
        valueEn={String(form.values.jobContentEn ?? "")}
        onChangeZh={(value) => form.set("jobContentZh", value)}
        onChangeEn={(value) => form.set("jobContentEn", value)}
        multiline
      />
      <BilingualInput
        label={t("recruitment.fields.requirements")}
        valueZh={String(form.values.requirementsZh ?? "")}
        valueEn={String(form.values.requirementsEn ?? "")}
        onChangeZh={(value) => form.set("requirementsZh", value)}
        onChangeEn={(value) => form.set("requirementsEn", value)}
        multiline
      />
    </FieldModal>
  );
}

export function JobsPageImpl() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const navigate = useNavigate();
  const base = useBaseOptions();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RecruitmentJobStatus | null>(null);
  const [priority, setPriority] = useState<RecruitmentJobPriority | null>(null);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<RecruitmentJob | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  const queryParams = { status: status ?? undefined, priority: priority ?? undefined, industry_id: industryId ?? undefined, q: q || undefined };
  const query = useQuery({ queryKey: recruitmentKeys.jobs(queryParams), queryFn: () => listRecruitmentJobs(queryParams) });
  const rows = query.data?.jobs ?? [];

  return (
    <Stack gap="md">
      <ErrorAlert error={query.error ?? base.error} />
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput label={t("recruitment.filters.q")} w={200} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        <Select label={t("recruitment.fields.industry")} w={180} data={base.industryOptions} value={industryId} onChange={setIndustryId} clearable />
        <Select label={t("recruitment.fields.status")} w={150} data={recruitmentJobStatuses.map((v) => ({ value: v, label: t(`recruitment.jobStatus.${v}`) }))} value={status} onChange={(v) => setStatus(v as RecruitmentJobStatus | null)} clearable />
        <Select label={t("recruitment.fields.priority")} w={140} data={recruitmentJobPriorities.map((v) => ({ value: v, label: t(`recruitment.jobPriority.${v}`) }))} value={priority} onChange={(v) => setPriority(v as RecruitmentJobPriority | null)} clearable />
        <Button onClick={() => { setEditing(null); setModalOpened(true); }}>{t("recruitment.jobs.add")}</Button>
      </Group>
      <ScrollArea>
        <Table miw={1040} withTableBorder withColumnBorders highlightOnHover verticalSpacing="sm">
          <Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.title")}</Table.Th><Table.Th>{t("recruitment.fields.industry")}</Table.Th><Table.Th>{t("recruitment.fields.headcount")}</Table.Th><Table.Th>{t("recruitment.fields.salary")}</Table.Th><Table.Th>{t("recruitment.fields.status")}</Table.Th><Table.Th>{t("recruitment.fields.priority")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {query.isLoading ? <LoadingRow colSpan={7} /> : rows.length === 0 ? <EmptyRow colSpan={7} /> : slicePage(rows, page).map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td><Anchor onClick={() => navigate(`/recruitment/jobs/${row.id}`)}>{tField(row, "title", lang)}</Anchor></Table.Td>
                <Table.Td>{optionLabel(base.industryOptions, row.industry_id)}</Table.Td>
                <Table.Td>{row.headcount}</Table.Td>
                <Table.Td>{renderJobSalary(row, t, lang)}</Table.Td>
                <Table.Td><StatusBadge value={row.status} ns="jobStatus" /></Table.Td>
                <Table.Td><StatusBadge value={row.priority} ns="jobPriority" /></Table.Td>
                <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/recruitment/jobs/${row.id}`)}>{t("common.view")}</Button><Button size="xs" variant="subtle" onClick={() => { setEditing(row); setModalOpened(true); }}>{t("common.edit")}</Button></Group></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Pager total={rows.length} page={page} setPage={setPage} />
      <JobFormModal opened={modalOpened} onClose={() => setModalOpened(false)} job={editing} />
    </Stack>
  );
}

function PostingFormModal({ opened, onClose, posting, jobId }: { opened: boolean; onClose: () => void; posting?: RecruitmentPosting | null; jobId?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm();
  const selectedJobId = String(form.values.job_id ?? "");
  const selectedPlatform = String(form.values.platform ?? "");
  const platformsQuery = useQuery({ queryKey: recruitmentKeys.postings("platform-options"), queryFn: () => listRecruitmentPostings() });
  const materialsQuery = useQuery({ queryKey: recruitmentKeys.job(selectedJobId), queryFn: () => getRecruitmentJob(selectedJobId), enabled: Boolean(selectedJobId && selectedPlatform) });
  const [screenshotDocument, setScreenshotDocument] = useState(posting?.screenshot_document ?? null);
  const platformOptions = useMemo(
    () => Array.from(new Set((platformsQuery.data?.postings ?? []).map((row) => row.platform.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [platformsQuery.data?.postings]
  );
  const copyMaterialOptions = useMemo(
    () =>
      (materialsQuery.data?.materials ?? [])
        .filter((material) => material.active && material.type === "copy" && matchesPlatform(material, selectedPlatform))
        .map((material) => ({ value: material.id, label: material.title })),
    [materialsQuery.data?.materials, selectedPlatform]
  );
  const imageMaterialOptions = useMemo(
    () =>
      (materialsQuery.data?.materials ?? [])
        .filter((material) => material.active && material.type === "image" && matchesPlatform(material, selectedPlatform))
        .map((material) => ({ value: material.id, label: material.title })),
    [materialsQuery.data?.materials, selectedPlatform]
  );
  const mutation = useMutation({
    mutationFn: (body: Dict) => posting ? updateRecruitmentPosting(posting.id, body) : createRecruitmentPosting(body),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all }); onClose(); }
  });
  const screenshotMutation = useMutation({
    mutationFn: (file: File) => uploadRecruitmentPostingScreenshot(posting?.id ?? "", file),
    onSuccess: async (data) => {
      setScreenshotDocument(data.posting.screenshot_document ?? null);
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all });
    }
  });
  useMemo(() => {
    if (opened) {
      form.setValues({ company_id: posting?.company_id ?? base.companyOptions[0]?.value ?? "", job_id: posting?.job_id ?? jobId ?? "", platform: posting?.platform ?? "", published_on: posting?.published_on ?? toDateInput(new Date().toISOString()), status: posting?.status ?? "publishing", owner_id: posting?.owner_id ?? "", invite_clerk_id: posting?.invite_clerk_id ?? null, copy_material_id: posting?.copy_material_id ?? null, image_material_id: posting?.image_material_id ?? null, share_url: posting?.share_url ?? "", inquiry_count: posting?.inquiry_count ?? 0, notes: posting?.notes ?? "" });
      setScreenshotDocument(posting?.screenshot_document ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, posting?.id, base.companyOptions.length, jobId]);
  const submitPosting = () => {
    const body: Dict = {
      ...form.values,
      invite_clerk_id: emptyToNull(form.values.invite_clerk_id),
      copy_material_id: emptyToNull(form.values.copy_material_id),
      image_material_id: emptyToNull(form.values.image_material_id),
      share_url: emptyToNull(form.values.share_url),
      notes: emptyToNull(form.values.notes)
    };
    if (!posting) delete body.inquiry_count;
    mutation.mutate(body);
  };
  const materialDisabled = !selectedJobId || !selectedPlatform;
  const materialPlaceholder = materialDisabled ? "请先选岗位和平台" : undefined;
  return (
    <FieldModal opened={opened} onClose={onClose} title={posting ? t("recruitment.postings.edit") : t("recruitment.postings.add")} saving={mutation.isPending} onSubmit={submitPosting}>
      <ErrorAlert error={mutation.error ?? platformsQuery.error ?? materialsQuery.error ?? screenshotMutation.error} />
      <Group grow align="flex-start">
        <Select label={t("recruitment.fields.company")} data={base.companyOptions} value={String(form.values.company_id ?? "")} onChange={(v) => form.set("company_id", v)} disabled={Boolean(posting)} />
        <CreatableCombobox
          label={t("recruitment.fields.job")}
          options={base.jobOptions}
          value={String(form.values.job_id ?? "")}
          onChange={(v) => form.set("job_id", v)}
          createDisabled={!form.values.company_id}
          onCreate={async (name) => {
            if (!form.values.company_id) throw new Error("请先选择公司");
            const data = await createRecruitmentJob(await jobBodyFromTitle(form.values.company_id, name));
            await queryClient.invalidateQueries({ queryKey: recruitmentKeys.jobs("all") });
            return data.job.id;
          }}
        />
      </Group>
      <Group grow><Autocomplete label={t("recruitment.fields.platform")} data={platformOptions} value={String(form.values.platform ?? "")} onChange={(v) => form.set("platform", v)} /><TextInput type="date" label={t("recruitment.fields.publishedOn")} value={String(form.values.published_on ?? "")} onChange={(e) => form.set("published_on", e.currentTarget.value)} /></Group>
      <Group grow><Select label={t("recruitment.fields.status")} data={recruitmentPostingStatuses.map((v) => ({ value: v, label: t(`recruitment.postingStatus.${v}`) }))} value={String(form.values.status ?? "publishing")} onChange={(v) => form.set("status", v)} /><Select label={t("recruitment.fields.owner")} data={base.employeeOptions} value={String(form.values.owner_id ?? "")} onChange={(v) => form.set("owner_id", v)} searchable /><Select label={t("recruitment.fields.inviteClerk")} data={base.employeeOptions} value={(form.values.invite_clerk_id as string | null) ?? null} onChange={(v) => form.set("invite_clerk_id", v)} clearable searchable /></Group>
      <Group grow><Select label={t("recruitment.fields.copyMaterial")} data={copyMaterialOptions} value={(form.values.copy_material_id as string | null) ?? null} onChange={(v) => form.set("copy_material_id", v)} disabled={materialDisabled} placeholder={materialPlaceholder} clearable searchable /><Select label={t("recruitment.fields.imageMaterial")} data={imageMaterialOptions} value={(form.values.image_material_id as string | null) ?? null} onChange={(v) => form.set("image_material_id", v)} disabled={materialDisabled} placeholder={materialPlaceholder} clearable searchable /></Group>
      <TextInput label={t("recruitment.fields.shareUrl")} value={String(form.values.share_url ?? "")} onChange={(e) => form.set("share_url", e.currentTarget.value)} />
      {posting ? <NumberInput label={t("recruitment.fields.inquiryCount")} min={0} value={Number(form.values.inquiry_count ?? 0)} onChange={(v) => form.set("inquiry_count", v)} /> : null}
      {posting ? <Group><FileButton onChange={(file) => file && screenshotMutation.mutate(file)} accept="image/*">{(props) => <Button variant="light" loading={screenshotMutation.isPending} {...props}>{t("recruitment.fields.screenshot")}</Button>}</FileButton>{screenshotDocument ? <Anchor href={fileUrl(screenshotDocument.storage_path)} target="_blank" rel="noreferrer">{t("common.view")}</Anchor> : null}</Group> : null}
      <Textarea label={t("recruitment.fields.notes")} value={String(form.values.notes ?? "")} onChange={(e) => form.set("notes", e.currentTarget.value)} />
    </FieldModal>
  );
}

function MaterialModal({ opened, onClose, job, material }: { opened: boolean; onClose: () => void; job: RecruitmentJob; material?: RecruitmentMaterial | null }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const queryClient = useQueryClient();
  const form = useSimpleForm({ type: "copy", title: "", source_text: "", text_content: "", platforms: [], active: true, ai_generated: false });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const platformsQuery = useQuery({ queryKey: recruitmentKeys.postings("material-platform-options"), queryFn: () => listRecruitmentPostings() });
  const platformOptions = useMemo(
    () => Array.from(new Set((platformsQuery.data?.postings ?? []).map((row) => row.platform.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [platformsQuery.data?.postings]
  );
  const materialType = String(form.values.type ?? "copy");
  const isCopy = materialType === "copy";
  const existingImageUrl = material?.document?.storage_path ? fileUrl(material.document.storage_path) : null;
  const mutation = useMutation({
    mutationFn: async () => {
      const platforms = ((form.values.platforms as string[] | undefined) ?? []).map((item) => item.trim()).filter(Boolean);
      const body = {
        type: form.values.type,
        title: form.values.title,
        source_text: emptyToNull(form.values.source_text),
        text_content: emptyToNull(form.values.text_content),
        platforms: platforms.length > 0 ? platforms : null,
        active: Boolean(form.values.active),
        ai_generated: form.values.ai_generated
      };
      if (file) {
        const data = new FormData();
        if (!material) {
          data.set("company_id", job.company_id);
          data.set("job_id", job.id);
        }
        data.set("type", String(form.values.type));
        data.set("title", String(form.values.title));
        if (form.values.source_text) data.set("source_text", String(form.values.source_text));
        if (form.values.text_content) data.set("text_content", String(form.values.text_content));
        data.set("platforms", JSON.stringify(platforms));
        data.set("active", String(Boolean(form.values.active)));
        data.set("file", file);
        return material ? updateRecruitmentMaterial(material.id, data) : createRecruitmentMaterial(data);
      }
      return material ? updateRecruitmentMaterial(material.id, body) : createRecruitmentMaterial({ company_id: job.company_id, job_id: job.id, ...body });
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: recruitmentKeys.job(job.id) }); setFile(null); onClose(); }
  });
  const aiMutation = useMutation({
    mutationFn: () => generateRecruitmentCopy({ job_title: job.title, salary_min: job.salary_min, salary_max: job.salary_max, salary_note: job.salary_note, job_content: job.job_content, requirements: job.requirements, source_text: form.values.source_text, copy_type: "ad" }),
    onSuccess: (data) => form.set("text_content", data.draft)
  });
  useEffect(() => {
    if (!opened) return;
    setFile(null);
    form.setValues({
      type: material?.type ?? "copy",
      title: material?.title ?? "",
      source_text: material?.source_text ?? "",
      text_content: material?.text_content ?? "",
      platforms: material?.platforms ?? [],
      active: material?.active ?? true,
      ai_generated: material?.ai_generated ?? false
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, material?.id]);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Modal opened={opened} onClose={onClose} title={material ? t("recruitment.materials.editMaterial") : t("recruitment.materials.add")} size="xl" scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="md">
        <ErrorAlert error={mutation.error ?? aiMutation.error ?? platformsQuery.error} />
        <Text size="sm" c="dimmed">{tField(job, "title", lang)}</Text>
        <Group grow align="flex-start">
          <Select label={t("recruitment.fields.type")} data={recruitmentMaterialTypes.map((v) => ({ value: v, label: t(`recruitment.materialType.${v}`) }))} value={String(form.values.type ?? "copy")} onChange={(v) => form.set("type", v)} disabled={Boolean(material)} />
          <TextInput label={t("recruitment.materials.name")} value={String(form.values.title ?? "")} onChange={(e) => form.set("title", e.currentTarget.value)} />
        </Group>
        <TagsInput label={t("recruitment.fields.platforms")} data={platformOptions} value={(form.values.platforms as string[]) ?? []} onChange={(value) => form.set("platforms", value)} />
        <Checkbox label={t("recruitment.fields.active")} checked={Boolean(form.values.active)} onChange={(e) => form.set("active", e.currentTarget.checked)} />
        {isCopy ? (
          <>
            <Textarea label={t("recruitment.fields.sourceText")} minRows={6} value={String(form.values.source_text ?? "")} onChange={(e) => form.set("source_text", e.currentTarget.value)} />
            <Group justify="flex-start">
              <Button variant="light" onClick={() => aiMutation.mutate()} loading={aiMutation.isPending}>{t("recruitment.materials.aiCopy")}</Button>
            </Group>
            <Textarea label={t("recruitment.fields.generatedCopy")} minRows={8} value={String(form.values.text_content ?? "")} onChange={(e) => form.set("text_content", e.currentTarget.value)} />
            <Box p="md" style={{ border: "1px solid var(--app-line)", borderRadius: 8 }}>
              <Text fw={600} mb="xs">{t("recruitment.materials.preview")}</Text>
              <TypographyStylesProvider>
                <ReactMarkdown>{String(form.values.text_content ?? "")}</ReactMarkdown>
              </TypographyStylesProvider>
            </Box>
          </>
        ) : (
          <>
            <Group>
              <FileButton onChange={setFile} accept="image/*">
                {(props) => <Button variant="light" {...props}>{file ? file.name : material ? t("recruitment.materials.replaceImage") : t("common.upload")}</Button>}
              </FileButton>
            </Group>
            <Box>
              <Text fw={600} mb="xs">{t("recruitment.materials.imagePreview")}</Text>
              {previewUrl || existingImageUrl ? <Image src={previewUrl ?? existingImageUrl} mah={240} fit="contain" /> : <Text c="dimmed">-</Text>}
            </Box>
          </>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function JobDetailPageImpl() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [postingOpen, setPostingOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<RecruitmentMaterial | null>(null);
  const query = useQuery({ queryKey: recruitmentKeys.job(id ?? ""), queryFn: () => getRecruitmentJob(id ?? ""), enabled: Boolean(id) });
  const deleteMutation = useMutation({ mutationFn: deleteRecruitmentMaterial, onSuccess: async () => { if (id) await queryClient.invalidateQueries({ queryKey: recruitmentKeys.job(id) }); } });
  const materialStatusMutation = useMutation({ mutationFn: ({ materialId, active }: { materialId: string; active: boolean }) => updateRecruitmentMaterial(materialId, { active }), onSuccess: async () => { if (id) await queryClient.invalidateQueries({ queryKey: recruitmentKeys.job(id) }); } });
  const job = query.data?.job;
  if (query.isLoading) return <Group justify="center"><Loader /></Group>;
  if (!job) return <ErrorAlert error={query.error ?? new Error(t("common.not_available"))} />;
  return (
    <Stack gap="md">
      <Group justify="space-between"><Button variant="subtle" onClick={() => navigate("/recruitment/jobs")}>{t("common.back")}</Button><Button onClick={() => setPostingOpen(true)}>{t("recruitment.postings.add")}</Button></Group>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder><Text c="dimmed" size="sm">{t("recruitment.fields.headcount")}</Text><Text fw={700}>{job.headcount}</Text></Card>
        <Card withBorder><Text c="dimmed" size="sm">{t("recruitment.dashboard.offered")}</Text><Text fw={700}>{query.data?.summary.offered ?? 0}</Text></Card>
        <Card withBorder><Text c="dimmed" size="sm">{t("recruitment.dashboard.gap")}</Text><Text fw={700}>{query.data?.summary.gap ?? 0}</Text></Card>
      </SimpleGrid>
      <Card withBorder>
        <Group justify="space-between"><Text fw={600}>{tField(job, "title", lang)}</Text><StatusBadge value={job.status} ns="jobStatus" /></Group>
        <Text mt="sm">{tField(job, "jobContent", lang) || "-"}</Text>
        <Text c="dimmed" mt="xs">{tField(job, "requirements", lang) || "-"}</Text>
        {tField(job, "salaryNote", lang) ? <Text c="dimmed" mt="xs">{t("recruitment.fields.salaryNote")}: {tField(job, "salaryNote", lang)}</Text> : null}
      </Card>
      <Card withBorder>
        <Group justify="space-between" mb="md"><Text fw={600}>{t("recruitment.materials.title")}</Text><Button size="xs" onClick={() => { setEditingMaterial(null); setMaterialOpen(true); }}>{t("recruitment.materials.add")}</Button></Group>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.title")}</Table.Th><Table.Th>{t("recruitment.fields.type")}</Table.Th><Table.Th>{t("recruitment.fields.platforms")}</Table.Th><Table.Th>{t("recruitment.fields.active")}</Table.Th><Table.Th>{t("recruitment.fields.usageCount")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {(query.data?.materials ?? []).length === 0 ? <EmptyRow colSpan={6} /> : (query.data?.materials ?? []).map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td><Group gap="xs"><Text>{m.title}</Text>{m.type === "image" && m.document ? <Anchor size="sm" href={fileUrl(m.document.storage_path)} target="_blank" rel="noreferrer">{t("common.view")}</Anchor> : null}</Group></Table.Td>
                <Table.Td><StatusBadge value={m.type} ns="materialType" /></Table.Td>
                <Table.Td>{(m.platforms ?? []).length > 0 ? <Group gap={4}>{(m.platforms ?? []).map((platform) => <Badge key={platform} variant="light">{platform}</Badge>)}</Group> : <Text c="dimmed" size="sm">{t("recruitment.materials.allPlatforms")}</Text>}</Table.Td>
                <Table.Td><Group gap="xs"><Checkbox checked={m.active} onChange={(event) => materialStatusMutation.mutate({ materialId: m.id, active: event.currentTarget.checked })} /><Badge color={m.active ? "green" : "gray"}>{m.active ? t("recruitment.fields.active") : t("recruitment.fields.inactive")}</Badge></Group></Table.Td>
                <Table.Td>{m.usage_count}</Table.Td>
                <Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => { setEditingMaterial(m); setMaterialOpen(true); }}>{t("common.edit")}</Button><Button size="xs" variant="subtle" color="red" onClick={() => deleteMutation.mutate(m.id)}>{t("common.delete")}</Button></Group></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Card withBorder><Text fw={600} mb="md">{t("recruitment.postings.title")}</Text><Table withTableBorder withColumnBorders highlightOnHover><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.platform")}</Table.Th><Table.Th>{t("recruitment.fields.status")}</Table.Th><Table.Th>{t("recruitment.fields.inquiryCount")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(query.data?.postings ?? []).map((p) => <Table.Tr key={p.id}><Table.Td>{p.platform}</Table.Td><Table.Td><StatusBadge value={p.status} ns="postingStatus" /></Table.Td><Table.Td>{p.inquiry_count}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Card>
      <Card withBorder><Text fw={600} mb="md">{t("recruitment.campaigns.title")}</Text><Group>{(query.data?.campaigns ?? []).map((c) => <Badge key={c.id} color="blue">{c.name}</Badge>)}</Group></Card>
      <PostingFormModal opened={postingOpen} onClose={() => setPostingOpen(false)} jobId={job.id} />
      <MaterialModal opened={materialOpen} onClose={() => setMaterialOpen(false)} job={job} material={editingMaterial} />
    </Stack>
  );
}

export function PostingsPageImpl() {
  const { t } = useTranslation();
  const base = useBaseOptions();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RecruitmentPostingStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentPosting | null>(null);
  const query = useQuery({ queryKey: recruitmentKeys.postings(status), queryFn: () => listRecruitmentPostings({ status: status ?? undefined }) });
  const rows = query.data?.postings ?? [];
  return <Stack gap="md"><ErrorAlert error={query.error} /><Group align="flex-end"><Select label={t("recruitment.fields.status")} w={180} data={recruitmentPostingStatuses.map((v) => ({ value: v, label: t(`recruitment.postingStatus.${v}`) }))} value={status} onChange={(v) => setStatus(v as RecruitmentPostingStatus | null)} clearable /><Button onClick={() => { setEditing(null); setModalOpen(true); }}>{t("recruitment.postings.add")}</Button></Group><ScrollArea><Table miw={920} withTableBorder withColumnBorders highlightOnHover><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.platform")}</Table.Th><Table.Th>{t("recruitment.fields.job")}</Table.Th><Table.Th>{t("recruitment.fields.publishedOn")}</Table.Th><Table.Th>{t("recruitment.fields.status")}</Table.Th><Table.Th>{t("recruitment.fields.inquiryCount")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{query.isLoading ? <LoadingRow colSpan={6} /> : rows.length === 0 ? <EmptyRow colSpan={6} /> : slicePage(rows, page).map((row) => <Table.Tr key={row.id}><Table.Td>{row.platform}</Table.Td><Table.Td>{optionLabel(base.jobOptions, row.job_id)}</Table.Td><Table.Td>{row.published_on}</Table.Td><Table.Td><StatusBadge value={row.status} ns="postingStatus" /></Table.Td><Table.Td>{row.inquiry_count}</Table.Td><Table.Td><Button size="xs" variant="subtle" onClick={() => { setEditing(row); setModalOpen(true); }}>{t("common.edit")}</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea><Pager total={rows.length} page={page} setPage={setPage} /><PostingFormModal opened={modalOpen} onClose={() => setModalOpen(false)} posting={editing} /></Stack>;
}

function CampaignFormModal({ opened, onClose, campaign }: { opened: boolean; onClose: () => void; campaign?: RecruitmentCampaign | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const base = useBaseOptions();
  const form = useSimpleForm();
  const locationOptions = useMemo(
    () => Array.from(new Set(base.campaigns.map((row) => row.location.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [base.campaigns]
  );
  const mutation = useMutation({ mutationFn: (body: Dict) => campaign ? updateRecruitmentCampaign(campaign.id, body) : createRecruitmentCampaign(body), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all }); onClose(); } });
  useMemo(() => { if (opened) form.setValues({ company_id: campaign?.company_id ?? base.companyOptions[0]?.value ?? "", name: campaign?.name ?? "", type: campaign?.type ?? "roadshow", status: campaign?.status ?? "planned", location: campaign?.location ?? "", planned_date: campaign?.planned_date ?? toDateInput(new Date().toISOString()), planned_start: campaign?.planned_start ?? "09:00", planned_end: campaign?.planned_end ?? "18:00", actual_date: campaign?.actual_date ?? null, owner_id: campaign?.owner_id ?? "", notes: campaign?.notes ?? "", job_ids: [] }); }, [opened, campaign?.id, base.companyOptions.length]);
  return <FieldModal opened={opened} onClose={onClose} title={campaign ? t("recruitment.campaigns.edit") : t("recruitment.campaigns.add")} saving={mutation.isPending} onSubmit={() => mutation.mutate({ ...form.values, notes: emptyToNull(form.values.notes), actual_date: emptyToNull(form.values.actual_date) })}><ErrorAlert error={mutation.error} /><Group grow><Select label={t("recruitment.fields.company")} data={base.companyOptions} value={String(form.values.company_id ?? "")} onChange={(v) => form.set("company_id", v)} disabled={Boolean(campaign)} /><TextInput label={t("recruitment.fields.name")} value={String(form.values.name ?? "")} onChange={(e) => form.set("name", e.currentTarget.value)} /></Group><Group grow><Select label={t("recruitment.fields.type")} data={recruitmentCampaignTypes.map((v) => ({ value: v, label: t(`recruitment.campaignType.${v}`) }))} value={String(form.values.type ?? "roadshow")} onChange={(v) => form.set("type", v)} /><Select label={t("recruitment.fields.status")} data={recruitmentCampaignStatuses.map((v) => ({ value: v, label: t(`recruitment.campaignStatus.${v}`) }))} value={String(form.values.status ?? "planned")} onChange={(v) => form.set("status", v)} /></Group><Autocomplete label={t("recruitment.fields.location")} data={locationOptions} value={String(form.values.location ?? "")} onChange={(v) => form.set("location", v)} /><Group grow><TextInput type="date" label={t("recruitment.fields.plannedDate")} value={String(form.values.planned_date ?? "")} onChange={(e) => form.set("planned_date", e.currentTarget.value)} /><TextInput type="time" label={t("recruitment.fields.plannedStart")} value={String(form.values.planned_start ?? "")} onChange={(e) => form.set("planned_start", e.currentTarget.value)} /><TextInput type="time" label={t("recruitment.fields.plannedEnd")} value={String(form.values.planned_end ?? "")} onChange={(e) => form.set("planned_end", e.currentTarget.value)} /></Group><Select label={t("recruitment.fields.owner")} data={base.employeeOptions} value={String(form.values.owner_id ?? "")} onChange={(v) => form.set("owner_id", v)} searchable /><MultiSelect label={t("recruitment.fields.jobs")} data={base.jobOptions} value={(form.values.job_ids as string[]) ?? []} onChange={(v) => form.set("job_ids", v)} searchable /><Textarea label={t("recruitment.fields.notes")} value={String(form.values.notes ?? "")} onChange={(e) => form.set("notes", e.currentTarget.value)} /></FieldModal>;
}

export function CampaignsPageImpl() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RecruitmentCampaignStatus | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecruitmentCampaign | null>(null);
  const query = useQuery({ queryKey: recruitmentKeys.campaigns(status), queryFn: () => listRecruitmentCampaigns({ status: status ?? undefined }) });
  const rows = query.data?.campaigns ?? [];
  return <Stack gap="md"><ErrorAlert error={query.error} /><Group align="flex-end"><Select label={t("recruitment.fields.status")} w={180} data={recruitmentCampaignStatuses.map((v) => ({ value: v, label: t(`recruitment.campaignStatus.${v}`) }))} value={status} onChange={(v) => setStatus(v as RecruitmentCampaignStatus | null)} clearable /><Button onClick={() => { setEditing(null); setModalOpen(true); }}>{t("recruitment.campaigns.add")}</Button></Group><ScrollArea><Table miw={920} withTableBorder withColumnBorders highlightOnHover><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.name")}</Table.Th><Table.Th>{t("recruitment.fields.type")}</Table.Th><Table.Th>{t("recruitment.fields.location")}</Table.Th><Table.Th>{t("recruitment.fields.plannedDate")}</Table.Th><Table.Th>{t("recruitment.fields.status")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{query.isLoading ? <LoadingRow colSpan={6} /> : rows.length === 0 ? <EmptyRow colSpan={6} /> : slicePage(rows, page).map((row) => <Table.Tr key={row.id}><Table.Td><Anchor onClick={() => navigate(`/recruitment/campaigns/${row.id}`)}>{row.name}</Anchor></Table.Td><Table.Td><StatusBadge value={row.type} ns="campaignType" /></Table.Td><Table.Td>{row.location}</Table.Td><Table.Td>{row.planned_date} {row.planned_start}-{row.planned_end}</Table.Td><Table.Td><StatusBadge value={row.status} ns="campaignStatus" /></Table.Td><Table.Td><Group gap="xs"><Button size="xs" variant="subtle" onClick={() => navigate(`/recruitment/campaigns/${row.id}`)}>{t("common.view")}</Button><Button size="xs" variant="subtle" onClick={() => { setEditing(row); setModalOpen(true); }}>{t("common.edit")}</Button></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea><Pager total={rows.length} page={page} setPage={setPage} /><CampaignFormModal opened={modalOpen} onClose={() => setModalOpen(false)} campaign={editing} /></Stack>;
}

export function CampaignDetailPageImpl() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const { id } = useParams();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: recruitmentKeys.campaign(id ?? ""), queryFn: () => getRecruitmentCampaign(id ?? ""), enabled: Boolean(id) });
  const data = query.data;
  if (query.isLoading) return <Group justify="center"><Loader /></Group>;
  if (!data) return <ErrorAlert error={query.error} />;
  return <Stack gap="md"><Group justify="space-between"><Button variant="subtle" onClick={() => navigate("/recruitment/campaigns")}>{t("common.back")}</Button><Button onClick={() => navigate(`/recruitment/capture?campaignId=${data.campaign.id}`)}>{t("recruitment.capture.title")}</Button></Group><Card withBorder><Group justify="space-between"><Text fw={600}>{data.campaign.name}</Text><StatusBadge value={data.campaign.status} ns="campaignStatus" /></Group><Text mt="sm">{data.campaign.location}</Text><Text c="dimmed">{data.campaign.planned_date} {data.campaign.planned_start}-{data.campaign.planned_end}</Text></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.fields.jobs")}</Text><Group>{data.jobs.map((job) => <Badge key={job.id}>{tField(job, "title", lang)}</Badge>)}</Group></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.candidates.title")}</Text><CandidateTable rows={data.candidates} loading={false} /></Card></Stack>;
}

function CandidateTable({ rows, loading }: { rows: RecruitmentCandidate[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const base = useBaseOptions();
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: ({ id, body }: { id: string; body: Dict }) => updateRecruitmentCandidate(id, body), onSuccess: async () => queryClient.invalidateQueries({ queryKey: recruitmentKeys.all }) });
  return <ScrollArea><Table miw={1100} withTableBorder withColumnBorders highlightOnHover><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.name")}</Table.Th><Table.Th>{t("recruitment.fields.phone")}</Table.Th><Table.Th>{t("recruitment.fields.job")}</Table.Th><Table.Th>{t("recruitment.fields.sourceType")}</Table.Th><Table.Th>{t("recruitment.fields.status")}</Table.Th><Table.Th>{t("recruitment.fields.assignedClerk")}</Table.Th><Table.Th>{t("recruitment.fields.talentPool")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{loading ? <LoadingRow colSpan={8} /> : rows.length === 0 ? <EmptyRow colSpan={8} /> : rows.map((row) => <Table.Tr key={row.id}><Table.Td><Anchor onClick={() => navigate(`/recruitment/candidates/${row.id}`)}>{row.name}</Anchor></Table.Td><Table.Td>{row.phone}</Table.Td><Table.Td>{optionLabel(base.jobOptions, row.intended_job_id)}</Table.Td><Table.Td><StatusBadge value={row.source_type} ns="sourceType" /></Table.Td><Table.Td><Select size="xs" w={170} data={recruitmentCandidateStatuses.map((v) => ({ value: v, label: t(`recruitment.candidateStatus.${v}`) }))} value={row.status} onChange={(v) => v && mutation.mutate({ id: row.id, body: { status: v } })} /></Table.Td><Table.Td><Select size="xs" w={150} data={base.employeeOptions} value={row.assigned_clerk_id ?? null} onChange={(v) => mutation.mutate({ id: row.id, body: { assigned_clerk_id: v } })} clearable searchable /></Table.Td><Table.Td><Checkbox checked={row.in_talent_pool} onChange={(e) => mutation.mutate({ id: row.id, body: { in_talent_pool: e.currentTarget.checked } })} /></Table.Td><Table.Td><Button size="xs" variant="subtle" onClick={() => navigate(`/recruitment/candidates/${row.id}`)}>{t("common.view")}</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></ScrollArea>;
}

export function CandidatesPageImpl({ talentPool = false }: { talentPool?: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"all" | "overdue">(talentPool ? "all" : "all");
  const [status, setStatus] = useState<RecruitmentCandidateStatus | null>(null);
  const params = { status: status ?? undefined, overdue: tab === "overdue" ? "1" : undefined, in_talent_pool: talentPool ? "1" : undefined };
  const query = useQuery({ queryKey: recruitmentKeys.candidates(params), queryFn: () => listRecruitmentCandidates(params) });
  const rows = query.data?.candidates ?? [];
  return <Stack gap="md"><ErrorAlert error={query.error} />{!talentPool ? <Tabs value={tab} onChange={(v) => setTab((v as "all" | "overdue") ?? "all")}><Tabs.List><Tabs.Tab value="all">{t("recruitment.candidates.all")}</Tabs.Tab><Tabs.Tab value="overdue">{t("recruitment.candidates.overdue")}</Tabs.Tab></Tabs.List></Tabs> : null}<Group align="flex-end"><Select label={t("recruitment.fields.status")} w={190} data={recruitmentCandidateStatuses.map((v) => ({ value: v, label: t(`recruitment.candidateStatus.${v}`) }))} value={status} onChange={(v) => setStatus(v as RecruitmentCandidateStatus | null)} clearable /></Group><CandidateTable rows={rows} loading={query.isLoading} /></Stack>;
}

export function CandidateDetailPageImpl() {
  const { t } = useTranslation();
  const { id } = useParams();
  const base = useBaseOptions();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: recruitmentKeys.candidate(id ?? ""), queryFn: () => getRecruitmentCandidate(id ?? ""), enabled: Boolean(id) });
  const followForm = useSimpleForm({ type: "call", note: "", by_employee_id: "" });
  const interviewForm = useSimpleForm({ scheduled_at: "", mode: "", interviewer_id: null, status: "scheduled", result: "pending" });
  const followMutation = useMutation({ mutationFn: () => createRecruitmentFollowup(id ?? "", followForm.values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: recruitmentKeys.candidate(id ?? "") }); followForm.setValues({ type: "call", note: "", by_employee_id: "" }); } });
  const interviewMutation = useMutation({ mutationFn: () => createRecruitmentInterview({ ...interviewForm.values, company_id: query.data?.candidate.company_id, candidate_id: id, scheduled_at: new Date(String(interviewForm.values.scheduled_at)).toISOString() }), onSuccess: async () => queryClient.invalidateQueries({ queryKey: recruitmentKeys.candidate(id ?? "") }) });
  const candidate = query.data?.candidate;
  if (query.isLoading) return <Group justify="center"><Loader /></Group>;
  if (!candidate) return <ErrorAlert error={query.error} />;
  return <Stack gap="md"><Card withBorder><Group justify="space-between"><Text fw={600}>{candidate.name}</Text><StatusBadge value={candidate.status} ns="candidateStatus" /></Group><SimpleGrid cols={{ base: 1, md: 3 }} mt="md"><Text>{t("recruitment.fields.phone")}: {candidate.phone}</Text><Text>{t("recruitment.fields.job")}: {optionLabel(base.jobOptions, candidate.intended_job_id)}</Text><Text>{t("recruitment.fields.lastContactedAt")}: {fmt(candidate.last_contacted_at)}</Text></SimpleGrid></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.followups.add")}</Text><Group align="flex-end"><Select label={t("recruitment.fields.type")} data={recruitmentFollowupTypes.map((v) => ({ value: v, label: t(`recruitment.followupType.${v}`) }))} value={String(followForm.values.type ?? "call")} onChange={(v) => followForm.set("type", v)} /><Select label={t("recruitment.fields.byEmployee")} data={base.employeeOptions} value={String(followForm.values.by_employee_id ?? "")} onChange={(v) => followForm.set("by_employee_id", v)} searchable /><TextInput label={t("recruitment.fields.note")} value={String(followForm.values.note ?? "")} onChange={(e) => followForm.set("note", e.currentTarget.value)} /><Button onClick={() => followMutation.mutate()} loading={followMutation.isPending}>{t("common.save")}</Button></Group></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.interviews.add")}</Text><Group align="flex-end"><TextInput type="datetime-local" label={t("recruitment.fields.scheduledAt")} value={String(interviewForm.values.scheduled_at ?? "")} onChange={(e) => interviewForm.set("scheduled_at", e.currentTarget.value)} /><TextInput label={t("recruitment.fields.mode")} value={String(interviewForm.values.mode ?? "")} onChange={(e) => interviewForm.set("mode", e.currentTarget.value)} /><Select label={t("recruitment.fields.interviewer")} data={base.employeeOptions} value={(interviewForm.values.interviewer_id as string | null) ?? null} onChange={(v) => interviewForm.set("interviewer_id", v)} clearable /><Button onClick={() => interviewMutation.mutate()} loading={interviewMutation.isPending}>{t("common.save")}</Button></Group></Card><SimpleGrid cols={{ base: 1, md: 2 }}><Card withBorder><Text fw={600} mb="md">{t("recruitment.followups.title")}</Text><Stack>{(query.data?.followups ?? []).map((row) => <Box key={row.id} p="sm" style={{ borderBottom: "1px solid var(--app-line)" }}><Group justify="space-between"><StatusBadge value={row.type} ns="followupType" /><Text size="xs" c="dimmed">{fmt(row.contacted_at)}</Text></Group><Text mt="xs">{row.note}</Text></Box>)}</Stack></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.interviews.title")}</Text><Stack>{(query.data?.interviews ?? []).map((row) => <Box key={row.id} p="sm" style={{ borderBottom: "1px solid var(--app-line)" }}><Group justify="space-between"><StatusBadge value={row.status} ns="interviewStatus" /><StatusBadge value={row.result} ns="interviewResult" /></Group><Text mt="xs">{fmt(row.scheduled_at)} / {row.mode}</Text></Box>)}</Stack></Card></SimpleGrid></Stack>;
}

export function QuickCapturePageImpl() {
  const { t } = useTranslation();
  const base = useBaseOptions();
  const queryClient = useQueryClient();
  const form = useSimpleForm({ company_id: "", name: "", phone: "", nationality: "", source_campaign_id: "", intended_job_id: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const mutation = useMutation({ mutationFn: () => { const data = new FormData(); Object.entries({ ...form.values, source_type: "campaign", status: "new" }).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") data.set(k, String(v)); }); if (photo) data.set("photo", photo); return createRecruitmentCandidate(data); }, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: recruitmentKeys.all }); form.setValues({ company_id: base.companyOptions[0]?.value ?? "", name: "", phone: "", nationality: "", source_campaign_id: "", intended_job_id: "" }); setPhoto(null); } });
  useMemo(() => { if (!form.values.company_id && base.companyOptions[0]) form.set("company_id", base.companyOptions[0].value); }, [base.companyOptions.length]);
  return <Box maw={560}><Stack gap="md"><ErrorAlert error={mutation.error} /><Select label={t("recruitment.fields.company")} data={base.companyOptions} value={String(form.values.company_id ?? "")} onChange={(v) => form.set("company_id", v)} /><TextInput size="md" label={t("recruitment.fields.name")} value={String(form.values.name ?? "")} onChange={(e) => form.set("name", e.currentTarget.value)} /><TextInput size="md" label={t("recruitment.fields.phone")} value={String(form.values.phone ?? "")} onChange={(e) => form.set("phone", e.currentTarget.value)} /><TextInput size="md" label={t("recruitment.fields.nationality")} value={String(form.values.nationality ?? "")} onChange={(e) => form.set("nationality", e.currentTarget.value)} /><Select size="md" label={t("recruitment.fields.campaign")} data={base.campaignOptions} value={String(form.values.source_campaign_id ?? "")} onChange={(v) => form.set("source_campaign_id", v)} searchable /><Select size="md" label={t("recruitment.fields.job")} data={base.jobOptions} value={String(form.values.intended_job_id ?? "")} onChange={(v) => form.set("intended_job_id", v)} searchable /><FileButton onChange={setPhoto} accept="image/*">{(props) => <Button variant="light" {...props}>{photo ? photo.name : t("recruitment.capture.photo")}</Button>}</FileButton><Button size="md" onClick={() => mutation.mutate()} loading={mutation.isPending}>{t("recruitment.capture.submit")}</Button></Stack></Box>;
}

export function RecruitmentDashboardPageImpl() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const query = useQuery({ queryKey: recruitmentKeys.dashboard(), queryFn: getRecruitmentDashboard });
  const data = query.data?.dashboard;
  if (query.isLoading) return <Group justify="center"><Loader /></Group>;
  if (!data) return <ErrorAlert error={query.error} />;
  const maxPlatform = Math.max(1, ...data.platform_effectiveness.map((row) => row.leads));
  return <Stack gap="md"><SimpleGrid cols={{ base: 1, md: 3 }}><Card withBorder><Text c="dimmed" size="sm">{t("recruitment.dashboard.totalGap")}</Text><Text fw={700} size="xl">{data.gap_overview.total_gap}</Text></Card><Card withBorder><Text c="dimmed" size="sm">{t("recruitment.dashboard.urgent")}</Text><Text fw={700} size="xl">{data.urgent_jobs.length}</Text></Card><Card withBorder><Text c="dimmed" size="sm">{t("recruitment.dashboard.overdue")}</Text><Text fw={700} size="xl">{data.overdue.count}</Text></Card></SimpleGrid><SimpleGrid cols={{ base: 1, lg: 2 }}><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.gapOverview")}</Text><Stack>{data.gap_overview.jobs.map((row) => <Box key={row.job.id}><Group justify="space-between"><Text>{tField(row.job, "title", lang)}</Text><Text>{row.gap}</Text></Group><Progress value={Math.min(100, (row.offered / Math.max(1, row.headcount)) * 100)} /></Box>)}</Stack></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.urgentJobs")}</Text><Stack>{data.urgent_jobs.map((row) => <Group key={row.job.id} justify="space-between"><Text>{tField(row.job, "title", lang)}</Text><Badge color="red">{row.gap}</Badge></Group>)}</Stack></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.dailyLeads")}</Text><Table withTableBorder withColumnBorders><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.date")}</Table.Th><Table.Th>{t("recruitment.fields.job")}</Table.Th><Table.Th>{t("recruitment.dashboard.leads")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{data.daily_leads.slice(-10).map((row, index) => <Table.Tr key={`${row.day}-${index}`}><Table.Td>{row.day}</Table.Td><Table.Td>{row.job_id ?? "-"}</Table.Td><Table.Td>{row.count}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.campaignReports")}</Text><Table withTableBorder withColumnBorders><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.name")}</Table.Th><Table.Th>{t("recruitment.dashboard.leads")}</Table.Th><Table.Th>{t("recruitment.dashboard.interviews")}</Table.Th><Table.Th>{t("recruitment.dashboard.offers")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{data.campaign_reports.map((row) => <Table.Tr key={row.campaign.id}><Table.Td>{row.campaign.name}</Table.Td><Table.Td>{row.leads}</Table.Td><Table.Td>{row.interviews}</Table.Td><Table.Td>{row.offers}</Table.Td></Table.Tr>)}</Table.Tbody></Table></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.platformEffect")}</Text><Stack>{data.platform_effectiveness.map((row) => <Box key={row.posting_id}><Group justify="space-between"><Text>{row.platform}</Text><Text>{row.leads}/{row.interviews}/{row.offers}</Text></Group><Progress value={(row.leads / maxPlatform) * 100} /></Box>)}</Stack></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.dashboard.overdueList")}</Text><Stack>{data.overdue.candidates.map((row) => <Group key={row.id} justify="space-between"><Text>{row.name}</Text><StatusBadge value={row.status} ns="candidateStatus" /></Group>)}</Stack></Card></SimpleGrid></Stack>;
}

export function RecruitmentSettingsPageImpl() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const queryClient = useQueryClient();
  const base = useBaseOptions();
  const industriesQuery = useQuery({ queryKey: recruitmentKeys.industries(), queryFn: () => listRecruitmentIndustries() });
  const settingsQuery = useQuery({ queryKey: recruitmentKeys.settings(), queryFn: listRecruitmentSettings });
  const [nameZh, setNameZh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const createIndustry = useMutation({
    mutationFn: async () => createRecruitmentIndustry(await industryBody(companyId ?? base.companyOptions[0]?.value, nameZh, nameEn)),
    onSuccess: async () => {
      setNameZh("");
      setNameEn("");
      await queryClient.invalidateQueries({ queryKey: recruitmentKeys.industries() });
    }
  });
  const updateIndustry = useMutation({ mutationFn: ({ id, active }: { id: string; active: boolean }) => updateRecruitmentIndustry(id, { active }), onSuccess: async () => queryClient.invalidateQueries({ queryKey: recruitmentKeys.industries() }) });
  const updateSettings = useMutation({ mutationFn: ({ id, body }: { id: string; body: Dict }) => updateRecruitmentSettings(id, body), onSuccess: async () => queryClient.invalidateQueries({ queryKey: recruitmentKeys.settings() }) });
  return <Stack gap="md"><ErrorAlert error={industriesQuery.error ?? settingsQuery.error ?? createIndustry.error ?? updateIndustry.error ?? updateSettings.error} /><Card withBorder><Text fw={600} mb="md">{t("recruitment.settings.industries")}</Text><Stack gap="sm" mb="md"><Select label={t("recruitment.fields.company")} data={base.companyOptions} value={companyId ?? base.companyOptions[0]?.value ?? null} onChange={setCompanyId} /><BilingualInput label={t("recruitment.fields.name")} valueZh={nameZh} valueEn={nameEn} onChangeZh={setNameZh} onChangeEn={setNameEn} /><Group justify="flex-end"><Button onClick={() => createIndustry.mutate()} loading={createIndustry.isPending} disabled={!firstText(nameZh, nameEn)}>{t("recruitment.settings.addIndustry")}</Button></Group></Stack><Table withTableBorder withColumnBorders highlightOnHover><Table.Thead><Table.Tr><Table.Th>{t("recruitment.fields.name")}</Table.Th><Table.Th>{t("recruitment.fields.active")}</Table.Th><Table.Th>{t("common.actions")}</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(industriesQuery.data?.industries ?? []).map((row: RecruitmentIndustry) => <Table.Tr key={row.id}><Table.Td>{pickLang(row.name_i18n, lang) || row.name}</Table.Td><Table.Td>{row.active ? t("common.yes") : t("common.no")}</Table.Td><Table.Td><Button size="xs" variant="subtle" color={row.active ? "red" : "green"} onClick={() => updateIndustry.mutate({ id: row.id, active: !row.active })}>{row.active ? t("common.delete") : t("recruitment.settings.enable")}</Button></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card><Card withBorder><Text fw={600} mb="md">{t("recruitment.settings.thresholds")}</Text><Stack>{(settingsQuery.data?.settings ?? []).map((row) => <Group key={row.id} align="flex-end"><Text w={160}>{optionLabel(base.companyOptions, row.company_id)}</Text><NumberInput label={t("recruitment.settings.overdueInviteDays")} min={1} defaultValue={row.overdue_invite_days} onBlur={(e) => updateSettings.mutate({ id: row.id, body: { overdue_invite_days: Number(e.currentTarget.value) } })} /><NumberInput label={t("recruitment.settings.overdueFollowupDays")} min={1} defaultValue={row.overdue_followup_days} onBlur={(e) => updateSettings.mutate({ id: row.id, body: { overdue_followup_days: Number(e.currentTarget.value) } })} /></Group>)}</Stack></Card></Stack>;
}
