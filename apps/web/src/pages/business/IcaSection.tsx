import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CasesPage } from "./CasesPage";
import { ClientsPage } from "./ClientsPage";
import { GuarantorsPage } from "./GuarantorsPage";
import { IcaStatsPanel } from "./IcaStatsPanel";
import { TemplatesPage } from "./TemplatesPage";
import { BusinessSchemePanel } from "../businessFinance/BusinessSchemePanel";

export function IcaSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("cases");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="cases">{t("business.tabs.cases")}</Tabs.Tab>
        <Tabs.Tab value="clients">{t("business.tabs.clients")}</Tabs.Tab>
        <Tabs.Tab value="guarantors">{t("business.tabs.guarantors")}</Tabs.Tab>
        <Tabs.Tab value="templates">{t("business.tabs.templates")}</Tabs.Tab>
        <Tabs.Tab value="stats">{t("business.tabs.stats")}</Tabs.Tab>
        <Tabs.Tab value="feeShare">{t("business.tabs.feeShare")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="cases" pt="md">
        <CasesPage businessType="ica" />
      </Tabs.Panel>
      <Tabs.Panel value="clients" pt="md">
        <ClientsPage />
      </Tabs.Panel>
      <Tabs.Panel value="guarantors" pt="md">
        <GuarantorsPage />
      </Tabs.Panel>
      <Tabs.Panel value="templates" pt="md">
        <TemplatesPage businessType="ica" />
      </Tabs.Panel>
      <Tabs.Panel value="stats" pt="md">
        <IcaStatsPanel />
      </Tabs.Panel>
      <Tabs.Panel value="feeShare" pt="md">
        <BusinessSchemePanel businessCode="ica" />
      </Tabs.Panel>
    </Tabs>
  );
}
