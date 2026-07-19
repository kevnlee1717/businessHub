import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export const recruitmentTabs = [
  { value: "dashboard", path: "/recruitment", labelKey: "recruitment.tabs.dashboard" },
  { value: "jobs", path: "/recruitment/jobs", labelKey: "recruitment.tabs.jobs" },
  { value: "postings", path: "/recruitment/postings", labelKey: "recruitment.tabs.postings" },
  { value: "kpi", path: "/recruitment/kpi", labelKey: "recruitment.tabs.kpi" },
  { value: "comparison", path: "/recruitment/comparison", labelKey: "recruitment.tabs.comparison" },
  { value: "group-owners", path: "/recruitment/group-owners", labelKey: "recruitment.tabs.groupOwners" },
  { value: "campaigns", path: "/recruitment/campaigns", labelKey: "recruitment.tabs.campaigns" },
  { value: "candidates", path: "/recruitment/candidates", labelKey: "recruitment.tabs.candidates" },
  { value: "upcoming", path: "/recruitment/upcoming", labelKey: "recruitment.tabs.upcoming" },
  { value: "analytics", path: "/recruitment/analytics", labelKey: "recruitment.tabs.analytics" },
  { value: "talent-pool", path: "/recruitment/talent-pool", labelKey: "recruitment.tabs.talentPool" },
  { value: "capture", path: "/recruitment/capture", labelKey: "recruitment.tabs.capture" },
  { value: "settings", path: "/recruitment/settings", labelKey: "recruitment.tabs.settings" },
  { value: "ifm-settings", path: "/recruitment/ifm-settings", labelKey: "recruitment.tabs.ifmSettings", perm: "recruitment.manage" }
] as const;

export function RecruitmentLayout() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const visibleTabs = recruitmentTabs.filter((tab) => !("perm" in tab) || can(tab.perm));
  const currentTab =
    visibleTabs
      .filter((tab) => tab.path !== "/recruitment" && location.pathname.startsWith(tab.path))
      .sort((a, b) => b.path.length - a.path.length)[0]?.value ?? "dashboard";

  return (
    <Stack gap="lg">
      <Tabs
        value={currentTab}
        onChange={(value) => {
          const tab = visibleTabs.find((item) => item.value === value);
          if (tab) navigate(tab.path);
        }}
      >
        <Tabs.List>
          {visibleTabs.map((tab) => (
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
