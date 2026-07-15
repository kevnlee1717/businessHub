import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Loader,
  Notification,
  NumberInput,
  Paper,
  Popover,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  createFoodCourt,
  deleteFoodCourt,
  fnbFoodCourtKeys,
  foodCourtDefaults,
  getFoodCourt,
  updateFoodCourt,
  type FoodCourt,
  type FoodCourtFixedFees,
  type FoodCourtInput
} from "../../api/fnbFoodCourts";
import { useAuth } from "../../auth/AuthContext";
import { calcAtRevenue, healthLevel, solveBreakEven, type FoodCourtCalcResult, type HealthLevel } from "./foodCourtCalc";

function money(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0
  }).format(value);
}

function pct(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

function healthColor(level: HealthLevel) {
  // <30% 绿(成本占比低)/ 30-35% 黄 / >35% 红
  if (level === "low") return "green";
  if (level === "good") return "yellow";
  return "red";
}

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

const TIER_DEFAULTS = [25000, 30000, 35000, 40000, 45000, 50000];

function padTiers(tiers: number[] | null | undefined): number[] {
  const next = Array.isArray(tiers) ? tiers.slice(0, 6) : [];
  for (let i = next.length; i < 6; i += 1) next.push(TIER_DEFAULTS[i] ?? 0);
  return next;
}

function normalizeCourt(court: FoodCourt): FoodCourtInput {
  return {
    name: court.name ?? "",
    stall: court.stall ?? null,
    brand: court.brand ?? null,
    notes: court.notes ?? null,
    rent_pct: court.rent_pct ?? 24.5,
    min_rent: court.min_rent ?? 0,
    adv_pct: court.adv_pct ?? 0.7,
    adv_mode: court.adv_mode ?? "pct",
    mdr_pct: court.mdr_pct ?? 1.5,
    mdr_mode: court.mdr_mode ?? "pct",
    fixed_fees: {
      cleaning: court.fixed_fees?.cleaning ?? 0,
      maintenance: court.fixed_fees?.maintenance ?? 0,
      pos: court.fixed_fees?.pos ?? 0,
      subscription: court.fixed_fees?.subscription ?? 0,
      bank: court.fixed_fees?.bank ?? 0,
      legal: court.fixed_fees?.legal ?? 0,
      other: court.fixed_fees?.other ?? 0
    },
    entrance_monthly: court.entrance_monthly ?? 0,
    mgmt_pct: court.mgmt_pct ?? 3,
    food_pct: court.food_pct ?? 35,
    gst_pct: court.gst_pct ?? 9,
    include_gst: court.include_gst ?? true,
    salary: court.salary ?? 8000,
    investor_floor: court.investor_floor ?? 2800,
    investor_share_pct: court.investor_share_pct ?? 51,
    couple_floor: court.couple_floor ?? 3000,
    couple_repay_cap: court.couple_repay_cap ?? 4167,
    profit_target: court.profit_target ?? 5600,
    excess_mgmt_pct: court.excess_mgmt_pct ?? 50,
    excess_couple_pct: court.excess_couple_pct ?? 25,
    tiers: padTiers(court.tiers)
  };
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" fw={600} c="dimmed">
      {children}
    </Text>
  );
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
  suffix
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <NumberInput
      label={label}
      value={value}
      min={0}
      {...(suffix ? { suffix } : {})}
      thousandSeparator=","
      disabled={disabled}
      onChange={(next) => {
        if (typeof next === "number") onChange(next);
        else onChange(Number(next) || 0);
      }}
    />
  );
}

function FeeModeField({
  label,
  value,
  mode,
  disabled,
  onValueChange,
  onModeChange
}: {
  label: string;
  value: number;
  mode: "pct" | "fixed";
  disabled: boolean;
  onValueChange: (value: number) => void;
  onModeChange: (mode: "pct" | "fixed") => void;
}) {
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm" fw={500} truncate>
          {label}
        </Text>
        <SegmentedControl
          size="xs"
          disabled={disabled}
          value={mode}
          onChange={(next) => onModeChange(next as "pct" | "fixed")}
          data={[
            { label: "%", value: "pct" },
            { label: "SGD", value: "fixed" }
          ]}
        />
      </Group>
      <NumberInput
        value={value}
        min={0}
        thousandSeparator=","
        disabled={disabled}
        {...(mode === "pct" ? { suffix: "%" } : { prefix: "$ " })}
        onChange={(next) => onValueChange(typeof next === "number" ? next : Number(next) || 0)}
      />
    </Stack>
  );
}

