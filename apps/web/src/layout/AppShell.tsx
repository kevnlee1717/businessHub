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
  { to: "/business", key: "nav.business" },
  { to: "/education", key: "nav.education" },
  { to: "/documents", key: "nav.documents" },
  { to: "/finance", key: "nav.finance" },
  { to: "/settings", key: "nav.settings" }
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
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            component={RouterNavLink}
            to={item.to}
            label={t(item.key)}
            onClick={toggle}
          />
        ))}
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>
        <Box maw={1200}>
          <Outlet />
        </Box>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
