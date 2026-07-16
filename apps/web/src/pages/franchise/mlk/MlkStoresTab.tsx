import { Anchor, Badge, Button, Group, Loader, Paper, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { listMlkStores, mlkKeys, type MlkStatus } from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorAlert, formatDate, storeStatusColor } from "./shared";

const storeStatuses: MlkStatus[] = ["intent", "selected", "incorporated", "lease_signed", "renovation", "open", "closed"];

export function MlkStoresTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<MlkStatus | null>(null);
  const storesQuery = useQuery({
    queryKey: mlkKeys.stores(),
    queryFn: listMlkStores
  });
  const stores = storesQuery.data?.stores ?? [];

  const filteredStores = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return stores.filter((store) => {
      const matchesKeyword =
        term.length === 0 ||
        store.name.toLowerCase().includes(term) ||
        (store.stall ?? "").toLowerCase().includes(term) ||
        (store.investor_name ?? "").toLowerCase().includes(term) ||
        (store.couple_name ?? "").toLowerCase().includes(term);
      return matchesKeyword && (!status || store.status === status);
    });
  }, [keyword, status, stores]);

  return (
    <Stack gap="md">
      <Group gap="sm" mb={0} wrap="wrap" align="flex-end">
        <TextInput
          w={200}
          label={t("mlk.actions.searchName")}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
        <Select
          w={140}
          label={t("mlk.fields.status")}
          data={storeStatuses.map((value) => ({ value, label: t(`mlk.status.store.${value}`) }))}
          value={status}
          onChange={(value) => setStatus(value as MlkStatus | null)}
          clearable
        />
        {canManage ? <Button onClick={() => navigate("/franchise/mlk/stores/new")}>{t("mlk.actions.newStore")}</Button> : null}
      </Group>
      <ErrorAlert error={storesQuery.error} />
      <Paper p={0}>
        {storesQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : filteredStores.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("mlk.messages.empty")}
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("mlk.fields.name")}</Table.Th>
                <Table.Th>{t("mlk.fields.food_court")}</Table.Th>
                <Table.Th>{t("mlk.fields.stall")}</Table.Th>
                <Table.Th>{t("mlk.fields.investor")}</Table.Th>
                <Table.Th>{t("mlk.fields.couple")}</Table.Th>
                <Table.Th>{t("mlk.fields.status")}</Table.Th>
                <Table.Th>{t("mlk.fields.opened_at")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredStores.map((store) => (
                <Table.Tr key={store.id}>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/franchise/mlk/stores/${store.id}`)}>{store.name}</Anchor>
                  </Table.Td>
                  <Table.Td>{store.food_court_name || "-"}</Table.Td>
                  <Table.Td>{store.stall || "-"}</Table.Td>
                  <Table.Td>{store.investor_name || "-"}</Table.Td>
                  <Table.Td>{store.couple_name || "-"}</Table.Td>
                  <Table.Td>
                    <Badge color={storeStatusColor(store.status)} variant="light">
                      {t(`mlk.status.store.${store.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatDate(store.opened_at)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
