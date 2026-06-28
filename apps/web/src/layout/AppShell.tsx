import {
  AppShell as MantineAppShell,
  Box,
  Burger,
  Button,
  Group,
  NavLink,
  Text
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { LanguageToggle } from "../components/LanguageToggle";
import { routeTitleEntries } from "./routeTitles";
import { TagsView, type VisitedView } from "./TagsView";

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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = pathname.startsWith("/finance") || pathname === "/" ? "finance" : "business";

  function isActivePath(to: string) {
    return to === "/" ? pathname === "/" : pathname.startsWith(to);
  }

  const titleEntries = useMemo(() => {
    const out: { to: string; key: string }[] = [];
    for (const item of navItems) {
      if ("children" in item) {
        item.children.forEach((child) => out.push({ to: child.to, key: child.key }));
      } else {
        out.push({ to: item.to, key: item.key });
      }
    }
    // 路由式子 tab(如 /hr/attendance)→ 具体标题,比父级 /hr 更精确
    for (const entry of routeTitleEntries) {
      out.push({ to: entry.path, key: entry.key });
    }
    return out;
  }, []);

  function resolveTitle(path: string) {
    const exact = titleEntries.find((i) => i.to === path);
    if (exact) return t(exact.key);
    const prefix = titleEntries
      .filter((i) => i.to !== "/" && path.startsWith(i.to))
      .sort((a, b) => b.to.length - a.to.length)[0];
    if (prefix) return t(prefix.key);
    if (path === "/") return t("nav.dashboard");
    return path;
  }

  const [views, setViews] = useState<VisitedView[]>(() => [
    { path: "/", title: t("nav.dashboard") }
  ]);

  useEffect(() => {
    setViews((prev) => {
      if (prev.some((v) => v.path === pathname)) return prev;
      return [...prev, { path: pathname, title: resolveTitle(pathname) }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function closeTag(path: string) {
    setViews((prev) => {
      const idx = prev.findIndex((v) => v.path === path);
      const next = prev.filter((v) => v.path !== path);
      if (path === pathname) {
        const fallback = next[idx - 1] ?? next[idx] ?? { path: "/" };
        navigate(fallback.path);
      }
      return next.length ? next : [{ path: "/", title: t("nav.dashboard") }];
    });
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  // 顶栏面包屑(element-admin:navbar 只放面包屑,不放 app 标题)
  const crumbs: string[] = (() => {
    const base: string[] = [];
    for (const item of navItems) {
      if ("children" in item) {
        const child = item.children.find((c) => isActivePath(c.to));
        if (child) {
          base.push(t(item.key), t(child.key));
          break;
        }
      } else if (isActivePath(item.to)) {
        base.push(t(item.key));
        break;
      }
    }
    if (base.length === 0) base.push(resolveTitle(pathname));
    // 单叶模块(人事/文档)下的路由式子 tab:追加具体子页(人事 / 考勤)
    const sub = routeTitleEntries.find((e) => e.path === pathname);
    if (sub && base.length === 1) {
      const subTitle = t(sub.key);
      if (base[0] !== subTitle) base.push(subTitle);
    }
    return base;
  })();

  return (
    <Box className="app-section" data-section={section}>
      <MantineAppShell
        layout="alt"
        header={{ height: 56 }}
        navbar={{
          width: 210,
          breakpoint: "sm",
          collapsed: { mobile: !opened }
        }}
        padding={0}
        styles={{
          header: {
            background: "var(--app-surface)",
            border: "none",
            boxShadow: "0 1px 4px rgba(0, 21, 41, 0.08)"
          },
          navbar: {
            background: "var(--side-bg)",
            border: "none"
          },
          main: {
            background: "var(--app-bg)"
          }
        }}
      >
        <MantineAppShell.Header>
          <Group h="100%" px="md" justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
              {crumbs.map((c, i) => (
                <Text
                  key={i}
                  size="sm"
                  fw={i === crumbs.length - 1 ? 600 : 400}
                  c={i === crumbs.length - 1 ? "var(--mantine-color-text)" : "var(--app-muted)"}
                >
                  {i > 0 ? `/ ${c}` : c}
                </Text>
              ))}
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

        <MantineAppShell.Navbar p={0}>
          <Group gap="sm" h={56} wrap="nowrap" className="app-brand-row">
            <Box className="app-brand-mark">bH</Box>
            <Text fw={800} size="lg" lh={1} c="#fff">
              BusinessHub
            </Text>
          </Group>
          {navItems.map((item) =>
            "children" in item ? (
              <NavLink
                key={item.key}
                label={t(item.key)}
                childrenOffset={0}
                defaultOpened={item.defaultOpened}
                active={item.children.some((child) => isActivePath(child.to))}
                className="app-nav-link"
              >
                {item.children.map((child) => (
                  <NavLink
                    key={child.to}
                    component={RouterNavLink}
                    to={child.to}
                    label={t(child.key)}
                    onClick={toggle}
                    active={isActivePath(child.to)}
                    className="app-nav-link app-nav-sub"
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
                active={isActivePath(item.to)}
                className="app-nav-link"
              />
            )
          )}
        </MantineAppShell.Navbar>

        <MantineAppShell.Main>
          <TagsView views={views} activePath={pathname} onClose={closeTag} />
          {/* element-admin .app-container:padding 20px,内容铺满 */}
          <Box p="lg">
            <Outlet />
          </Box>
        </MantineAppShell.Main>
      </MantineAppShell>
    </Box>
  );
}
