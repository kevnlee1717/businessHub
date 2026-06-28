import { tabs as documentsTabs } from "../pages/documents/DocumentsLayout";
import { tabs as financeTabs } from "../pages/finance/FinanceLayout";
import { tabs as hrTabs } from "../pages/hr/HrLayout";
import { tabs as settingsTabs } from "../pages/settings/SettingsLayout";

/**
 * 路由式子 tab 的「路径 → 标题 i18n key」汇总。
 * 让标签导航/面包屑能显示具体子页(如「考勤」)而非父级(「人事」)。
 * 数据源就是各 Layout 自己的 tabs 定义,避免重复/漂移。
 */
export const routeTitleEntries: { path: string; key: string }[] = [
  ...hrTabs,
  ...settingsTabs,
  ...documentsTabs,
  ...financeTabs
].map((tab) => ({ path: tab.path, key: tab.labelKey }));
