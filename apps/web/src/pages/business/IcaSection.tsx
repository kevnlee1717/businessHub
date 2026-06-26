import { Stack, Tabs, Title } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CasesPage } from "./CasesPage";
import { ClientsPage } from "./ClientsPage";
import { GuarantorsPage } from "./GuarantorsPage";
import { TemplatesPage } from "./TemplatesPage";

export function IcaSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("cases");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="cases">{t("business.tabs.cases")}</Tabs.Tab>
        <Tabs.Tab value="clients">{t("business.tabs.clients")}</Tabs.Tab>
        <Tabs.Tab value="templates">{t("business.tabs.templates")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="cases" pt="md">
        <CasesPage businessType="ica" />
      </Tabs.Panel>
      <Tabs.Panel value="clients" pt="md">
        <ClientsPage />
      </Tabs.Panel>
      <Tabs.Panel value="templates" pt="md">
        <Stack gap="xl">
          <TemplatesPage businessType="ica" />
          <Stack gap="md">
            <Title order={2}>{t("business.tabs.guarantors")}</Title>
            <GuarantorsPage />
          </Stack>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
