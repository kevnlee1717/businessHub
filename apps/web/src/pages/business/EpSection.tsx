import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CaseStatsPanel } from "./CaseStatsPanel";
import { CasesPage } from "./CasesPage";
import { ClientsPage } from "./ClientsPage";
import { PricelistPanel } from "./PricelistPanel";
import { TemplatesPage } from "./TemplatesPage";

export function EpSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("cases");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="cases">{t("business.tabs.cases")}</Tabs.Tab>
        <Tabs.Tab value="clients">{t("business.tabs.clients")}</Tabs.Tab>
        <Tabs.Tab value="templates">{t("business.tabs.templates")}</Tabs.Tab>
        <Tabs.Tab value="pricelist">{t("business.tabs.pricelist")}</Tabs.Tab>
        <Tabs.Tab value="stats">{t("business.tabs.stats")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="cases" pt="md">
        <CasesPage businessType="ep" />
      </Tabs.Panel>
      <Tabs.Panel value="clients" pt="md">
        <ClientsPage />
      </Tabs.Panel>
      <Tabs.Panel value="templates" pt="md">
        <TemplatesPage businessType="ep" />
      </Tabs.Panel>
      <Tabs.Panel value="pricelist" pt="md">
        <PricelistPanel />
      </Tabs.Panel>
      <Tabs.Panel value="stats" pt="md">
        <CaseStatsPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
