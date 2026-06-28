import { ActionIcon, Group, Loader, SimpleGrid, TextInput, Textarea, Tooltip } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateText } from "../api/translate";

type Placeholder = string | { zh?: string; en?: string };

export type BilingualInputProps = {
  label: string;
  valueZh: string;
  valueEn: string;
  onChangeZh: (value: string) => void;
  onChangeEn: (value: string) => void;
  multiline?: boolean | undefined;
  required?: boolean | undefined;
  placeholder?: Placeholder;
  error?: string | undefined;
};

function placeholderFor(placeholder: Placeholder | undefined, lang: "zh" | "en") {
  if (!placeholder) return undefined;
  return typeof placeholder === "string" ? placeholder : placeholder[lang];
}

export function BilingualInput({
  label,
  valueZh,
  valueEn,
  onChangeZh,
  onChangeEn,
  multiline,
  required,
  placeholder,
  error
}: BilingualInputProps) {
  const { t } = useTranslation();
  const [loadingTarget, setLoadingTarget] = useState<"zh" | "en" | null>(null);

  const translate = async (source: "zh" | "en", force: boolean) => {
    const sourceText = source === "zh" ? valueZh.trim() : valueEn.trim();
    const target = source === "zh" ? "en" : "zh";
    const targetText = target === "zh" ? valueZh.trim() : valueEn.trim();

    if (!sourceText || (!force && targetText) || loadingTarget) return;

    setLoadingTarget(target);
    try {
      const translated = await translateText(sourceText, target);
      if (!translated) return;
      if (target === "zh") onChangeZh(translated);
      else onChangeEn(translated);
    } finally {
      setLoadingTarget(null);
    }
  };

  const common = {
    ...(required !== undefined ? { required } : {}),
    ...(error !== undefined ? { error } : {})
  };
  const zhPlaceholder = placeholderFor(placeholder, "zh");
  const enPlaceholder = placeholderFor(placeholder, "en");

  const zhInput = multiline ? (
    <Textarea
      {...common}
      label={`${label} · ${t("bilingual.zh")}`}
      minRows={3}
      autosize
      value={valueZh}
      {...(zhPlaceholder !== undefined ? { placeholder: zhPlaceholder } : {})}
      onChange={(event) => onChangeZh(event.currentTarget.value)}
      onBlur={() => void translate("zh", false)}
      rightSection={loadingTarget === "en" ? <Loader size={16} /> : null}
    />
  ) : (
    <TextInput
      {...common}
      label={`${label} · ${t("bilingual.zh")}`}
      value={valueZh}
      {...(zhPlaceholder !== undefined ? { placeholder: zhPlaceholder } : {})}
      onChange={(event) => onChangeZh(event.currentTarget.value)}
      onBlur={() => void translate("zh", false)}
      rightSection={loadingTarget === "en" ? <Loader size={16} /> : null}
    />
  );

  const enInput = multiline ? (
    <Textarea
      {...common}
      label={`${label} · ${t("bilingual.en")}`}
      minRows={3}
      autosize
      value={valueEn}
      {...(enPlaceholder !== undefined ? { placeholder: enPlaceholder } : {})}
      onChange={(event) => onChangeEn(event.currentTarget.value)}
      onBlur={() => void translate("en", false)}
      rightSection={loadingTarget === "zh" ? <Loader size={16} /> : null}
    />
  ) : (
    <TextInput
      {...common}
      label={`${label} · ${t("bilingual.en")}`}
      value={valueEn}
      {...(enPlaceholder !== undefined ? { placeholder: enPlaceholder } : {})}
      onChange={(event) => onChangeEn(event.currentTarget.value)}
      onBlur={() => void translate("en", false)}
      rightSection={loadingTarget === "zh" ? <Loader size={16} /> : null}
    />
  );

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <div style={{ flex: 1 }}>{zhInput}</div>
        <Tooltip label={loadingTarget === "en" ? t("bilingual.translating") : t("bilingual.retranslate")}>
          <ActionIcon
            variant="light"
            aria-label={t("bilingual.retranslate")}
            onClick={() => void translate("zh", true)}
            disabled={!valueZh.trim() || Boolean(loadingTarget)}
          >
            ↻
          </ActionIcon>
        </Tooltip>
      </Group>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <div style={{ flex: 1 }}>{enInput}</div>
        <Tooltip label={loadingTarget === "zh" ? t("bilingual.translating") : t("bilingual.retranslate")}>
          <ActionIcon
            variant="light"
            aria-label={t("bilingual.retranslate")}
            onClick={() => void translate("en", true)}
            disabled={!valueEn.trim() || Boolean(loadingTarget)}
          >
            ↻
          </ActionIcon>
        </Tooltip>
      </Group>
    </SimpleGrid>
  );
}
