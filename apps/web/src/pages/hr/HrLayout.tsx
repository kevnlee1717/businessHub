import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { value: "employees", path: "/hr/employees", labelKey: "hr.tabs.employees" },
  { value: "attendance", path: "/hr/attendance", labelKey: "hr.tabs.attendance" },
  { value: "payroll", path: "/hr/payroll", labelKey: "hr.tabs.payroll" },
  { value: "clock-points", path: "/hr/clock-points", labelKey: "hr.tabs.clockPoints" },
  { value: "site-visits", path: "/hr/site-visits", labelKey: "hr.tabs.siteVisits" },
  { value: "compensation", path: "/hr/compensation", labelKey: "hr.tabs.compensation" },
  { value: "performance", path: "/hr/performance", labelKey: "hr.tabs.performance" }
] as const;

export function HrLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "employees";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/hr/${value}`)}>
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
