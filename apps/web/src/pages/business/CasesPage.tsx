import { Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function CasesPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      <Title order={2}>{t("case.title")}</Title>
      <Text c="dimmed">{t("common.coming_soon")}</Text>
    </Stack>
  );
}
