import { Card, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function FranchisePage() {
  const { t } = useTranslation();
  return (
    <Card withBorder>
      <Text c="dimmed">{t("nav.franchise")} · {t("common.comingSoon")}</Text>
    </Card>
  );
}
