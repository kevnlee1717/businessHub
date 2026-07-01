import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export const recruitmentTabs = [
  { value: "dashboard", path: "/recruitment", labelKey: "recruitment.tabs.dashboard" },
  { value: "jobs", path: "/recruitment/jobs", labelKey: "recruitment.tabs.jobs" },
  { value: "postings", path: "/recruitment/postings", labelKey: "recruitment.tabs.postings" },
  { value: "campaigns", path: "/recruitment/campaigns", labelKey: "recruitment.tabs.campaigns" },
  { value: "candidates", path: "/recruitment/candidates", labelKey: "recruitment.tabs.candidates" },
  { value: "upcoming", path: "/recruitment/upcoming", labelKey: "recruitment.tabs.upcoming" },
  { value: "analytics", path: "/recruitment/analytics", labelKey: "recruitment.tabs.analytics" },
  { value: "talent-pool", path: "/recruitment/talent-pool", labelKey: "recruitment.tabs.talentPool" },
  { value: "capture", path: "/recruitment/capture", labelKey: "recruitment.tabs.capture" },
  { value: "settings", path: "/recruitment/settings", labelKey: "recruitment.tabs.settings" }
] as const;

export function RecruitmentLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab =
    recruitmentTabs
      .filter((tab) => tab.path !== "/recruitment" && location.pathname.startsWith(tab.path))
      .sort((a, b) => b.path.length - a.path.length)[0]?.value ?? "dashboard";

  return (
    <Stack gap="lg">
      <Tabs
        value={currentTab}
        onChange={(value) => {
          const tab = recruitmentTabs.find((item) => item.value === value);
          if (tab) navigate(tab.path);
        }}
      >
        <Tabs.List>
          {recruitmentTabs.map((tab) => (
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
