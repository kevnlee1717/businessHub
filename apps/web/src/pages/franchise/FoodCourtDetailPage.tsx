import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Notification,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Table,
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
  if (level === "good") return "green";
  if (level === "low") return "yellow";
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

function normalizeCourt(court: FoodCourt): FoodCourtInput {
  return {
    name: court.name ?? "",
    stall: court.stall ?? null,
    brand: court.brand ?? null,
    notes: court.notes ?? null,
    rent_pct: court.rent_pct ?? 24.5,
    min_rent: court.min_rent ?? 0,
    adv_pct: court.adv_pct ?? 0.7,
    mdr_pct: court.mdr_pct ?? 1.5,
    fixed_fees: {
      cleaning: court.fixed_fees?.cleaning ?? 0,
      maintenance: court.fixed_fees?.maintenance ?? 0,
      pos: court.fixed_fees?.pos ?? 0,
      subscription: court.fixed_fees?.subscription ?? 0,
      bank: court.fixed_fees?.bank ?? 0,
      legal: court.fixed_fees?.legal ?? 0,
      other: court.fixed_fees?.other ?? 0
    },
    entrance_total: court.entrance_total ?? 0,
    entrance_months: court.entrance_months ?? 0,
    food_pct: court.food_pct ?? 35,
    gst_pct: court.gst_pct ?? 9,
    include_gst: court.include_gst ?? true,
    salary: court.salary ?? 8000,
    investor_floor: court.investor_floor ?? 2800,
    profit_target: court.profit_target ?? 5600,
    tiers: court.tiers?.length ? court.tiers : [25000, 30000, 35000]
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card withBorder shadow="xs">
      <Stack gap="sm">
        <Text fw={600}>{title}</Text>
        {children}
      </Stack>
    </Card>
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

function ResultValue({ row, calc, form }: { row: ResultRow; calc: FoodCourtCalcResult; form: FoodCourtInput }) {
  const { t } = useTranslation();
  if (row.key === "healthPct") {
    const level = healthLevel(calc.healthPct);
    return <Badge color={healthColor(level)}>{pct(calc.healthPct)}</Badge>;
  }
  if (row.key === "couple") {
    return (
      <Text {...(calc.couple < form.salary ? { c: "red" } : {})} fw={600}>
        {money(calc.couple)}
      </Text>
    );
  }
  if (row.key === "F" || row.key === "profit" || row.key === "investor") {
    return <Text fw={600}>{money(calc[row.key])}</Text>;
  }
  if (row.key === "feeSub") {
    return <Text>{money(calc.feeSub)}</Text>;
  }
  return <Text>{money(calc[row.key])}</Text>;
}

type ResultRow = {
  key: keyof FoodCourtCalcResult;
  labelKey: string;
};

const resultRows: ResultRow[] = [
  { key: "rent", labelKey: "rent" },
  { key: "adv", labelKey: "adv" },
  { key: "mdr", labelKey: "mdr" },
  { key: "fixed", labelKey: "fixed" },
  { key: "gst", labelKey: "gst" },
  { key: "entrance", labelKey: "entrance" },
  { key: "F", labelKey: "totalF" },
  { key: "healthPct", labelKey: "healthPct" },
  { key: "food", labelKey: "food" },
  { key: "remainder", labelKey: "remainder" },
  { key: "profit", labelKey: "profit" },
  { key: "couple", labelKey: "couple" },
  { key: "investor", labelKey: "investor" }
];

function ResultsPanel({ form }: { form: FoodCourtInput }) {
  const { t } = useTranslation();
  const tiers = form.tiers.length >= 3 ? form.tiers.slice(0, 3) : [25000, 30000, 35000];
  const results = tiers.map((tier) => ({ tier, calc: calcAtRevenue(form, tier) }));
  const breakEven = solveBreakEven(form);

  return (
    <Stack gap="md">
      <Card withBorder shadow="xs">
        <Stack gap="sm">
          <Text size="lg" fw={600}>
            {breakEven === null
              ? t("foodCourt.breakEvenImpossible")
              : t("foodCourt.breakEvenText", { target: money(form.profit_target), revenue: money(breakEven) })}
          </Text>
          <Group gap="xs" wrap="wrap">
            {results.map(({ tier, calc }) => {
              const level = healthLevel(calc.healthPct);
              return (
                <Badge key={tier} color={healthColor(level)}>
                  {money(tier)} {t(`foodCourt.health.${level}`)} {pct(calc.healthPct)}
                </Badge>
              );
            })}
            {results.some(({ calc }) => calc.couple < form.salary) ? <Badge color="red">{t("foodCourt.coupleDeducted")}</Badge> : null}
          </Group>
        </Stack>
      </Card>

      <Card withBorder shadow="xs">
        <Box style={{ overflowX: "auto" }}>
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("foodCourt.result.item")}</Table.Th>
                {results.map(({ tier }) => (
                  <Table.Th key={tier}>{money(tier)}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {resultRows.map((row) => (
                <Table.Tr key={row.key}>
                  <Table.Td>
                    <Text fw={["F", "healthPct", "profit", "couple", "investor"].includes(row.key) ? 600 : 400}>
                      {t(`foodCourt.result.${row.labelKey}`)}
                    </Text>
                  </Table.Td>
                  {results.map(({ tier, calc }) => (
                    <Table.Td key={`${row.key}-${tier}`}>
                      <ResultValue row={row} calc={calc} form={form} />
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
    <Box p="md">
      <Paper
        p="sm"
        mb="md"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10
        }}
      >
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Button variant="subtle" onClick={() => navigate("/franchise/fnb")}>
              {t("common.back")}
            </Button>
            <Text size="lg" fw={500}>
              {isNew ? t("foodCourt.new") : form.name || t("foodCourt.detail")}
            </Text>
          </Group>
          <Group gap="sm">
            {canManage ? (
              <>
                {!isNew ? (
                  <Button color="red" variant="light" loading={deleteMutation.isPending} onClick={remove}>
                    {t("common.delete")}
                  </Button>
                ) : null}
                <Button loading={saving} onClick={save}>
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
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <Stack gap="md">
              <ErrorAlert error={detailQuery.error} />
              <Section title={t("foodCourt.sections.identity")}>
                <TextInput label={t("foodCourt.fields.name")} value={form.name} disabled={disabled} onChange={(e) => setField("name", e.currentTarget.value)} />
                <TextInput label={t("foodCourt.fields.stall")} value={form.stall ?? ""} disabled={disabled} onChange={(e) => setField("stall", e.currentTarget.value || null)} />
                <TextInput label={t("foodCourt.fields.brand")} value={form.brand ?? ""} disabled={disabled} onChange={(e) => setField("brand", e.currentTarget.value || null)} />
                <Textarea label={t("foodCourt.fields.notes")} value={form.notes ?? ""} disabled={disabled} onChange={(e) => setField("notes", e.currentTarget.value || null)} minRows={3} />
              </Section>

              <Section title={t("foodCourt.sections.rent")}>
                <Grid>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.rentPct")} value={form.rent_pct} disabled={disabled} suffix="%" onChange={(v) => setField("rent_pct", v)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.minRent")} value={form.min_rent} disabled={disabled} onChange={(v) => setField("min_rent", v)} />
                  </Grid.Col>
                </Grid>
              </Section>

              <Section title={t("foodCourt.sections.revenueFees")}>
                <Grid>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.advPct")} value={form.adv_pct} disabled={disabled} suffix="%" onChange={(v) => setField("adv_pct", v)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.mdrPct")} value={form.mdr_pct} disabled={disabled} suffix="%" onChange={(v) => setField("mdr_pct", v)} />
                  </Grid.Col>
                </Grid>
              </Section>

              <Section title={t("foodCourt.sections.fixedFees")}>
                <Grid>
                  {(["cleaning", "maintenance", "pos", "subscription", "bank", "legal", "other"] as const).map((key) => (
                    <Grid.Col span={6} key={key}>
                      <NumberField label={t(`foodCourt.fixedFees.${key}`)} value={form.fixed_fees[key]} disabled={disabled} onChange={(v) => setFixedFee(key, v)} />
                    </Grid.Col>
                  ))}
                </Grid>
              </Section>

              <Section title={t("foodCourt.sections.entrance")}>
                <Grid>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.entranceTotal")} value={form.entrance_total} disabled={disabled} onChange={(v) => setField("entrance_total", v)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.entranceMonths")} value={form.entrance_months} disabled={disabled} onChange={(v) => setField("entrance_months", Math.round(v))} />
                  </Grid.Col>
                </Grid>
              </Section>

              <Section title={t("foodCourt.sections.params")}>
                <Grid>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.foodPct")} value={form.food_pct} disabled={disabled} suffix="%" onChange={(v) => setField("food_pct", v)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.gstPct")} value={form.gst_pct} disabled={disabled} suffix="%" onChange={(v) => setField("gst_pct", v)} />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Switch checked={form.include_gst} disabled={disabled} label={t("foodCourt.fields.includeGst")} onChange={(e) => setField("include_gst", e.currentTarget.checked)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.salary")} value={form.salary} disabled={disabled} onChange={(v) => setField("salary", v)} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <NumberField label={t("foodCourt.fields.investorFloor")} value={form.investor_floor} disabled={disabled} onChange={(v) => setField("investor_floor", v)} />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <NumberField label={t("foodCourt.fields.profitTarget")} value={form.profit_target} disabled={disabled} onChange={(v) => setField("profit_target", v)} />
                  </Grid.Col>
                </Grid>
              </Section>

              <Section title={t("foodCourt.sections.tiers")}>
                <Grid>
                  {[0, 1, 2].map((index) => (
                    <Grid.Col span={4} key={index}>
                      <NumberField label={t("foodCourt.fields.tier", { index: index + 1 })} value={form.tiers[index] ?? 0} disabled={disabled} onChange={(v) => setTier(index, v)} />
                    </Grid.Col>
                  ))}
                </Grid>
              </Section>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 7 }}>
            <ResultsPanel form={form} />
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
