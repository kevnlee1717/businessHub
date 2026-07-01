import { Alert, Group, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listBusinesses } from "../../api/businessSchemes";
import { BusinessDetailPage } from "./BusinessDetailPage";

// 按业务 code(ep/ica/diploma/english/wsq)渲染该业务的收费&分成方案(嵌入版 BusinessDetailPage)。
// 供各业务板块的"收费&分成"tab 复用。
export function BusinessSchemePanel({ businessCode }: { businessCode: string }) {
  const { t } = useTranslation();
  const businessesQuery = useQuery({
    queryKey: ["business-finance", "businesses", "all"],
    queryFn: () => listBusinesses({ page_size: 200 })
  });

  if (businessesQuery.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (businessesQuery.error) {
    return (
      <Alert color="red" variant="light">
        {businessesQuery.error instanceof Error ? businessesQuery.error.message : t("common.unknown_error")}
      </Alert>
    );
  }

  const business = (businessesQuery.data?.businesses ?? []).find((item) => item.code === businessCode);
  if (!business) {
    return (
      <Alert color="yellow" variant="light">
        {t("businessFinance.noSchemeForBusiness")}
      </Alert>
    );
  }

  return <BusinessDetailPage businessId={business.id} embedded />;
}
