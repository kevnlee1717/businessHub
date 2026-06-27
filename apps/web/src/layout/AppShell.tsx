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
import { useTranslation } from "react-i18next";
import { NavLink as RouterNavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";

const navItems = [
  { to: "/", key: "nav.dashboard" },
  { to: "/hr", key: "nav.hr" },
  {
    key: "nav.immigration",
    defaultOpened: true,
    children: [
      { to: "/business/ep", key: "nav.ep" },
      { to: "/business/ica", key: "nav.ica" }
    ]
  },
  {
    key: "nav.education_business",
    defaultOpened: false,
    children: [
      { to: "/education/diploma", key: "nav.diploma" },
      { to: "/education/wsq", key: "nav.wsq" },
      { to: "/education/english", key: "nav.english" },
      { to: "/education/academy-collection", key: "nav.academy_collection" }
    ]
  },
  { to: "/documents", key: "nav.documents" },
  {
    key: "nav.finance",
    defaultOpened: false,
    children: [
      { to: "/finance/billing", key: "nav.finance_billing" },
      { to: "/finance/receivables-ledger", key: "nav.finance_receivables_ledger" },
      { to: "/finance/ledger", key: "nav.finance_ledger" },
      { to: "/finance/bank-accounts", key: "nav.finance_bank_accounts" },
      { to: "/finance/reconcile", key: "nav.finance_reconcile" },
      { to: "/finance/commission", key: "nav.finance_commission" },
      { to: "/finance/my-commission", key: "nav.finance_my_commission" },
      { to: "/finance/external-commission", key: "nav.finance_external_commission" },
      { to: "/finance/reports", key: "nav.finance_reports" }
    ]
  },
  {
    key: "nav.business_finance",
    defaultOpened: false,
    children: [
      { to: "/business-finance", key: "nav.business_finance_list" },
      { to: "/business-finance/parties", key: "nav.deal_parties" },
      { to: "/business-finance/external-parties", key: "nav.external_parties" }
    ]
  },
  {
    key: "nav.settings",
    defaultOpened: false,
    children: [
      { to: "/settings/companies", key: "settings.tabs.companies" },
      { to: "/settings/positions", key: "settings.tabs.positions" },
      { to: "/settings/work-shifts", key: "settings.tabs.workShifts" },
      { to: "/settings/industries", key: "settings.tabs.industries" },
      { to: "/settings/collection-items", key: "nav.collection_items" }
    ]
  }
] as const;

export function AppShell() {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: "sm",
        collapsed: { mobile: !opened }
      }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={3}>{t("app.title")}</Title>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" truncate maw={180}>
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
        {navItems.map((item) =>
          "children" in item ? (
            <NavLink
              key={item.key}
              label={t(item.key)}
              childrenOffset={28}
              defaultOpened={item.defaultOpened}
            >
              {item.children.map((child) => (
                <NavLink
                  key={child.to}
                  component={RouterNavLink}
                  to={child.to}
                  label={t(child.key)}
                  onClick={toggle}
                />
              ))}
            </NavLink>
          ) : (
            <NavLink
              key={item.to}
              component={RouterNavLink}
              to={item.to}
              label={t(item.key)}
              onClick={toggle}
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
  );
}
