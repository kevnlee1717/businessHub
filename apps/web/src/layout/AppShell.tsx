import {
  AppShell as MantineAppShell,
  Box,
  Burger,
  Button,
  Group,
  NavLink,
  Text,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";

type NavItem = {
  to?: string;
  key: string;
  perm?: string;
  defaultOpened?: boolean;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { to: "/", key: "nav.dashboard" },
  { to: "/hr", key: "nav.hr" },
  {
    key: "nav.immigration",
    perm: "case.view",
    defaultOpened: true,
    children: [
      { to: "/business/ep", key: "nav.ep", perm: "case.view" },
      { to: "/business/ica", key: "nav.ica", perm: "case.view" }
    ]
  },
  {
    key: "nav.education_business",
    perm: "education.view",
    defaultOpened: false,
    children: [
      { to: "/education/diploma", key: "nav.diploma", perm: "education.view" },
      { to: "/education/wsq", key: "nav.wsq", perm: "education.view" },
      { to: "/education/english", key: "nav.english", perm: "education.view" },
      { to: "/education/academy-collection", key: "nav.academy_collection", perm: "education.view" }
    ]
  },
  { to: "/documents", key: "nav.documents", perm: "document.view" },
  {
    key: "nav.finance",
    perm: "finance.view",
    defaultOpened: false,
    children: [
      { to: "/finance/billing", key: "nav.finance_billing", perm: "finance.view" },
      { to: "/finance/receivables-ledger", key: "nav.finance_receivables_ledger", perm: "finance.view" },
      { to: "/finance/ledger", key: "nav.finance_ledger", perm: "finance.view" },
      { to: "/finance/bank-accounts", key: "nav.finance_bank_accounts", perm: "finance.view" },
      { to: "/finance/reconcile", key: "nav.finance_reconcile", perm: "finance.view" },
      { to: "/finance/commission", key: "nav.finance_commission", perm: "finance.view" },
      { to: "/finance/my-commission", key: "nav.finance_my_commission", perm: "commission.view_own" },
      { to: "/finance/external-commission", key: "nav.finance_external_commission", perm: "finance.view" },
      { to: "/finance/reports", key: "nav.finance_reports", perm: "finance.view" }
    ]
  },
  {
    key: "nav.business_finance",
    perm: "finance.view",
    defaultOpened: false,
    children: [
      { to: "/business-finance", key: "nav.business_finance_list", perm: "finance.view" },
      { to: "/business-finance/parties", key: "nav.deal_parties", perm: "finance.view" },
      { to: "/business-finance/external-parties", key: "nav.external_parties", perm: "finance.view" }
    ]
  },
  {
    key: "nav.settings",
    perm: "settings.manage",
    defaultOpened: false,
    children: [
      { to: "/settings/companies", key: "settings.tabs.companies", perm: "settings.manage" },
      { to: "/settings/positions", key: "settings.tabs.positions", perm: "settings.manage" },
      { to: "/settings/work-shifts", key: "settings.tabs.workShifts", perm: "settings.manage" },
      { to: "/settings/industries", key: "settings.tabs.industries", perm: "settings.manage" },
      { to: "/settings/collection-items", key: "nav.collection_items", perm: "settings.manage" }
    ]
  }
];

export function AppShell() {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure();
  const { user, logout, can } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = pathname.startsWith("/finance") || pathname === "/" ? "finance" : "business";
  const visibleNavItems = useMemo(
    () =>
      navItems
        .map((item) => {
          if (item.children) {
            const children = item.children.filter((child) => !child.perm || can(child.perm));

            if (children.length === 0 || (item.perm && !can(item.perm))) {
              return null;
            }

            return { ...item, children };
          }

          return !item.perm || can(item.perm) ? item : null;
        })
        .filter((item): item is NavItem => Boolean(item)),
    [can]
  );

  function isActivePath(to: string) {
    return to === "/" ? pathname === "/" : pathname.startsWith(to);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <Box className="app-section" data-section={section}>
      <MantineAppShell
        header={{ height: 56 }}
        navbar={{
          width: 248,
          breakpoint: "sm",
          collapsed: { mobile: !opened }
        }}
        padding="md"
        styles={{
          header: {
            background: "var(--app-surface)",
            borderBottomColor: "var(--app-line)"
          },
          navbar: {
            background: "var(--app-surface)",
            borderRightColor: "var(--app-line)"
          },
          main: {
            background: "var(--app-bg)"
          }
        }}
      >
        <MantineAppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              <Title order={3}>{t("app.title")}</Title>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <Text size="sm" c="var(--app-muted)" truncate maw={180}>
                {user?.name ?? user?.email}
              </Text>
              <LanguageToggle />
              <Button size="xs" variant="light" onClick={handleLogout}>
                {t("auth.logout")}
              </Button>
            </Group>
          </Group>
        </MantineAppShell.Header>

        <MantineAppShell.Navbar p="sm">
          <Group gap="sm" mb="md" px="xs" py={6} wrap="nowrap">
            <Box className="app-brand-mark">bH</Box>
            <Text fw={800} size="lg" lh={1}>
              businessHub
            </Text>
          </Group>
          {visibleNavItems.map((item) =>
            "children" in item ? (
              <NavLink
                key={item.key}
                label={t(item.key)}
                childrenOffset={28}
                defaultOpened={item.defaultOpened ?? false}
                active={item.children?.some((child) => child.to && isActivePath(child.to))}
                className="app-nav-link"
              >
                {item.children?.map((child) => (
                  <NavLink
                    key={child.to}
                    component={RouterNavLink}
                    to={child.to ?? "/"}
                    label={t(child.key)}
                    onClick={toggle}
                    active={child.to ? isActivePath(child.to) : false}
                    className="app-nav-link"
                  />
                ))}
              </NavLink>
            ) : (
              <NavLink
                key={item.to}
                component={RouterNavLink}
                to={item.to ?? "/"}
                label={t(item.key)}
                onClick={toggle}
                active={item.to ? isActivePath(item.to) : false}
                className="app-nav-link"
              />
            )
          )}
        </MantineAppShell.Navbar>

        <MantineAppShell.Main>
          <Box maw={1200}>
            <Outlet />
          </Box>
        </MantineAppShell.Main>
      </MantineAppShell>
    </Box>
  );
}
