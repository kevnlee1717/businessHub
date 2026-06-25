import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function PayrollPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Title order={2}>{t("hr.tabs.payroll")}</Title>
      <Text c="dimmed">{t("common.coming_soon")}</Text>
    </Stack>
  );
}
