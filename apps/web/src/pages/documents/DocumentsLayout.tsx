import { Paper, Stack, Tabs, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export const tabs = [
  { value: "search", path: "/documents/search", labelKey: "documents.tabs.search" },
  { value: "rent", path: "/documents/rent", labelKey: "documents.tabs.rent" },
  { value: "salary", path: "/documents/salary", labelKey: "documents.tabs.salary" },
  { value: "contracts", path: "/documents/contracts", labelKey: "documents.tabs.contracts" },
  { value: "invoices", path: "/documents/invoices", labelKey: "documents.tabs.invoices" },
  { value: "certificates", path: "/documents/certificates", labelKey: "documents.tabs.certificates" },
  { value: "categories", path: "/documents/categories", labelKey: "documents.tabs.categories" }
] as const;

export function DocumentsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "search";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/documents/${value}`)}>
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

export function DocumentsPlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();

  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="xs">
        <Title order={2}>{t(titleKey)}</Title>
        <Text c="dimmed">{t("common.coming_soon")}</Text>
      </Stack>
    </Paper>
  );
}
