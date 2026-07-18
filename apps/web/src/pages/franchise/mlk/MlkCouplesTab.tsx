import { Anchor, Badge, Button, Group, Loader, Paper, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { listMlkCouples, listMlkStores, mlkKeys } from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { coupleStatusColor, ErrorAlert, prColor } from "./shared";

function epHolderColor(holder?: string | null) {
  return holder ? "green" : "gray";
}

export function MlkCouplesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [keyword, setKeyword] = useState("");
  const couplesQuery = useQuery({
    queryKey: mlkKeys.couples(),
    queryFn: listMlkCouples
  });
  const storesQuery = useQuery({
    queryKey: mlkKeys.stores(),
    queryFn: listMlkStores
  });
  const couples = couplesQuery.data?.couples ?? [];
  const stores = storesQuery.data?.stores ?? [];

  const storeNamesByCouple = useMemo(() => {
    const names = new Map<string, string[]>();
    stores.forEach((store) => {
      if (!store.couple_id) return;
      names.set(store.couple_id, [...(names.get(store.couple_id) ?? []), store.name]);
    });
    return names;
  }, [stores]);

  const filteredCouples = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return couples.filter((couple) => {
      if (!term) return true;
      return (
        (couple.operator_company ?? "").toLowerCase().includes(term) ||
        couple.husband_name.toLowerCase().includes(term) ||
        couple.wife_name.toLowerCase().includes(term) ||
        (couple.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [couples, keyword]);

  return (
    <Stack gap="md">
      <Group gap="sm" mb={0} wrap="wrap" align="flex-end">
        <TextInput
          w={200}
          label={t("mlk.actions.searchName")}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
        {canManage ? <Button onClick={() => navigate("/franchise/mlk/couples/new")}>{t("mlk.actions.newCouple")}</Button> : null}
      </Group>
      <ErrorAlert error={couplesQuery.error ?? storesQuery.error} />
      <Paper p={0}>
        {couplesQuery.isLoading || storesQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : filteredCouples.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("mlk.messages.empty")}
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("mlk.fields.operator_company")}</Table.Th>
                <Table.Th>{t("mlk.fields.husband_name")}</Table.Th>
                <Table.Th>{t("mlk.fields.wife_name")}</Table.Th>
                <Table.Th>{t("mlk.fields.ep_status")}</Table.Th>
                <Table.Th>{t("mlk.fields.pr_status")}</Table.Th>
                <Table.Th>{t("mlk.fields.status")}</Table.Th>
                <Table.Th>{t("mlk.fields.stores")}</Table.Th>
                <Table.Th w={120} ta="center">
                  {t("mlk.fields.actions")}
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredCouples.map((couple) => (
                <Table.Tr key={couple.id}>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/franchise/mlk/couples/${couple.id}`)}>
                      {couple.operator_company || `${couple.husband_name} / ${couple.wife_name}`}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{couple.husband_name}</Table.Td>
                  <Table.Td>{couple.wife_name}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" color={epHolderColor(couple.ep_holder)} variant="light">
                      {t(`mlk.epHolder.${couple.ep_holder ?? "none"}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={prColor(couple.pr_status)} variant="light">
                      {t(`mlk.status.pr.${couple.pr_status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={coupleStatusColor(couple.status)} variant="light">
                      {t(`mlk.status.couple.${couple.status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{(storeNamesByCouple.get(couple.id) ?? []).join(", ") || "-"}</Table.Td>
                  <Table.Td ta="center">
                    <Button size="xs" variant="subtle" onClick={() => navigate(`/franchise/mlk/couples/${couple.id}`)}>
                      {canManage ? t("mlk.actions.edit") : t("mlk.actions.view")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
