import { Text } from "@mantine/core";

export function formatSgd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0
  }).format(value);
}

export function MlkMoneyText({ value, fw }: { value: number | null | undefined; fw?: number }) {
  return <Text {...(fw !== undefined ? { fw } : {})}>{formatSgd(value)}</Text>;
}
