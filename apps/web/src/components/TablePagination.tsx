import { Group, Pagination, Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

type TablePaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
};

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS
}: TablePaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const minPageSize = Math.min(...pageSizeOptions);
  const showPagination = totalPages > 1 || total > minPageSize;

  if (!showPagination) {
    return null;
  }

  return (
    <Group justify="flex-end" mt={30}>
      <Text size="sm">{t("common.totalCount", { count: total, defaultValue: `共 ${total} 条` })}</Text>
      <Select
        w={110}
        data={pageSizeOptions.map((option) => ({
          value: String(option),
          label: t("common.pageSize", { count: option, defaultValue: `${option} 条/页` })
        }))}
        value={String(pageSize)}
        onChange={(value) => {
          if (value) {
            onPageSizeChange(Number(value));
          }
        }}
        allowDeselect={false}
      />
      {totalPages > 1 ? <Pagination total={totalPages} value={page} onChange={onPageChange} /> : null}
    </Group>
  );
}
