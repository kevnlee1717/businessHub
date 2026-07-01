import { Alert, Button, Group, Loader, NumberInput, Paper, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getIcaFeeConfig, updateIcaFeeConfig } from "../../api/businessSchemes";

// ICA 极简「收费&分成」面板:总价 / 定金 / 担保人固定分成 三项。
// 收费(定金/尾款)在案件收款计划里按此预填并铺收款项;担保人分成在收到定金时记应付。
export function IcaFeeSharePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [total, setTotal] = useState<number | null>(null);
  const [deposit, setDeposit] = useState<number | null>(null);
  const [guarantorShare, setGuarantorShare] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const configQuery = useQuery({
    queryKey: ["ica-fee-config"],
    queryFn: () => getIcaFeeConfig()
  });

  useEffect(() => {
    const config = configQuery.data?.config;
    if (config) {
      setTotal(config.default_total);
      setDeposit(config.default_deposit);
      setGuarantorShare(config.guarantor_share);
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateIcaFeeConfig({
        default_total: total ?? 0,
        default_deposit: deposit ?? 0,
        guarantor_share: guarantorShare ?? 0
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["ica-fee-config"] });
    }
  });

  if (configQuery.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (configQuery.error) {
    return (
      <Alert color="red" variant="light">
        {configQuery.error instanceof Error ? configQuery.error.message : t("common.unknown_error")}
      </Alert>
    );
  }

  const balance = Math.max(0, (total ?? 0) - (deposit ?? 0));

  return (
    <Paper withBorder radius="md" p="md" maw={640}>
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={3}>{t("icaFeeShare.title")}</Title>
          <Text size="sm" c="dimmed">
            {t("icaFeeShare.hint")}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Title order={5}>{t("icaFeeShare.feeSection")}</Title>
          <NumberInput
            label={t("icaFeeShare.total")}
            description={t("icaFeeShare.totalHint")}
            value={total ?? ""}
            onChange={(value) => {
              setTotal(typeof value === "number" ? value : null);
              setSaved(false);
            }}
            min={0}
            decimalScale={2}
            thousandSeparator=","
          />
          <NumberInput
            label={t("icaFeeShare.deposit")}
            description={t("icaFeeShare.depositHint")}
            value={deposit ?? ""}
            onChange={(value) => {
              setDeposit(typeof value === "number" ? value : null);
              setSaved(false);
            }}
            min={0}
            decimalScale={2}
            thousandSeparator=","
          />
          <Text size="sm" c="dimmed">
            {t("icaFeeShare.balancePreview", { amount: balance.toFixed(2) })}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Title order={5}>{t("icaFeeShare.shareSection")}</Title>
          <NumberInput
            label={t("icaFeeShare.guarantorShare")}
            description={t("icaFeeShare.guarantorShareHint")}
            value={guarantorShare ?? ""}
            onChange={(value) => {
              setGuarantorShare(typeof value === "number" ? value : null);
              setSaved(false);
            }}
            min={0}
            decimalScale={2}
            thousandSeparator=","
          />
        </Stack>

        {saveMutation.error ? (
          <Alert color="red" variant="light">
            {saveMutation.error instanceof Error ? saveMutation.error.message : t("common.unknown_error")}
          </Alert>
        ) : null}
        {saved ? (
          <Alert color="green" variant="light">
            {t("common.saved")}
          </Alert>
        ) : null}

        <Group justify="flex-end">
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
