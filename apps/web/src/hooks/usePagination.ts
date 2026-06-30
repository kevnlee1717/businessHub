import { useState } from "react";

export function usePagination(defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  function setPageSize(nextPageSize: number) {
    setPageSizeState(nextPageSize);
    setPage(1);
  }

  return {
    page,
    pageSize,
    setPage,
    setPageSize
  };
}
