import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { value: "cases", path: "/business/cases", labelKey: "business.tabs.cases" },
  { value: "clients", path: "/business/clients", labelKey: "business.tabs.clients" },
  { value: "templates", path: "/business/templates", labelKey: "business.tabs.templates" },
  { value: "guarantors", path: "/business/guarantors", labelKey: "business.tabs.guarantors" }
] as const;

export function BusinessLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "cases";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/business/${value}`)}>
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
