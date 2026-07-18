import { Box, Tabs } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { MlkCouplesTab } from "./MlkCouplesTab";
import { MlkInvestorsTab } from "./MlkInvestorsTab";
import { MlkManagersTab } from "./MlkManagersTab";
import { MlkStoresTab } from "./MlkStoresTab";

type MlkTab = "stores" | "investors" | "couples" | "managers";

function isMlkTab(value: string | null): value is MlkTab {
  return value === "stores" || value === "investors" || value === "couples" || value === "managers";
}

export function MlkLayoutPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = isMlkTab(searchParams.get("tab")) ? searchParams.get("tab") : "stores";

  function setTab(value: string | null) {
    if (!isMlkTab(value)) return;
    setSearchParams(value === "stores" ? {} : { tab: value });
  }

  return (
    <Box p="md">
      <Tabs value={activeTab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="stores">{t("mlk.tabs.stores")}</Tabs.Tab>
          <Tabs.Tab value="investors">{t("mlk.tabs.investors")}</Tabs.Tab>
          <Tabs.Tab value="couples">{t("mlk.tabs.couples")}</Tabs.Tab>
          <Tabs.Tab value="managers">{t("mlk.tabs.managers")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="stores">
          <MlkStoresTab />
        </Tabs.Panel>
        <Tabs.Panel value="investors">
          <MlkInvestorsTab />
        </Tabs.Panel>
        <Tabs.Panel value="couples">
          <MlkCouplesTab />
        </Tabs.Panel>
        <Tabs.Panel value="managers">
          <MlkManagersTab />
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
}
