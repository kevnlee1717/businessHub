import { Alert, Card, Stack, Tabs, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { BusinessSchemePanel } from "../businessFinance/BusinessSchemePanel";
import { PackagesAdminPage } from "./PackagesAdminPage";

export function FeeCommissionPanel() {
  const { t } = useTranslation();

  return (
    <Tabs defaultValue="packages">
      <Tabs.List>
        <Tabs.Tab value="packages">{t("epFeeCommission.tabs.packages")}</Tabs.Tab>
        <Tabs.Tab value="legacy">{t("epFeeCommission.tabs.legacy")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="packages" pt="md">
        <PackagesAdminPage />
      </Tabs.Panel>

      <Tabs.Panel value="legacy" pt="md">
        <Stack gap="md">
          <Alert color="yellow" variant="light" title={t("epFeeCommission.legacy.title")}>
            {t("epFeeCommission.legacy.description")}
          </Alert>
          <Card withBorder radius="sm">
            <Stack gap="sm">
              <Text fw={600}>{t("epFeeCommission.legacy.schemeTitle")}</Text>
              <BusinessSchemePanel businessCode="ep" />
            </Stack>
          </Card>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
