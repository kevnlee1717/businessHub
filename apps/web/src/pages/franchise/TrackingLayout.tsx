import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export const trackingTabs = [
  { value: "dashboard", path: "/franchise/tracking", labelKey: "franchise.tabs.dashboard" },
  { value: "properties", path: "/franchise/tracking/properties", labelKey: "franchise.tabs.properties" },
  { value: "fnb-sites", path: "/franchise/tracking/fnb-sites", labelKey: "franchise.tabs.fnbSites" },
  { value: "contacts", path: "/franchise/tracking/contacts", labelKey: "franchise.tabs.contacts" },
  { value: "visits", path: "/franchise/tracking/visits", labelKey: "franchise.tabs.visits" }
] as const;

export function TrackingLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab =
    trackingTabs
      .filter((tab) => tab.path !== "/franchise/tracking" && location.pathname.startsWith(tab.path))
      .sort((a, b) => b.path.length - a.path.length)[0]?.value ?? "dashboard";

  return (
    <Stack gap="lg">
      <Tabs
        value={currentTab}
        onChange={(value) => {
          const tab = trackingTabs.find((item) => item.value === value);
          if (tab) navigate(tab.path);
        }}
      >
        <Tabs.List>
          {trackingTabs.map((tab) => (
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
