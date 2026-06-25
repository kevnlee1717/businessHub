import { SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  return (
    <SegmentedControl
      aria-label={t("common.language")}
      size="xs"
      value={i18n.language === "en" ? "en" : "zh"}
      data={[
        { value: "zh", label: "中" },
        { value: "en", label: "EN" }
      ]}
      onChange={(value) => {
        window.localStorage.setItem("lang", value);
        void i18n.changeLanguage(value);
      }}
    />
  );
}
