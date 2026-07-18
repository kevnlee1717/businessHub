import { Alert, Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MlkCoupleStatus, MlkEpStatus, MlkKycStatus, MlkManagerStatus, MlkPrStatus, MlkServiceTier, MlkStatus } from "../../../api/mlk";

export function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

export function dateInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function storeStatusColor(status: MlkStatus) {
  switch (status) {
    case "intent":
      return "gray";
    case "selected":
    case "incorporated":
      return "blue";
    case "lease_signed":
    case "renovation":
      return "yellow";
    case "open":
      return "green";
    case "closed":
      return "red";
    default:
      return "gray";
  }
}

export function tierColor(tier: MlkServiceTier) {
  return tier === "tier2" ? "violet" : "blue";
}

export function prColor(status: MlkPrStatus | MlkEpStatus) {
  if (status === "granted") return "green";
  if (status === "applied") return "blue";
  return "gray";
}

export function kycColor(status: MlkKycStatus) {
  return status === "done" ? "green" : "yellow";
}

export function coupleStatusColor(status: MlkCoupleStatus) {
  if (status === "active") return "green";
  if (status === "exited") return "red";
  return "gray";
}

export function managerStatusColor(status: MlkManagerStatus) {
  if (status === "active") return "green";
  if (status === "exited") return "red";
  return "gray";
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <Badge color={color} variant="light">
      {label}
    </Badge>
  );
}
