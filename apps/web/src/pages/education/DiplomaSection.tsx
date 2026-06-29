import { Tabs } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DiplomaPage } from "./DiplomaPage";
import { StudentsPage } from "./StudentsPage";

export function DiplomaSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<string | null>("courses");

  return (
    <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="courses">{t("education.tabs.courses")}</Tabs.Tab>
        <Tabs.Tab value="enrollments">{t("education.tabs.enrollments")}</Tabs.Tab>
        <Tabs.Tab value="students">{t("education.tabs.students")}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="courses" pt="md">
        <DiplomaPage section="courses" />
      </Tabs.Panel>
      <Tabs.Panel value="enrollments" pt="md">
        <DiplomaPage section="enrollments" />
      </Tabs.Panel>
      <Tabs.Panel value="students" pt="md">
        <StudentsPage />
      </Tabs.Panel>
    </Tabs>
  );
}
