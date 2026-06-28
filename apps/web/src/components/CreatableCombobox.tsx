import { Alert, Box, Combobox, InputBase, Loader, useCombobox } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type Option = { value: string; label: string };

function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <Alert color="red" variant="light">
      {error instanceof Error ? error.message : t("common.unknown_error")}
    </Alert>
  ) : null;
}

export function CreatableCombobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  onCreate,
  creating,
  disabled,
  createDisabled,
  error
}: {
  label: string;
  placeholder?: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<string>;
  creating?: boolean;
  disabled?: boolean;
  createDisabled?: boolean;
  error?: unknown;
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });
  const selected = options.find((option) => option.value === (value ?? ""));
  const [search, setSearch] = useState(selected?.label ?? "");
  const [createError, setCreateError] = useState<unknown>(null);
  const [internalCreating, setInternalCreating] = useState(false);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
  const hasExactMatch = options.some((option) => option.label.trim().toLowerCase() === normalizedSearch);
  const canCreate = search.trim().length > 0 && !hasExactMatch;
  const isCreating = Boolean(creating || internalCreating);

  useEffect(() => {
    setSearch(selected?.label ?? "");
  }, [selected?.label]);

  const handleSubmit = async (submittedValue: string) => {
    if (submittedValue.startsWith("__create__:")) {
      const name = submittedValue.slice("__create__:".length).trim();
      if (!name || createDisabled) return;
      setInternalCreating(true);
      try {
        const createdId = await onCreate(name);
        onChange(createdId);
        setSearch(name);
        setCreateError(null);
        combobox.closeDropdown();
      } catch (createFailure) {
        setCreateError(createFailure);
      } finally {
        setInternalCreating(false);
      }
      return;
    }

    const option = options.find((item) => item.value === submittedValue);
    if (option) {
      onChange(option.value);
      setSearch(option.label);
      setCreateError(null);
      combobox.closeDropdown();
    }
  };

  return (
    <Box w="100%">
      <Combobox store={combobox} onOptionSubmit={handleSubmit}>
        <Combobox.Target>
          <InputBase
            label={label}
            placeholder={placeholder ?? ""}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              combobox.openDropdown();
            }}
            onClick={() => combobox.openDropdown()}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => {
              combobox.closeDropdown();
              setSearch(selected?.label ?? search);
            }}
            disabled={Boolean(disabled)}
            rightSection={isCreating ? <Loader size={16} /> : <Combobox.Chevron />}
            rightSectionPointerEvents="none"
            error={error ? String(error) : undefined}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {filteredOptions.map((option) => (
              <Combobox.Option value={option.value} key={option.value}>
                {option.label}
              </Combobox.Option>
            ))}
            {canCreate ? (
              <Combobox.Option value={`__create__:${search.trim()}`} disabled={createDisabled || isCreating}>
                + 创建 "{search.trim()}"
              </Combobox.Option>
            ) : null}
            {filteredOptions.length === 0 && !canCreate ? <Combobox.Empty>无匹配项</Combobox.Empty> : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      <ErrorAlert error={createError} />
    </Box>
  );
}
