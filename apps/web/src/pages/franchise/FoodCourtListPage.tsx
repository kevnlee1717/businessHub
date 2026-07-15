import { Alert, Anchor, Badge, Box, Button, Group, Loader, Paper, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { fnbFoodCourtKeys, listFoodCourts, type FoodCourt } from "../../api/fnbFoodCourts";
import { useAuth } from "../../auth/AuthContext";
import { calcAtRevenue, healthLevel, solveBreakEven } from "./foodCourtCalc";

function money(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
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

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

function healthColor(level: ReturnType<typeof healthLevel>) {
  if (level === "good") return "green";
  if (level === "low") return "yellow";
  return "red";
}

function FoodCourtRow({ court }: { court: FoodCourt }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const calc = calcAtRevenue(court, 30000);
  const level = healthLevel(calc.healthPct);
  const breakEven = solveBreakEven(court);

  return (
    <Table.Tr>
      <Table.Td>
        <Anchor onClick={() => navigate(`/franchise/fnb/${court.id}`)}>{court.name}</Anchor>
      </Table.Td>
      <Table.Td>
        <Stack gap={0}>
          <Text size="sm">{court.stall || "-"}</Text>
          <Text size="xs" c="dimmed">
            {court.brand || "-"}
          </Text>
        </Stack>
      </Table.Td>
      <Table.Td>
        <Badge color={healthColor(level)}>{pct(calc.healthPct)}</Badge>
      </Table.Td>
      <Table.Td>{money(calc.couple)}</Table.Td>
      <Table.Td>{breakEven === null ? "-" : money(breakEven)}</Table.Td>
      <Table.Td>
        <Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/fnb/${court.id}`)}>
          {t("common.view")}
        </Button>
      </Table.Td>
    </Table.Tr>
  );
}

export function FoodCourtListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can("franchise.manage");
  const query = useQuery({
    queryKey: fnbFoodCourtKeys.list(),
    queryFn: listFoodCourts
  });
  const courts = query.data?.food_courts ?? [];

  return (
    <Box p="md">
      <Group gap="sm" mb="md" wrap="wrap" justify="space-between">
        <Text size="lg" fw={500}>
          {t("foodCourt.title")}
        </Text>
        {canManage ? <Button onClick={() => navigate("/franchise/fnb/new")}>{t("foodCourt.new")}</Button> : null}
      </Group>

      <Stack gap="md">
        <ErrorAlert error={query.error} />
        <Paper p={0}>
          {query.isLoading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : courts.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              {t("foodCourt.empty")}
            </Text>
          ) : (
            <Table withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("foodCourt.fields.name")}</Table.Th>
                  <Table.Th>{t("foodCourt.list.stallBrand")}</Table.Th>
                  <Table.Th>{t("foodCourt.list.healthAt30k")}</Table.Th>
                  <Table.Th>{t("foodCourt.list.coupleAt30k")}</Table.Th>
                  <Table.Th>{t("foodCourt.list.breakEven")}</Table.Th>
                  <Table.Th w={120}>{t("common.actions")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {courts.map((court) => (
                  <FoodCourtRow key={court.id} court={court} />
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
