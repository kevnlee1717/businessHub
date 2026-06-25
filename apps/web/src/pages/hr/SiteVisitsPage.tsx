import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function SiteVisitsPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Title order={2}>{t("hr.tabs.siteVisits")}</Title>
      <Text c="dimmed">{t("common.coming_soon")}</Text>
    </Stack>
  );
}
