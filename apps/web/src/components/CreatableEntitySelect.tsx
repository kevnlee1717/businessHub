import {
  ActionIcon,
  Combobox,
  Group,
  InputBase,
  Loader,
  Text,
  useCombobox
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type EntityOption = {
  value: string;
  label: string;
};

type CreatableEntitySelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  options: EntityOption[];
  onCreate?: (name: string) => Promise<string>;
  onRequestCreate?: (name: string) => void;
  placeholder?: string;
  loading?: boolean;
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function CreatableEntitySelect({
  value,
  onChange,
  options,
  onCreate,
  onRequestCreate,
  placeholder,
  loading
}: CreatableEntitySelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const selectedLabel = selectedOption?.label ?? "";
  const trimmedSearch = search.trim();
  const normalizedSearch = normalizeName(trimmedSearch);
  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) => normalizeName(option.label).includes(normalizedSearch));
  }, [normalizedSearch, options]);
  const hasExactOption = options.some((option) => normalizeName(option.label) === normalizedSearch);
  const canCreate = Boolean(trimmedSearch) && !hasExactOption;
  const isLoading = Boolean(loading) || creating;

  useEffect(() => {
    if (!combobox.dropdownOpened) {
      setSearch(selectedLabel);
    }
  }, [combobox.dropdownOpened, selectedLabel]);

  function handleClear() {
    onChange(null);
    setSearch("");
    setError(null);
    combobox.closeDropdown();
  }

  async function handleCreate() {
    if (!canCreate || creating) {
      return;
    }

    if (onRequestCreate) {
      onRequestCreate(trimmedSearch);
      setSearch(selectedLabel);
      setError(null);
      combobox.closeDropdown();
      return;
    }

    if (!onCreate) {
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const id = await onCreate(trimmedSearch);
      onChange(id);
      setSearch("");
      combobox.closeDropdown();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t("creatableSelect.createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(optionValue) => {
        if (optionValue === "__clear__") {
          handleClear();
          return;
        }

        if (optionValue === "__create__") {
          void handleCreate();
          return;
        }

        const nextOption = options.find((option) => option.value === optionValue) ?? null;
        onChange(optionValue);
        setSearch(nextOption?.label ?? "");
        setError(null);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          value={search}
          placeholder={placeholder ?? t("creatableSelect.placeholder")}
          rightSection={
            <Group gap={4} wrap="nowrap">
              {isLoading ? <Loader size={14} /> : null}
              {value ? (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label={t("common.clear")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleClear}
                >
                  x
                </ActionIcon>
              ) : null}
              <Combobox.Chevron />
            </Group>
          }
          rightSectionWidth={value || isLoading ? 64 : 32}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setError(null);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(selectedLabel);
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={240} style={{ overflowY: "auto" }}>
          {value ? <Combobox.Option value="__clear__">{t("categorySelect.clear")}</Combobox.Option> : null}

          {filteredOptions.map((option) => (
            <Combobox.Option value={option.value} key={option.value}>
              {option.label}
            </Combobox.Option>
          ))}

          {canCreate ? (
            <Combobox.Option value="__create__" disabled={creating}>
              + {t("categorySelect.create", { name: trimmedSearch })}
            </Combobox.Option>
          ) : null}

          {!filteredOptions.length && !canCreate ? (
            <Combobox.Empty>{t("categorySelect.empty")}</Combobox.Empty>
          ) : null}

          {error ? (
            <Text size="xs" c="red" px="xs" py={4}>
              {error}
            </Text>
          ) : null}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
