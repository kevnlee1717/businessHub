import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { value: "companies", path: "/settings/companies", labelKey: "settings.tabs.companies" },
  { value: "positions", path: "/settings/positions", labelKey: "settings.tabs.positions" },
  { value: "work-shifts", path: "/settings/work-shifts", labelKey: "settings.tabs.workShifts" },
  { value: "industries", path: "/settings/industries", labelKey: "settings.tabs.industries" },
  { value: "collection-items", path: "/settings/collection-items", labelKey: "settings.tabs.collectionItems" }
] as const;

export function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "companies";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/settings/${value}`)}>
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
