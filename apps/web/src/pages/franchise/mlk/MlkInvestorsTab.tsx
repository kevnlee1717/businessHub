import { Anchor, Badge, Button, Group, Loader, Paper, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { listMlkInvestors, listMlkStores, mlkKeys } from "../../../api/mlk";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorAlert, kycColor, prColor, tierColor } from "./shared";

export function MlkInvestorsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can("mlk.manage");
  const [keyword, setKeyword] = useState("");
  const investorsQuery = useQuery({
    queryKey: mlkKeys.investors(),
    queryFn: listMlkInvestors
  });
  const storesQuery = useQuery({
    queryKey: mlkKeys.stores(),
    queryFn: listMlkStores
  });
  const investors = investorsQuery.data?.investors ?? [];
  const stores = storesQuery.data?.stores ?? [];

  const storeCountByInvestor = useMemo(() => {
    const counts = new Map<string, number>();
    stores.forEach((store) => {
      if (!store.investor_id) return;
      counts.set(store.investor_id, (counts.get(store.investor_id) ?? 0) + 1);
    });
    return counts;
  }, [stores]);

  const filteredInvestors = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    return investors.filter((investor) => {
      if (!term) return true;
      return (
        investor.name.toLowerCase().includes(term) ||
        (investor.company_name ?? "").toLowerCase().includes(term) ||
        (investor.phone ?? "").toLowerCase().includes(term)
      );
    });
  }, [investors, keyword]);

  return (
    <Stack gap="md">
      <Group gap="sm" mb={0} wrap="wrap" align="flex-end">
        <TextInput
          w={200}
          label={t("mlk.actions.searchName")}
          value={keyword}
          onChange={(event) => setKeyword(event.currentTarget.value)}
        />
        {canManage ? <Button onClick={() => navigate("/franchise/mlk/investors/new")}>{t("mlk.actions.newInvestor")}</Button> : null}
      </Group>
      <ErrorAlert error={investorsQuery.error ?? storesQuery.error} />
      <Paper p={0}>
        {investorsQuery.isLoading || storesQuery.isLoading ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : filteredInvestors.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("mlk.messages.empty")}
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("mlk.fields.name")}</Table.Th>
                <Table.Th>{t("mlk.fields.company_name")}</Table.Th>
                <Table.Th>{t("mlk.fields.service_tier")}</Table.Th>
                <Table.Th>{t("mlk.fields.pr_status")}</Table.Th>
                <Table.Th>{t("mlk.fields.kyc_status")}</Table.Th>
                <Table.Th>{t("mlk.fields.store_count")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredInvestors.map((investor) => (
                <Table.Tr key={investor.id}>
                  <Table.Td>
                    <Anchor onClick={() => navigate(`/franchise/mlk/investors/${investor.id}`)}>{investor.name}</Anchor>
                  </Table.Td>
                  <Table.Td>{investor.company_name || "-"}</Table.Td>
                  <Table.Td>
                    <Badge color={tierColor(investor.service_tier)} variant="light">
                      {t(`mlk.status.service_tier.${investor.service_tier}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={prColor(investor.pr_status)} variant="light">
                      {t(`mlk.status.pr.${investor.pr_status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={kycColor(investor.kyc_status)} variant="light">
                      {t(`mlk.status.kyc.${investor.kyc_status}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{storeCountByInvestor.get(investor.id) ?? 0}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
