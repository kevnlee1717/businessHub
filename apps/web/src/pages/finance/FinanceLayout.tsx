import { Stack, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const tabs = [
  { value: "billing", path: "/finance/billing", labelKey: "finance.tabs.billing" },
  { value: "receivables-ledger", path: "/finance/receivables-ledger", labelKey: "finance.tabs.receivablesLedger" },
  { value: "ledger", path: "/finance/ledger", labelKey: "finance.tabs.ledger" },
  { value: "bank-accounts", path: "/finance/bank-accounts", labelKey: "finance.tabs.bankAccounts" },
  { value: "reconcile", path: "/finance/reconcile", labelKey: "finance.tabs.reconcile" }
] as const;

export function FinanceLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = tabs.find((tab) => location.pathname.startsWith(tab.path))?.value ?? "billing";

  return (
    <Stack gap="lg">
      <Tabs value={currentTab} onChange={(value) => value && navigate(`/finance/${value}`)}>
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
