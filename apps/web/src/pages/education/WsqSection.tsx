import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StudentsPage } from "./StudentsPage";
import { WsqPage } from "./WsqPage";
import { BusinessSchemePanel } from "../businessFinance/BusinessSchemePanel";

export function WsqSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("courses");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="courses">{t("education.tabs.courses")}</Tabs.Tab>
        <Tabs.Tab value="students">{t("education.tabs.students")}</Tabs.Tab>
        <Tabs.Tab value="feeShare">{t("business.tabs.feeShare")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="courses" pt="md">
        <WsqPage />
      </Tabs.Panel>
      <Tabs.Panel value="students" pt="md">
        <StudentsPage />
      </Tabs.Panel>
      <Tabs.Panel value="feeShare" pt="md">
        <BusinessSchemePanel businessCode="wsq" />
      </Tabs.Panel>
    </Tabs>
  );
}
