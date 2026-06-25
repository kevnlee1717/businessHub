import { Paper, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const displayName = user?.name ?? user?.email ?? "";

  return (
    <Stack gap="md">
      <Title order={2}>{t("nav.dashboard")}</Title>
      <Paper withBorder radius="md" p="lg">
        <Text>{t("dashboard.welcome", { name: displayName })}</Text>
      </Paper>
    </Stack>
  );
}
