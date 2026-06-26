import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EnglishPage } from "./EnglishPage";
import { StudentsPage } from "./StudentsPage";

export function EnglishSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("courses");

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="courses">{t("education.tabs.coursesAndSchedule")}</Tabs.Tab>
        <Tabs.Tab value="students">{t("education.tabs.students")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="courses" pt="md">
        <EnglishPage />
      </Tabs.Panel>
      <Tabs.Panel value="students" pt="md">
        <StudentsPage />
      </Tabs.Panel>
    </Tabs>
  );
}