function ResultValue({ row, calc }: { row: ResultRow; calc: FoodCourtCalcResult }) {
  if (row.key === "healthPct") {
    const level = healthLevel(calc.healthPct);
    return <Badge color={healthColor(level)}>{pct(calc.healthPct)}</Badge>;
  }
  const value = calc[row.key];
  return (
    <Text fw={row.emphasis ? 600 : 400} {...(value < 0 ? { c: "red" } : {})}>
      {money(value)}
    </Text>
  );
}

type ResultRow = {
  key: keyof FoodCourtCalcResult;
  labelKey: string;
  detail?: boolean;
  emphasis?: boolean;
};

const resultRows: ResultRow[] = [
  { key: "rent", labelKey: "rent", detail: true },
  { key: "adv", labelKey: "adv", detail: true },
  { key: "mdr", labelKey: "mdr", detail: true },
  { key: "fixed", labelKey: "fixed", detail: true },
  { key: "gst", labelKey: "gst", detail: true },
  { key: "entrance", labelKey: "entrance", detail: true },
  { key: "F", labelKey: "totalF", emphasis: true },
  { key: "healthPct", labelKey: "healthPct", emphasis: true },
  { key: "food", labelKey: "food" },
  { key: "mgmt", labelKey: "mgmt" },
  { key: "remainder", labelKey: "remainder", emphasis: true },
  { key: "profit", labelKey: "profit" },
  { key: "investor", labelKey: "investor", emphasis: true },
  { key: "couple", labelKey: "couple", emphasis: true },
  { key: "excess", labelKey: "excess" },
  { key: "mgmtTotal", labelKey: "mgmtTotal", emphasis: true }
];

function InfoDot({ position, children }: { position?: "left" | "right" | "top" | "bottom"; children: ReactNode }) {
  return (
    <Popover width={250} position={position ?? "right"} withArrow shadow="md">
      <Popover.Target>
        <ActionIcon variant="outline" color="gray" size={16} radius="xl" aria-label="info">
          <Text fz={10} fw={700} lh={1}>
            i
          </Text>
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="xs">{children}</Popover.Dropdown>
    </Popover>
  );
}

function rowFormula(key: string, form: FoodCourtInput, t: (k: string) => string): string {
  const R = t("foodCourt.result.item");
  const r = (k: string) => t(`foodCourt.result.${k}`);
  const floor = t("foodCourt.breakdown.floor");
  const exInvestor = Math.max(100 - form.excess_mgmt_pct - form.excess_couple_pct, 0);
  switch (key) {
    case "rent":
      return `max(${form.rent_pct}% × ${R}, ${floor} ${money(form.min_rent)})`;
    case "adv":
      return form.adv_mode === "fixed" ? money(form.adv_pct) : `${form.adv_pct}% × ${R}`;
    case "mdr":
      return form.mdr_mode === "fixed" ? money(form.mdr_pct) : `${form.mdr_pct}% × ${R}`;
    case "fixed":
      return t("foodCourt.formula.fixed");
    case "gst":
      return form.include_gst ? `${form.gst_pct}% × (${r("rent")} + ${r("adv")} + ${r("mdr")} + ${r("fixed")})` : "—";
    case "entrance":
      return r("entrance");
    case "F":
      return `${r("rent")} + ${r("adv")} + ${r("mdr")} + ${r("fixed")} + ${r("gst")} + ${r("entrance")}`;
    case "healthPct":
      return `${r("totalF")} ÷ ${R}`;
    case "food":
      return `${form.food_pct}% × ${R}`;
    case "mgmt":
      return `${form.mgmt_pct}% × ${R}`;
    case "remainder":
      return `${R} − ${r("totalF")} − ${r("food")} − ${r("mgmt")}`;
    case "profit":
      return `${r("remainder")} − ${money(form.salary)}`;
    case "investor":
      return `max(${form.investor_share_pct}% × P(≤${money(form.profit_target)}) + ${exInvestor}% × ${r("excess")}, ${money(form.investor_floor)})`;
    case "couple": {
      const cplLow = Math.max(100 - form.investor_share_pct, 0);
      return `${t("foodCourt.breakdown.wage")} + ${cplLow}% × P(≤${money(form.profit_target)}) + ${form.excess_couple_pct}% × ${r("excess")}`;
    }
    case "excess":
      return `${r("profit")} − ${money(form.profit_target)}`;
    case "mgmtTotal":
      return `${r("mgmt")} + ${t("foodCourt.breakdown.coupleRepay")} + ${form.excess_mgmt_pct}% × ${r("excess")}`;
    default:
      return "";
  }
}

