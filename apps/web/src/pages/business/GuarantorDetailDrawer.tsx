import { Badge, Drawer, Group, Loader, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getGuarantor } from "../../api/cases";

const RESULT_COLOR: Record<string, string> = {
  approved: "teal",
  rejected: "red",
  pending: "blue"
};

export function GuarantorDetailDrawer({
  guarantorId,
  onClose
}: {
  guarantorId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["business", "guarantors", "detail", guarantorId],
    queryFn: () => getGuarantor(guarantorId as string),
    enabled: guarantorId !== null
  });
  const g = query.data?.guarantor;

  return (
    <Drawer opened={guarantorId !== null} onClose={onClose} position="right" size="lg" title={g?.name ?? ""}>
      {query.isLoading ? (
        <Group justify="center" py="lg"><Loader size="sm" /></Group>
      ) : g ? (
        <Stack gap="md">
          <Text fz="sm" c="dimmed">{t("guarantor.detail.casesTitle", { count: g.cases?.length ?? 0 })}</Text>
          <Table withTableBorder highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("guarantor.detail.client")}</Table.Th>
                <Table.Th>{t("guarantor.detail.status")}</Table.Th>
                <Table.Th>{t("guarantor.detail.result")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(g.cases ?? []).map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{c.client_name ?? c.client_id}</Table.Td>
                  <Table.Td>{t(`caseStatus.${c.status}`)}</Table.Td>
                  <Table.Td>
                    {c.latest_result ? (
                      <Badge color={RESULT_COLOR[c.latest_result] ?? "gray"} variant="light">
                        {t(`caseResult.${c.latest_result}`)}
                      </Badge>
                    ) : <Badge color="gray" variant="light">{t("guarantor.detail.noResult")}</Badge>}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}
    </Drawer>
  );
}
