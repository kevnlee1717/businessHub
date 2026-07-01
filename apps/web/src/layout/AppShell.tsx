import {
  AppShell as MantineAppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Group,
  Indicator,
  Menu,
  Modal,
  NavLink,
  Stack,
  Text,
  UnstyledButton
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink as RouterNavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { LanguageToggle } from "../components/LanguageToggle";
import { getRecruitmentDashboard, recruitmentKeys } from "../api/recruitment";
import { routeTitleEntries } from "./routeTitles";
import { TabTitleContext } from "./tabTitle";
import { TagsView, type VisitedView } from "./TagsView";

type NavItem = {
  to?: string;
  key: string;
  perm?: string;
  defaultOpened?: boolean;
  children?: NavItem[];
};

const navItems: NavItem[] = [
  { to: "/", key: "nav.dashboard" },
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
      { to: "/education/teachers", key: "nav.teachers", perm: "education.view" }
      // 「学院收款」已并入 成人大专 的"收款统计"tab,不再作为独立菜单项
    ]
  },
  {
    key: "nav.franchise",
    perm: "franchise.view",
    defaultOpened: false,
    children: [
      { to: "/franchise/tracking", key: "nav.franchise_tracking", perm: "franchise.view" },
      { to: "/franchise/property", key: "nav.franchise_property", perm: "franchise.view" },
      { to: "/franchise/fnb", key: "nav.franchise_fnb", perm: "franchise.view" }
    ]
  },
  { to: "/documents", key: "nav.documents", perm: "document.view" },
  { to: "/brochure", key: "nav.brochure", perm: "brochure.view" },
  { to: "/recruitment", key: "nav.recruitment", perm: "recruitment.view" },
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
      // 「分成方案」已并入各业务的"收费&分成"tab,不再作为独立菜单项;仅保留分成人员管理
      { to: "/business-finance/parties", key: "nav.deal_parties", perm: "finance.view" },
      { to: "/business-finance/external-parties", key: "nav.external_parties", perm: "finance.view" }
    ]
  },
  { to: "/hr", key: "nav.hr" },
  {
    key: "nav.settings",
    perm: "settings.manage",
    defaultOpened: false,
    children: [
      { to: "/settings/companies", key: "settings.tabs.companies", perm: "settings.manage" },
      { to: "/settings/permissions", key: "nav.permissions", perm: "settings.manage" },
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
  const recruitmentDashboardQuery = useQuery({
    queryKey: recruitmentKeys.dashboard(),
    queryFn: getRecruitmentDashboard,
    enabled: can("recruitment.view"),
    refetchInterval: 60000
  });
  const recruitmentTodoCount = recruitmentDashboardQuery.data?.dashboard.overdue.count ?? 0;

  function isActivePath(to: string) {
    return to === "/" ? pathname === "/" : pathname.startsWith(to);
  }

  function navLabel(item: NavItem) {
    if (item.key === "nav.recruitment" && recruitmentTodoCount > 0) {
      return (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm">{t(item.key)}</Text>
          <Badge color="red" size="xs">{recruitmentTodoCount}</Badge>
        </Group>
      );
    }

    return t(item.key);
  }

  const titleEntries = useMemo(() => {
    const out: { to: string; key: string }[] = [];
    for (const item of navItems) {
      if (item.children) {
        item.children.forEach((child) => {
          if (child.to) out.push({ to: child.to, key: child.key });
        });
      } else if (item.to) {
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

  // 供具体页面(如案件详情)在拿到数据后回填对应标签的标题;标签不存在则忽略。
  const setTabTitle = useCallback((path: string, title: string) => {
    setViews((prev) => prev.map((v) => (v.path === path ? { ...v, title } : v)));
  }, []);

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

  // 关闭除固定标签(/)和目标标签外的所有标签
  function closeOtherTags(path: string) {
    setViews((prev) => prev.filter((v) => v.path === "/" || v.path === path));
    if (pathname !== "/" && pathname !== path) navigate(path);
  }

  // 关闭目标标签右侧的所有标签
  function closeRightTags(path: string) {
    setViews((prev) => {
      const idx = prev.findIndex((v) => v.path === path);
      if (idx < 0) return prev;
      const curIdx = prev.findIndex((v) => v.path === pathname);
      if (curIdx > idx) navigate(path);
      return prev.filter((_, i) => i <= idx);
    });
  }

  // 关闭全部标签,只保留固定标签并回到首页
  function closeAllTags() {
    setViews([{ path: "/", title: t("nav.dashboard") }]);
    if (pathname !== "/") navigate("/");
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  // 顶栏面包屑(element-admin:navbar 只放面包屑,不放 app 标题)
  const crumbs: string[] = (() => {
    const base: string[] = [];
    for (const item of navItems) {
      if (item.children) {
        const child = item.children.find((c) => c.to && isActivePath(c.to));
        if (child) {
          base.push(t(item.key), t(child.key));
          break;
        }
      } else if (item.to && isActivePath(item.to)) {
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
      <Modal
        opened={Boolean(user?.must_change_password)}
        onClose={() => undefined}
        title="首次登录，请先修改密码 / First login: please change your password"
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="var(--app-muted)">
            为了账号安全，首次登录需修改初始密码后才能使用系统。
            <br />
            For your account security, please change the initial password before using the system.
          </Text>
          <ChangePasswordForm forced />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" size="xs" onClick={handleLogout}>
              退出登录 / Log out
            </Button>
          </Group>
        </Stack>
      </Modal>
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
            border: "none",
            display: "flex",
            flexDirection: "column"
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
              <LanguageToggle />
              <Menu position="bottom-end" shadow="md" width={180}>
                <Menu.Target>
                  <UnstyledButton>
                    <Indicator color="red" size={10} offset={4} disabled={!user?.must_change_password} withBorder>
                      <Avatar src={user?.avatar ?? null} radius="xl" size={32} color="blue">
                        {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                      </Avatar>
                    </Indicator>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => navigate("/account/profile")}>个人资料</Menu.Item>
                  <Menu.Item onClick={() => navigate("/account/password")}>修改密码</Menu.Item>
                  <Menu.Item onClick={handleLogout}>{t("auth.logout")}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </MantineAppShell.Header>

        <MantineAppShell.Navbar p={0}>
          <Group gap="sm" h={56} wrap="nowrap" className="app-brand-row">
            <img src="/founder-logo.png" alt="BusinessHub" className="app-brand-logo" />
            <Text fw={800} size="lg" lh={1} c="#fff">
              BusinessHub
            </Text>
          </Group>
          <Box className="app-nav-scroll">
          {visibleNavItems.map((item) =>
            "children" in item ? (
              <NavLink
                key={item.key}
                label={navLabel(item)}
                childrenOffset={0}
                defaultOpened={item.defaultOpened ?? false}
                active={item.children?.some((child) => (child.to ? isActivePath(child.to) : false))}
                className="app-nav-link"
              >
                {item.children?.map((child) => (
                  <NavLink
                    key={child.to}
                    component={RouterNavLink}
                    to={child.to ?? "/"}
                    label={navLabel(child)}
                    onClick={toggle}
                    active={child.to ? isActivePath(child.to) : false}
                    className="app-nav-link app-nav-sub"
                  />
                ))}
              </NavLink>
            ) : (
              <NavLink
                key={item.to}
                component={RouterNavLink}
                to={item.to ?? "/"}
                label={navLabel(item)}
                onClick={toggle}
                active={item.to ? isActivePath(item.to) : false}
                className="app-nav-link"
              />
            )
          )}
          </Box>
        </MantineAppShell.Navbar>

        <MantineAppShell.Main>
          <TagsView
            views={views}
            activePath={pathname}
            onClose={closeTag}
            onCloseOthers={closeOtherTags}
            onCloseRight={closeRightTags}
            onCloseAll={closeAllTags}
          />
          {/* element-admin .app-container:padding 20px,内容铺满 */}
          <Box p="lg">
            <TabTitleContext.Provider value={setTabTitle}>
              <Outlet />
            </TabTitleContext.Provider>
          </Box>
        </MantineAppShell.Main>
      </MantineAppShell>
    </Box>
  );
}