type BreakdownLine = { label: string; value: number; strong?: boolean };

function breakdownLines(key: string, calc: FoodCourtCalcResult, form: FoodCourtInput, t: (k: string) => string): BreakdownLine[] {
  if (key === "investor") {
    return [
      { label: t("foodCourt.breakdown.profitShare"), value: calc.investorShare - calc.investorExcess },
      { label: t("foodCourt.breakdown.excessShare"), value: calc.investorExcess },
      { label: t("foodCourt.breakdown.floorMakeup"), value: calc.investorTopup },
      { label: t("foodCourt.breakdown.total"), value: calc.investor, strong: true }
    ];
  }
  if (key === "couple") {
    return [
      { label: t("foodCourt.breakdown.gross"), value: calc.coupleGross },
      { label: calc.coupleAdjust >= 0 ? t("foodCourt.breakdown.repay") : t("foodCourt.breakdown.topup"), value: -calc.coupleAdjust },
      { label: t("foodCourt.breakdown.profitShare"), value: calc.coupleShare - calc.coupleExcess },
      { label: t("foodCourt.breakdown.excessShare"), value: calc.coupleExcess },
      { label: t("foodCourt.breakdown.total"), value: calc.couple, strong: true }
    ];
  }
  return [
    { label: t("foodCourt.breakdown.mgmtFee"), value: calc.mgmt },
    { label: t("foodCourt.breakdown.coupleRepay"), value: calc.coupleAdjust },
    { label: `${t("foodCourt.breakdown.excessShare")} ${form.excess_mgmt_pct}%`, value: calc.mgmtShare },
    { label: t("foodCourt.breakdown.total"), value: calc.mgmtTotal, strong: true }
  ];
}

function ValueWithBreakdown({ row, calc, form }: { row: ResultRow; calc: FoodCourtCalcResult; form: FoodCourtInput }) {
  const { t } = useTranslation();
  const value = calc[row.key];
  const lines = breakdownLines(row.key, calc, form, t);
  return (
    <Group gap={4} wrap="nowrap" justify="space-between">
      <Text fw={600} {...(value < 0 ? { c: "red" } : {})}>
        {money(value)}
      </Text>
      <InfoDot position="left">
        <Stack gap={2}>
          {lines.map((line, index) => (
            <Group key={index} justify="space-between" gap="md" wrap="nowrap">
              <Text size="xs" fw={line.strong ? 600 : 400} {...(line.strong ? {} : { c: "dimmed" as const })}>
                {line.label}
              </Text>
              <Text size="xs" fw={line.strong ? 600 : 400} {...(line.value < 0 ? { c: "red" } : {})}>
                {money(line.value)}
              </Text>
            </Group>
          ))}
        </Stack>
      </InfoDot>
    </Group>
  );
}

const BREAKDOWN_KEYS = new Set(["investor", "couple", "mgmtTotal"]);
const MGMT_YELLOW_MIN = 3000; // 管理公司合计 ≥ 此值(且未达标)→ 黄,否则红

// 列背景色:P≥超额线 绿 / 管理公司合计≥3000 黄 / 否则红
function columnBg(calc: FoodCourtCalcResult, form: FoodCourtInput): string | undefined {
  if (calc.profit >= form.profit_target) return "var(--mantine-color-green-0)";
  if (calc.mgmtTotal >= MGMT_YELLOW_MIN) return "var(--mantine-color-yellow-0)";
  return "var(--mantine-color-red-0)";
}

