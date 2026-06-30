import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(100).optional()
});

export function getPagination(query: { page?: number | undefined; page_size?: number | undefined }) {
  const page = query.page ?? 1;
  const pageSize = query.page_size ?? 20;

  return {
    paginate: query.page !== undefined,
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}
