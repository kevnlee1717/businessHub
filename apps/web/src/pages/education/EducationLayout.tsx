import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { value: "students", path: "/education/students", labelKey: "education.tabs.students" },
  { value: "diploma", path: "/education/diploma", labelKey: "education.tabs.diploma" },
  { value: "english", path: "/education/english", labelKey: "education.tabs.english" },
  { value: "wsq", path: "/education/wsq", labelKey: "education.tabs.wsq" }
] as const;

export function EducationLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "students";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/education/${value}`)}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Stack>
  );
}
