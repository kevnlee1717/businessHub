import {
  ActionIcon,
  Combobox,
  Group,
  InputBase,
  Loader,
  Text,
  useCombobox
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createDocumentCategory,
  listDocumentCategories,
  type DocumentCategory
} from "../api/dms";

type CategorySelectProps = {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
};

const categoryQueryKey = ["document-categories"] as const;

function displayName(category: DocumentCategory) {
  return category.name_en ? `${category.name} / ${category.name_en}` : category.name;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function CategorySelect({ value, onChange, placeholder }: CategorySelectProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption()
  });

  const categoriesQuery = useQuery({
    queryKey: categoryQueryKey,
    queryFn: listDocumentCategories
  });

  const createCategoryMutation = useMutation({
    mutationFn: createDocumentCategory,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: categoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["documents", "categories"] })
      ]);
      onChange(data.category.id);
      setSearch(displayName(data.category));
      setError(null);
      combobox.closeDropdown();
    },
    onError: (mutationError) => {
      setError(mutationError instanceof Error ? mutationError.message : t("categorySelect.createError"));
    }
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === value) ?? null,
    [categories, value]
  );
  const selectedLabel = selectedCategory ? displayName(selectedCategory) : "";
  const trimmedSearch = search.trim();
  const normalizedSearch = normalizeName(trimmedSearch);
  const filteredCategories = useMemo(() => {
    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) => {
      const name = normalizeName(category.name);
      const nameEn = normalizeName(category.name_en ?? "");
      return name.includes(normalizedSearch) || nameEn.includes(normalizedSearch);
    });
  }, [categories, normalizedSearch]);
  const hasExactCategory = categories.some((category) => {
    return normalizeName(category.name) === normalizedSearch || normalizeName(category.name_en ?? "") === normalizedSearch;
  });
  const canCreate = Boolean(trimmedSearch) && !hasExactCategory;
  const placeholderText = placeholder ?? t("categorySelect.placeholder");
  const isLoading = categoriesQuery.isLoading || createCategoryMutation.isPending;

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
    if (!canCreate || createCategoryMutation.isPending) {
      return;
    }

    await createCategoryMutation.mutateAsync({ name: trimmedSearch });
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

        const nextCategory = categories.find((category) => category.id === optionValue) ?? null;
        onChange(optionValue);
        setSearch(nextCategory ? displayName(nextCategory) : "");
        setError(null);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          value={search}
          placeholder={placeholderText}
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

          {filteredCategories.map((category) => (
            <Combobox.Option value={category.id} key={category.id}>
              {displayName(category)}
            </Combobox.Option>
          ))}

          {canCreate ? (
            <Combobox.Option value="__create__" disabled={createCategoryMutation.isPending}>
              + {t("categorySelect.create", { name: trimmedSearch })}
            </Combobox.Option>
          ) : null}

          {!filteredCategories.length && !canCreate ? (
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
