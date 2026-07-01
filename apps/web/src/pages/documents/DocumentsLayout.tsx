import { Paper, Stack, Tabs, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

// perm 为空表示所有能看文档的人都可见;有 perm 的 tab 按权限过滤
export const tabs = [
  { value: "search", path: "/documents/search", labelKey: "documents.tabs.search" },
  { value: "rent", path: "/documents/rent", labelKey: "documents.tabs.rent" },
  { value: "salary", path: "/documents/salary", labelKey: "documents.tabs.salary" },
  { value: "contracts", path: "/documents/contracts", labelKey: "documents.tabs.contracts" },
  { value: "invoices", path: "/documents/invoices", labelKey: "documents.tabs.invoices" },
  { value: "certificates", path: "/documents/certificates", labelKey: "documents.tabs.certificates" },
  { value: "bizfile", path: "/documents/bizfile", labelKey: "documents.tabs.bizfile" },
  { value: "brochure", path: "/documents/brochure", labelKey: "documents.tabs.brochure", perm: "brochure.view" },
  { value: "ipad-slides", path: "/documents/ipad-slides", labelKey: "documents.tabs.ipadSlides", perm: "brochure.view" },
  { value: "categories", path: "/documents/categories", labelKey: "documents.tabs.categories" }
] as const;

export function DocumentsLayout() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const visibleTabs = tabs.filter((tab) => !("perm" in tab) || can(tab.perm));
  const currentTab = visibleTabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "search";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/documents/${value}`)}>
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