function ResultsPanel({
  form,
  fullscreen,
  onToggleFullscreen,
  year,
  onYearChange
}: {
  form: FoodCourtInput;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  year: number;
  onYearChange: (year: number) => void;
}) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const opts = { noRepay: year === 2 };
  const defaults = [25000, 30000, 35000, 40000, 45000, 50000];
  const tiers = form.tiers.length >= 6 ? form.tiers.slice(0, 6) : defaults;
  const breakEven = solveBreakEven(form);
  const results: { tier: number; calc: FoodCourtCalcResult; target: boolean }[] = tiers.map((tier) => ({
    tier,
    calc: calcAtRevenue(form, tier, opts),
    target: false
  }));
  if (breakEven !== null) {
    results.push({ tier: breakEven, calc: calcAtRevenue(form, breakEven, opts), target: true });
  }
  results.sort((a, b) => a.tier - b.tier); // 达标列按营业额插到正确位置
  const rows = showDetails ? resultRows : resultRows.filter((row) => !row.detail);

  return (
    <Stack gap="sm">
      <Card withBorder shadow="xs" p="sm">
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
            <Text size="lg" fw={600}>
              {breakEven === null
                ? t("foodCourt.breakEvenImpossible")
                : t("foodCourt.breakEvenText", { target: money(form.profit_target), revenue: money(breakEven) })}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={String(year)}
                onChange={(next) => onYearChange(Number(next))}
                data={[
                  { label: t("foodCourt.year1"), value: "1" },
                  { label: t("foodCourt.year2"), value: "2" }
                ]}
              />
              <Button size="xs" variant="light" onClick={() => setShowDetails((value) => !value)}>
                {showDetails ? t("foodCourt.hideDetails") : t("foodCourt.showDetails")}
              </Button>
              <Button size="xs" variant="light" onClick={onToggleFullscreen}>
                {fullscreen ? t("foodCourt.exitFullscreen") : t("foodCourt.fullscreen")}
              </Button>
            </Group>
          </Group>
          <Group gap="xs" wrap="wrap">
            {results.map(({ tier, calc, target }) => {
              const level = healthLevel(calc.healthPct);
              return (
                <Badge key={tier} color={healthColor(level)} variant={target ? "filled" : "light"}>
                  {money(tier)} {t(`foodCourt.health.${level}`)} {pct(calc.healthPct)}
                </Badge>
              );
            })}
            {results.some(({ calc }) => calc.mgmtTotal < 0) ? <Badge color="red">{t("foodCourt.mgmtSubsidy")}</Badge> : null}
          </Group>
        </Stack>
      </Card>

      <Card withBorder shadow="xs" p="sm">
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders highlightOnHover verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>
                  <Text fw={700} fz="sm">
                    {t("foodCourt.result.item")}
                  </Text>
                </Table.Th>
                {results.map(({ tier, calc, target }, index) => (
                  <Table.Th key={index} style={{ backgroundColor: columnBg(calc, form) }}>
                    <Text fw={700} fz="sm">
                      {money(tier)}
                    </Text>
                    {target ? (
                      <Text size="xs" c="green.7" fw={600}>
                        {t("foodCourt.targetCol")}
                      </Text>
                    ) : null}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Text fw={row.emphasis ? 600 : 400}>{t(`foodCourt.result.${row.labelKey}`)}</Text>
                      <InfoDot position="right">
                        <Text size="xs">{rowFormula(row.key, form, t)}</Text>
                      </InfoDot>
                    </Group>
                  </Table.Td>
                  {results.map(({ calc }, index) => (
                    <Table.Td key={index} style={{ backgroundColor: columnBg(calc, form) }}>
                      {BREAKDOWN_KEYS.has(row.key) ? <ValueWithBreakdown row={row} calc={calc} form={form} /> : <ResultValue row={row} calc={calc} />}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Card>
    </Stack>
  );
}

export function FoodCourtDetailPage() {
  const { t } = useTranslation();
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can("franchise.manage");
  const [form, setForm] = useState<FoodCourtInput>(foodCourtDefaults());
  const [toast, setToast] = useState<{ color: "green" | "red"; message: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [year, setYear] = useState(1);

  const detailQuery = useQuery({
    queryKey: fnbFoodCourtKeys.detail(id),
    queryFn: () => getFoodCourt(id),
    enabled: !isNew
  });

  useEffect(() => {
    if (detailQuery.data?.food_court) {
      setForm(normalizeCourt(detailQuery.data.food_court));
    }
  }, [detailQuery.data?.food_court]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const createMutation = useMutation({
    mutationFn: createFoodCourt,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: fnbFoodCourtKeys.all });
      setToast({ color: "green", message: t("foodCourt.saved") });
      navigate(`/franchise/fnb/${data.food_court.id}`, { replace: true });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });

  const updateMutation = useMutation({
    mutationFn: (body: FoodCourtInput) => updateFoodCourt(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fnbFoodCourtKeys.all });
      await queryClient.invalidateQueries({ queryKey: fnbFoodCourtKeys.detail(id) });
      setToast({ color: "green", message: t("foodCourt.saved") });
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFoodCourt,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: fnbFoodCourtKeys.all });
      navigate("/franchise/fnb");
    },
    onError: (error) => setToast({ color: "red", message: error instanceof Error ? error.message : t("common.unknown_error") })
  });

  function setField<K extends keyof FoodCourtInput>(key: K, value: FoodCourtInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setFixedFee(key: keyof FoodCourtFixedFees, value: number) {
    setForm((current) => ({ ...current, fixed_fees: { ...current.fixed_fees, [key]: value } }));
  }

  function setTier(index: number, value: number) {
    setForm((current) => {
      const tiers = [...current.tiers];
      tiers[index] = value;
      return { ...current, tiers };
    });
  }

  function save() {
    if (!canManage) return;
    if (!form.name.trim()) {
      setToast({ color: "red", message: t("foodCourt.validation.nameRequired") });
      return;
    }
    const body: FoodCourtInput = {
      ...form,
      name: form.name.trim(),
      stall: form.stall?.trim() || null,
      brand: form.brand?.trim() || null,
      notes: form.notes?.trim() || null,
      tiers: form.tiers.slice(0, 3)
    };
    if (isNew) createMutation.mutate(body);
    else updateMutation.mutate(body);
  }

  function remove() {
    if (!canManage || isNew) return;
    if (!window.confirm(t("foodCourt.confirmDelete", { name: form.name }))) return;
    deleteMutation.mutate(id);
  }

  const disabled = !canManage;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Box mt={-16}>
      <Paper
        px="sm"
        py={6}
        mb="sm"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10
        }}
      >
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Group gap="sm">
            <Button variant="subtle" size="xs" onClick={() => navigate("/franchise/fnb")}>
              {t("common.back")}
            </Button>
            <Text size="md" fw={500}>
              {isNew ? t("foodCourt.new") : form.name || t("foodCourt.detail")}
            </Text>
          </Group>
          <Group gap="xs">
            {canManage ? (
              <>
                {!isNew ? (
                  <Button color="red" variant="light" size="xs" loading={deleteMutation.isPending} onClick={remove}>
                    {t("common.delete")}
                  </Button>
                ) : null}
                <Button size="xs" loading={saving} onClick={save}>
                  {t("common.save")}
                </Button>
              </>
            ) : null}
          </Group>
        </Group>
      </Paper>

      {detailQuery.isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Grid gutter="sm">
          {!fullscreen ? (
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="sm">
              <ErrorAlert error={detailQuery.error} />
              <Tabs defaultValue="identityRent" variant="outline" keepMounted={false}>
                <Tabs.List mb="sm">
                  <Tabs.Tab value="identityRent">{t("foodCourt.tabs.identityRent")}</Tabs.Tab>
                  <Tabs.Tab value="fees">{t("foodCourt.tabs.fees")}</Tabs.Tab>
                  <Tabs.Tab value="paramsTiers">{t("foodCourt.tabs.paramsTiers")}</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="identityRent">
                  <Card withBorder shadow="xs" p="sm">
                    <Stack gap="xs">
                      <GroupLabel>{t("foodCourt.sections.identity")}</GroupLabel>
                      <TextInput label={t("foodCourt.fields.name")} value={form.name} disabled={disabled} onChange={(e) => setField("name", e.currentTarget.value)} />
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <TextInput label={t("foodCourt.fields.stall")} value={form.stall ?? ""} disabled={disabled} onChange={(e) => setField("stall", e.currentTarget.value || null)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <TextInput label={t("foodCourt.fields.brand")} value={form.brand ?? ""} disabled={disabled} onChange={(e) => setField("brand", e.currentTarget.value || null)} />
                        </Grid.Col>
                      </Grid>
                      <Textarea label={t("foodCourt.fields.notes")} value={form.notes ?? ""} disabled={disabled} onChange={(e) => setField("notes", e.currentTarget.value || null)} minRows={2} />
                      <Divider my={4} />
                      <GroupLabel>{t("foodCourt.sections.rent")}</GroupLabel>
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.rentPct")} value={form.rent_pct} disabled={disabled} suffix="%" onChange={(v) => setField("rent_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.minRent")} value={form.min_rent} disabled={disabled} onChange={(v) => setField("min_rent", v)} />
                        </Grid.Col>
                      </Grid>
                    </Stack>
                  </Card>
                </Tabs.Panel>

                <Tabs.Panel value="fees">
                  <Card withBorder shadow="xs" p="sm">
                    <Stack gap="xs">
                      <GroupLabel>{t("foodCourt.sections.revenueFees")}</GroupLabel>
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <FeeModeField
                            label={t("foodCourt.fields.advPct")}
                            value={form.adv_pct}
                            mode={form.adv_mode}
                            disabled={disabled}
                            onValueChange={(v) => setField("adv_pct", v)}
                            onModeChange={(m) => setField("adv_mode", m)}
                          />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <FeeModeField
                            label={t("foodCourt.fields.mdrPct")}
                            value={form.mdr_pct}
                            mode={form.mdr_mode}
                            disabled={disabled}
                            onValueChange={(v) => setField("mdr_pct", v)}
                            onModeChange={(m) => setField("mdr_mode", m)}
                          />
                        </Grid.Col>
                      </Grid>
                      <Divider my={4} />
                      <GroupLabel>{t("foodCourt.sections.fixedFees")}</GroupLabel>
                      <Grid gutter="xs">
                        {(["cleaning", "maintenance", "pos", "subscription", "bank", "legal", "other"] as const).map((key) => (
                          <Grid.Col span={6} key={key}>
                            <NumberField label={t(`foodCourt.fixedFees.${key}`)} value={form.fixed_fees[key]} disabled={disabled} onChange={(v) => setFixedFee(key, v)} />
                          </Grid.Col>
                        ))}
                      </Grid>
                      <Divider my={4} />
                      <GroupLabel>{t("foodCourt.sections.entrance")}</GroupLabel>
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.entranceMonthly")} value={form.entrance_monthly} disabled={disabled} onChange={(v) => setField("entrance_monthly", v)} />
                        </Grid.Col>
                      </Grid>
                    </Stack>
                  </Card>
                </Tabs.Panel>

                <Tabs.Panel value="paramsTiers">
                  <Card withBorder shadow="xs" p="sm">
                    <Stack gap="xs">
                      <GroupLabel>{t("foodCourt.sections.params")}</GroupLabel>
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.foodPct")} value={form.food_pct} disabled={disabled} suffix="%" onChange={(v) => setField("food_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.mgmtPct")} value={form.mgmt_pct} disabled={disabled} suffix="%" onChange={(v) => setField("mgmt_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.gstPct")} value={form.gst_pct} disabled={disabled} suffix="%" onChange={(v) => setField("gst_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Switch mt="lg" checked={form.include_gst} disabled={disabled} label={t("foodCourt.fields.includeGst")} onChange={(e) => setField("include_gst", e.currentTarget.checked)} />
                        </Grid.Col>
                      </Grid>
                      <Divider my={4} />
                      <GroupLabel>{t("foodCourt.sections.payout")}</GroupLabel>
                      <Grid gutter="xs">
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.salary")} value={form.salary} disabled={disabled} onChange={(v) => setField("salary", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.investorFloor")} value={form.investor_floor} disabled={disabled} onChange={(v) => setField("investor_floor", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.investorSharePct")} value={form.investor_share_pct} disabled={disabled} suffix="%" onChange={(v) => setField("investor_share_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.coupleFloor")} value={form.couple_floor} disabled={disabled} onChange={(v) => setField("couple_floor", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.coupleRepayCap")} value={form.couple_repay_cap} disabled={disabled} onChange={(v) => setField("couple_repay_cap", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.profitTarget")} value={form.profit_target} disabled={disabled} onChange={(v) => setField("profit_target", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.excessMgmtPct")} value={form.excess_mgmt_pct} disabled={disabled} suffix="%" onChange={(v) => setField("excess_mgmt_pct", v)} />
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <NumberField label={t("foodCourt.fields.excessCouplePct")} value={form.excess_couple_pct} disabled={disabled} suffix="%" onChange={(v) => setField("excess_couple_pct", v)} />
                        </Grid.Col>
                      </Grid>
                      <Divider my={4} />
                      <GroupLabel>{t("foodCourt.sections.tiers")}</GroupLabel>
                      <Grid gutter="xs">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <Grid.Col span={4} key={index}>
                            <NumberField label={t("foodCourt.fields.tier", { index: index + 1 })} value={form.tiers[index] ?? 0} disabled={disabled} onChange={(v) => setTier(index, v)} />
                          </Grid.Col>
                        ))}
                      </Grid>
                    </Stack>
                  </Card>
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </Grid.Col>
          ) : null}

          <Grid.Col span={fullscreen ? 12 : { base: 12, lg: 7 }}>
            <ResultsPanel
              form={form}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((value) => !value)}
              year={year}
              onYearChange={setYear}
            />
          </Grid.Col>
        </Grid>
      )}

      {toast ? (
        <Box pos="fixed" top={16} right={16} w={320} style={{ zIndex: 4000 }}>
          <Notification color={toast.color} onClose={() => setToast(null)} withBorder>
            {toast.message}
          </Notification>
        </Box>
      ) : null}
    </Box>
  );
}
