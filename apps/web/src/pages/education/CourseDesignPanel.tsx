import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  FileInput,
  Group,
  Image,
  List,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  courseDesignTaskCreateSchema,
  courseDesignTaskUpdateSchema,
  type CourseDesignTaskCreateInput,
  type CourseDesignTaskUpdateInput
} from "@bh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import {
  createCourseDesignItem,
  createCourseDesignTask,
  deleteCourseDesignItem,
  deleteCourseDesignTask,
  listCourseDesignItems,
  listCourseDesignTasks,
  updateCourseDesignItem,
  updateCourseDesignTask,
  uploadCourseDesignItemImage,
  type CourseDesignItem,
  type CourseDesignSection,
  type CourseDesignTask,
  type CourseDesignTaskStatus
} from "../../api/education";
import { useCan } from "../../auth/permissions";

/**
 * 成人英语 · 课程设计 tab
 *
 * 「活的设计文档 + 进度看板」。
 * - §0 设计进度：DB 驱动（course_design_tasks 表 + /course-design-tasks API），
 *   有 education.manage 权限可就地新增/编辑/删除/改状态；负责人小雨在此更新进度。
 * - §1~§4 设计内容：DB 驱动（course_design_items 表 + /course-design-items API），
 *   小雨可新增、编辑、删除、上传界面截图，并将条目审核定稿后锁定。
 *
 * 界面稿：优先显示上传图片，其次回落到 apps/web/public/course-design/<slug>.svg。
 */

type Status = CourseDesignTaskStatus;
type TaskFormValues = {
  title?: string | undefined;
  owner?: string | undefined;
  status?: CourseDesignTaskStatus | undefined;
  deliverable?: string | null | undefined;
};

type SectionField = {
  k: string;
  label: string;
  area?: boolean;
};

type ItemModalState = {
  section: CourseDesignSection;
  editingItem: CourseDesignItem | null;
  values: Record<string, string>;
};

const courseDesignTasksQueryKey = ["education", "course-design-tasks"] as const;
const courseDesignItemsQueryKey = ["education", "course-design-items"] as const;

const SECTIONS: CourseDesignSection[] = ["level", "pricing", "addon", "daily", "tier", "ref_app", "screen"];

const SECTION_LABELS: Record<CourseDesignSection, string> = {
  level: "分级体系",
  pricing: "课程命名 & 收费",
  addon: "增值服务",
  daily: "每日任务",
  tier: "程度区分",
  ref_app: "参考 App",
  screen: "关键界面"
};

const SECTION_FIELDS: Record<CourseDesignSection, SectionField[]> = {
  level: [
    { k: "code", label: "级别" },
    { k: "name", label: "名称" },
    { k: "cefr", label: "CEFR" },
    { k: "who", label: "目标人群" },
    { k: "focus", label: "训练重心" }
  ],
  pricing: [
    { k: "code", label: "级别" },
    { k: "market", label: "营销课名" },
    { k: "monthly", label: "月费(S$)" },
    { k: "quarter", label: "季付(S$)" },
    { k: "yearly", label: "年付(S$)" },
    { k: "reason", label: "定价理由", area: true }
  ],
  addon: [
    { k: "name", label: "名称" },
    { k: "price", label: "价格" },
    { k: "note", label: "说明", area: true }
  ],
  daily: [
    { k: "icon", label: "图标" },
    { k: "step", label: "环节" },
    { k: "desc", label: "说明", area: true },
    { k: "ref", label: "借鉴" }
  ],
  tier: [
    { k: "tier", label: "档位" },
    { k: "detail", label: "说明", area: true }
  ],
  ref_app: [
    { k: "name", label: "App" },
    { k: "borrow", label: "借鉴点", area: true }
  ],
  screen: [
    { k: "no", label: "序号" },
    { k: "name", label: "界面名" },
    { k: "slug", label: "slug" },
    { k: "purpose", label: "用途", area: true },
    { k: "ref", label: "借鉴来源" }
  ]
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  todo: { label: "待办", color: "gray" },
  doing: { label: "进行中", color: "blue" },
  review: { label: "待评审", color: "yellow" },
  done: { label: "已交付", color: "green" }
};

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({
  value,
  label: meta.label
}));

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <Badge color={meta.color} variant="light">
      {meta.label}
    </Badge>
  );
}

function getTaskDefaultValues(task?: CourseDesignTask | null): TaskFormValues {
  return {
    title: task?.title ?? "",
    owner: task?.owner ?? "小雨",
    status: task?.status ?? "todo",
    deliverable: task?.deliverable ?? ""
  };
}

function SectionCard({
  index,
  title,
  subtitle,
  children
}: {
  index: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group gap="sm" align="baseline">
          <ThemeIcon variant="light" radius="md" size="lg">
            <Text fw={700}>{index}</Text>
          </ThemeIcon>
          <Box>
            <Title order={3}>{title}</Title>
            {subtitle ? (
              <Text c="dimmed" size="sm">
                {subtitle}
              </Text>
            ) : null}
          </Box>
        </Group>
        <Divider />
        {children}
      </Stack>
    </Paper>
  );
}

function fieldValue(item: CourseDesignItem, key: string) {
  return String(item.fields?.[key] ?? "");
}

function fieldValues(item: CourseDesignItem | null, section: CourseDesignSection) {
  return Object.fromEntries(SECTION_FIELDS[section].map((field) => [field.k, item ? fieldValue(item, field.k) : ""]));
}

function formatItemError(error: unknown) {
  if (error instanceof Error && error.message === "item_locked") {
    return "该条已定稿并锁定，请先『撤销定稿』再修改/删除";
  }
  return error instanceof Error ? error.message : "未知错误";
}

function CourseDesignImage({
  slug,
  imageUrl,
  height,
  onClick
}: {
  slug: string;
  imageUrl?: string | null | undefined;
  height: number;
  onClick?: () => void;
}) {
  const sources = [imageUrl, slug ? `/course-design/${slug}.svg` : null].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);

  if (idx >= sources.length) {
    return (
      <Box
        style={{
          height,
          borderRadius: 8,
          border: "1px dashed var(--mantine-color-gray-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--mantine-color-gray-0)"
        }}
      >
        <Stack gap={2} align="center">
          <Text size="sm" c="dimmed">
            待上传界面稿
          </Text>
          <Text size="xs" c="dimmed">
            上传 png 或填写 slug 使用内置 svg
          </Text>
        </Stack>
      </Box>
    );
  }

  return (
    <Image
      src={sources[idx]}
      h={height}
      fit="contain"
      radius="sm"
      bg="var(--mantine-color-gray-0)"
      style={{ cursor: onClick ? "zoom-in" : undefined }}
      onError={() => setIdx((current) => current + 1)}
      onClick={onClick}
    />
  );
}

function EmptySection({ colSpan }: { colSpan?: number }) {
  if (colSpan) {
    return (
      <Table.Tr>
        <Table.Td colSpan={colSpan}>
          <Text ta="center" c="dimmed" py="lg">
            暂无，点「新增」添加
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  }
  return (
    <Text c="dimmed" size="sm">
      暂无，点「新增」添加
    </Text>
  );
}

export function CourseDesignPanel() {
  const queryClient = useQueryClient();
  const canManageEducation = useCan("education.manage");
  const canManage = canManageEducation;
  const [editingTask, setEditingTask] = useState<CourseDesignTask | null>(null);
  const [taskModalOpened, setTaskModalOpened] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [itemFormError, setItemFormError] = useState<string | null>(null);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const [openedMockup, setOpenedMockup] = useState<CourseDesignItem | null>(null);
  const [screenUploads, setScreenUploads] = useState<Record<string, File | null>>({});

  const tasksQuery = useQuery({
    queryKey: courseDesignTasksQueryKey,
    queryFn: listCourseDesignTasks
  });
  const itemsQuery = useQuery({
    queryKey: courseDesignItemsQueryKey,
    queryFn: listCourseDesignItems
  });
  const taskForm = useForm<TaskFormValues>({
    resolver: zodResolver(
      editingTask ? courseDesignTaskUpdateSchema : courseDesignTaskCreateSchema
    ) as Resolver<TaskFormValues>,
    defaultValues: getTaskDefaultValues()
  });
  const createTaskMutation = useMutation({
    mutationFn: createCourseDesignTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignTasksQueryKey });
      closeTaskModal();
    }
  });
  const updateTaskMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CourseDesignTaskUpdateInput }) => updateCourseDesignTask(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignTasksQueryKey });
      closeTaskModal();
    }
  });
  const updateTaskStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CourseDesignTaskStatus }) =>
      updateCourseDesignTask(id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignTasksQueryKey });
    }
  });
  const deleteTaskMutation = useMutation({
    mutationFn: deleteCourseDesignTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignTasksQueryKey });
    }
  });
  const createItemMutation = useMutation({
    mutationFn: createCourseDesignItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignItemsQueryKey });
      closeItemModal();
    }
  });
  const updateItemMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateCourseDesignItem>[1] }) =>
      updateCourseDesignItem(id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignItemsQueryKey });
      closeItemModal();
    }
  });
  const deleteItemMutation = useMutation({
    mutationFn: deleteCourseDesignItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: courseDesignItemsQueryKey });
    }
  });
  const uploadImageMutation = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadCourseDesignItemImage(id, file),
    onSuccess: async (_result, variables) => {
      setScreenUploads((current) => ({ ...current, [variables.id]: null }));
      await queryClient.invalidateQueries({ queryKey: courseDesignItemsQueryKey });
    }
  });

  const taskErrors = taskForm.formState.errors;
  const tasks = tasksQuery.data?.tasks ?? [];
  const isSavingTask = createTaskMutation.isPending || updateTaskMutation.isPending;
  const isSavingItem = createItemMutation.isPending || updateItemMutation.isPending;

  const itemsBySection = useMemo(() => {
    const grouped: Record<CourseDesignSection, CourseDesignItem[]> = {
      level: [],
      pricing: [],
      addon: [],
      daily: [],
      tier: [],
      ref_app: [],
      screen: []
    };
    for (const item of itemsQuery.data?.items ?? []) {
      grouped[item.section]?.push(item);
    }
    for (const section of SECTIONS) {
      grouped[section].sort(
        (a, b) => a.sort_order - b.sort_order || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return grouped;
  }, [itemsQuery.data?.items]);

  function openCreateTaskModal() {
    setEditingTask(null);
    setTaskFormError(null);
    taskForm.reset(getTaskDefaultValues());
    setTaskModalOpened(true);
  }

  function openEditTaskModal(task: CourseDesignTask) {
    setEditingTask(task);
    setTaskFormError(null);
    taskForm.reset(getTaskDefaultValues(task));
    setTaskModalOpened(true);
  }

  function closeTaskModal() {
    setTaskModalOpened(false);
    setEditingTask(null);
    setTaskFormError(null);
    taskForm.reset(getTaskDefaultValues());
  }

  function openCreateItemModal(section: CourseDesignSection) {
    setItemFormError(null);
    setItemModal({ section, editingItem: null, values: fieldValues(null, section) });
  }

  function openEditItemModal(item: CourseDesignItem) {
    setItemFormError(null);
    setItemModal({ section: item.section, editingItem: item, values: fieldValues(item, item.section) });
  }

  function closeItemModal() {
    setItemModal(null);
    setItemFormError(null);
  }

  const onTaskSubmit = taskForm.handleSubmit(async (values) => {
    setTaskFormError(null);

    try {
      const body = {
        title: values.title ?? "",
        owner: values.owner,
        status: values.status,
        deliverable: values.deliverable?.trim() ? values.deliverable : null
      };

      if (editingTask) {
        await updateTaskMutation.mutateAsync({ id: editingTask.id, body });
        return;
      }

      await createTaskMutation.mutateAsync(body as CourseDesignTaskCreateInput);
    } catch (error) {
      setTaskFormError(error instanceof Error ? error.message : "未知错误");
    }
  });

  async function handleStatusChange(task: CourseDesignTask, status: string | null) {
    if (!status || status === task.status) {
      return;
    }

    await updateTaskStatusMutation.mutateAsync({ id: task.id, status: status as CourseDesignTaskStatus });
  }

  async function handleDeleteTask(task: CourseDesignTask) {
    if (!window.confirm(`确认删除「${task.title}」？`)) {
      return;
    }

    try {
      await deleteTaskMutation.mutateAsync(task.id);
    } catch (error) {
      setTaskFormError(error instanceof Error ? error.message : "未知错误");
    }
  }

  async function submitItemForm() {
    if (!itemModal) return;
    setItemFormError(null);
    setItemActionError(null);

    try {
      if (itemModal.editingItem) {
        await updateItemMutation.mutateAsync({
          id: itemModal.editingItem.id,
          body: { fields: itemModal.values }
        });
        return;
      }

      const currentItems = itemsBySection[itemModal.section];
      const maxSortOrder = currentItems.reduce((max, item) => Math.max(max, item.sort_order), -1);
      await createItemMutation.mutateAsync({
        section: itemModal.section,
        fields: itemModal.values,
        sort_order: maxSortOrder + 1
      });
    } catch (error) {
      setItemFormError(formatItemError(error));
    }
  }

  async function handleItemStatus(item: CourseDesignItem, status: "draft" | "approved") {
    setItemActionError(null);
    try {
      await updateItemMutation.mutateAsync({ id: item.id, body: { status } });
    } catch (error) {
      setItemActionError(formatItemError(error));
    }
  }

  async function handleDeleteItem(item: CourseDesignItem) {
    const label = fieldValue(item, "name") || fieldValue(item, "code") || SECTION_LABELS[item.section];
    if (!window.confirm(`确认删除「${label}」？`)) return;

    setItemActionError(null);
    try {
      await deleteItemMutation.mutateAsync(item.id);
    } catch (error) {
      setItemActionError(formatItemError(error));
    }
  }

  async function handleMoveItem(section: CourseDesignSection, index: number, direction: -1 | 1) {
    const rows = itemsBySection[section];
    const current = rows[index];
    const target = rows[index + direction];
    if (!current || !target) return;

    setItemActionError(null);
    try {
      await Promise.all([
        updateCourseDesignItem(current.id, { sort_order: target.sort_order }),
        updateCourseDesignItem(target.id, { sort_order: current.sort_order })
      ]);
      await queryClient.invalidateQueries({ queryKey: courseDesignItemsQueryKey });
    } catch (error) {
      setItemActionError(formatItemError(error));
    }
  }

  async function handleUploadImage(item: CourseDesignItem) {
    const file = screenUploads[item.id];
    if (!file) return;

    setItemActionError(null);
    try {
      await uploadImageMutation.mutateAsync({ id: item.id, file });
    } catch (error) {
      setItemActionError(formatItemError(error));
    }
  }

  function addButton(section: CourseDesignSection) {
    return canManage ? (
      <Button size="xs" variant="light" onClick={() => openCreateItemModal(section)}>
        + 新增
      </Button>
    ) : null;
  }

  function sortControls(section: CourseDesignSection, index: number) {
    const rows = itemsBySection[section];
    const current = rows[index];
    const previous = rows[index - 1];
    const next = rows[index + 1];
    const locked = current?.status === "approved";
    return canManage ? (
      <Group gap={4} wrap="nowrap">
        <Button
          size="compact-xs"
          variant="subtle"
          disabled={index === 0 || locked || previous?.status === "approved"}
          onClick={() => void handleMoveItem(section, index, -1)}
        >
          ↑
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          disabled={index === rows.length - 1 || locked || next?.status === "approved"}
          onClick={() => void handleMoveItem(section, index, 1)}
        >
          ↓
        </Button>
      </Group>
    ) : null;
  }

  function itemActions(item: CourseDesignItem) {
    return (
      <Stack gap={6}>
        <Group gap={6}>
          {item.status === "approved" ? (
            <Badge color="green" variant="light">
              已定稿
            </Badge>
          ) : (
            <Badge color="gray" variant="light">
              草稿
            </Badge>
          )}
          {canManage && item.status === "approved" ? (
            <Button size="xs" variant="subtle" onClick={() => void handleItemStatus(item, "draft")}>
              撤销定稿
            </Button>
          ) : null}
        </Group>
        {canManage && item.status === "draft" ? (
          <Group gap={6}>
            <Button size="xs" variant="light" onClick={() => openEditItemModal(item)}>
              编辑
            </Button>
            <Button size="xs" variant="subtle" color="red" onClick={() => void handleDeleteItem(item)}>
              删除
            </Button>
            <Button size="xs" variant="subtle" color="green" onClick={() => void handleItemStatus(item, "approved")}>
              审核定稿
            </Button>
          </Group>
        ) : null}
      </Stack>
    );
  }

  function renderItemsLoading() {
    if (!itemsQuery.isLoading) return null;
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  function renderLevelTable() {
    const rows = itemsBySection.level;
    return (
      <Stack gap="sm">
        <Group justify="flex-end">{addButton("level")}</Group>
        <ScrollArea>
          <Table miw={canManage ? 980 : 760} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>级别</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th w={110}>CEFR</Table.Th>
                <Table.Th>目标人群</Table.Th>
                <Table.Th>训练重心</Table.Th>
                {canManage ? <Table.Th w={80}>排序</Table.Th> : null}
                {canManage ? <Table.Th w={220}>操作</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 ? (
                <EmptySection colSpan={canManage ? 7 : 5} />
              ) : (
                rows.map((item, index) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Badge variant="light">{fieldValue(item, "code")}</Badge>
                    </Table.Td>
                    <Table.Td>{fieldValue(item, "name")}</Table.Td>
                    <Table.Td>{fieldValue(item, "cefr")}</Table.Td>
                    <Table.Td>{fieldValue(item, "who")}</Table.Td>
                    <Table.Td>{fieldValue(item, "focus")}</Table.Td>
                    {canManage ? <Table.Td>{sortControls("level", index)}</Table.Td> : null}
                    {canManage ? <Table.Td>{itemActions(item)}</Table.Td> : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    );
  }

  function renderPricingTable() {
    const rows = itemsBySection.pricing;
    return (
      <Stack gap="sm">
        <Group justify="flex-end">{addButton("pricing")}</Group>
        <ScrollArea>
          <Table miw={canManage ? 1080 : 860} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>级别</Table.Th>
                <Table.Th>营销课名</Table.Th>
                <Table.Th w={80}>月费</Table.Th>
                <Table.Th w={80}>季付</Table.Th>
                <Table.Th w={80}>年付</Table.Th>
                <Table.Th>定价理由</Table.Th>
                {canManage ? <Table.Th w={80}>排序</Table.Th> : null}
                {canManage ? <Table.Th w={220}>操作</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 ? (
                <EmptySection colSpan={canManage ? 8 : 6} />
              ) : (
                rows.map((item, index) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Badge variant="light">{fieldValue(item, "code")}</Badge>
                    </Table.Td>
                    <Table.Td>{fieldValue(item, "market")}</Table.Td>
                    <Table.Td>S${fieldValue(item, "monthly")}</Table.Td>
                    <Table.Td>S${fieldValue(item, "quarter")}</Table.Td>
                    <Table.Td>S${fieldValue(item, "yearly")}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {fieldValue(item, "reason")}
                      </Text>
                    </Table.Td>
                    {canManage ? <Table.Td>{sortControls("pricing", index)}</Table.Td> : null}
                    {canManage ? <Table.Td>{itemActions(item)}</Table.Td> : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    );
  }

  function renderSimpleCards(section: "addon" | "tier" | "ref_app") {
    const rows = itemsBySection[section];
    return (
      <Stack gap="sm">
        <Group justify="flex-end">{addButton(section)}</Group>
        {rows.length === 0 ? <EmptySection /> : null}
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {rows.map((item, index) => (
            <Card key={item.id} withBorder radius="md" padding="md">
              <Stack gap="xs">
                {section === "addon" ? (
                  <>
                    <Text fw={600}>{fieldValue(item, "name")}</Text>
                    <Text size="sm">{fieldValue(item, "price")}</Text>
                    <Text size="xs" c="dimmed">
                      {fieldValue(item, "note")}
                    </Text>
                  </>
                ) : null}
                {section === "tier" ? (
                  <>
                    <Badge variant="light" w="fit-content">
                      {fieldValue(item, "tier")}
                    </Badge>
                    <Text size="sm">{fieldValue(item, "detail")}</Text>
                  </>
                ) : null}
                {section === "ref_app" ? (
                  <>
                    <Badge color="teal" variant="light" w="fit-content">
                      {fieldValue(item, "name")}
                    </Badge>
                    <Text size="sm">{fieldValue(item, "borrow")}</Text>
                  </>
                ) : null}
                {canManage ? (
                  <Group justify="space-between" align="flex-start" mt="xs">
                    {sortControls(section, index)}
                    {itemActions(item)}
                  </Group>
                ) : (
                  itemActions(item)
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    );
  }

  function renderDailyTable() {
    const rows = itemsBySection.daily;
    return (
      <Stack gap="sm">
        <Group justify="flex-end">{addButton("daily")}</Group>
        <ScrollArea>
          <Table miw={canManage ? 940 : 720} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}></Table.Th>
                <Table.Th>环节</Table.Th>
                <Table.Th>说明</Table.Th>
                <Table.Th w={140}>借鉴</Table.Th>
                {canManage ? <Table.Th w={80}>排序</Table.Th> : null}
                {canManage ? <Table.Th w={220}>操作</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 ? (
                <EmptySection colSpan={canManage ? 6 : 4} />
              ) : (
                rows.map((item, index) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="lg">{fieldValue(item, "icon")}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">
                        {fieldValue(item, "step")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{fieldValue(item, "desc")}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="outline" color="gray">
                        {fieldValue(item, "ref")}
                      </Badge>
                    </Table.Td>
                    {canManage ? <Table.Td>{sortControls("daily", index)}</Table.Td> : null}
                    {canManage ? <Table.Td>{itemActions(item)}</Table.Td> : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Stack>
    );
  }

  function renderScreenCards() {
    const rows = itemsBySection.screen;
    return (
      <Stack gap="sm">
        <Group justify="flex-end">{addButton("screen")}</Group>
        {rows.length === 0 ? <EmptySection /> : null}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {rows.map((item, index) => {
            const slug = fieldValue(item, "slug");
            const name = fieldValue(item, "name");
            return (
              <Card key={item.id} withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Group gap="xs" align="center">
                    <ThemeIcon variant="light" size="sm" radius="xl">
                      <Text size="xs" fw={700}>
                        {fieldValue(item, "no")}
                      </Text>
                    </ThemeIcon>
                    <Text fw={600} size="sm">
                      {name}
                    </Text>
                  </Group>
                  <CourseDesignImage
                    key={`${item.id}-${item.image_url ?? slug}`}
                    slug={slug}
                    imageUrl={item.image_url}
                    height={360}
                    onClick={() => setOpenedMockup(item)}
                  />
                  <Text size="xs">{fieldValue(item, "purpose")}</Text>
                  <Group gap={6}>
                    <Badge size="xs" variant="outline" color="gray">
                      借鉴：{fieldValue(item, "ref")}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {item.image_url ? "已上传截图" : `${slug}.svg`}
                    </Text>
                  </Group>
                  {canManage ? (
                    <Stack gap={6} mt="xs">
                      {sortControls("screen", index)}
                      {itemActions(item)}
                      {item.status === "draft" ? (
                        <Group gap={6} align="end">
                          <FileInput
                            accept="image/*"
                            placeholder="选择截图"
                            size="xs"
                            value={screenUploads[item.id] ?? null}
                            onChange={(file) => setScreenUploads((current) => ({ ...current, [item.id]: file }))}
                            style={{ flex: 1 }}
                          />
                          <Button
                            size="xs"
                            loading={uploadImageMutation.isPending}
                            disabled={!screenUploads[item.id]}
                            onClick={() => void handleUploadImage(item)}
                          >
                            上传截图
                          </Button>
                        </Group>
                      ) : null}
                    </Stack>
                  ) : (
                    itemActions(item)
                  )}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Modal opened={taskModalOpened} onClose={closeTaskModal} title={editingTask ? "编辑任务" : "新增任务"} centered>
        <form onSubmit={onTaskSubmit}>
          <Stack gap="md">
            {taskFormError ? (
              <Alert color="red" variant="light">
                {taskFormError}
              </Alert>
            ) : null}
            <TextInput label="标题" withAsterisk {...taskForm.register("title")} error={taskErrors.title?.message} />
            <TextInput
              label="负责人"
              withAsterisk
              {...taskForm.register("owner")}
              error={taskErrors.owner?.message}
            />
            <Controller
              control={taskForm.control}
              name="status"
              render={({ field }) => (
                <Select
                  label="状态"
                  data={STATUS_OPTIONS}
                  value={field.value ?? "todo"}
                  onChange={(value) => field.onChange(value ?? "todo")}
                  error={taskErrors.status?.message}
                />
              )}
            />
            <TextInput label="交付物" {...taskForm.register("deliverable")} error={taskErrors.deliverable?.message} />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeTaskModal}>
                取消
              </Button>
              <Button type="submit" loading={isSavingTask}>
                保存
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={Boolean(itemModal)}
        onClose={closeItemModal}
        title={itemModal ? `${itemModal.editingItem ? "编辑" : "新增"} · ${SECTION_LABELS[itemModal.section]}` : ""}
        centered
      >
        {itemModal ? (
          <Stack gap="md">
            {itemFormError ? (
              <Alert color="red" variant="light">
                {itemFormError}
              </Alert>
            ) : null}
            {SECTION_FIELDS[itemModal.section].map((field) =>
              field.area ? (
                <Textarea
                  key={field.k}
                  label={field.label}
                  autosize
                  minRows={3}
                  value={itemModal.values[field.k] ?? ""}
                  onChange={(event) =>
                    setItemModal((current) =>
                      current
                        ? { ...current, values: { ...current.values, [field.k]: event.currentTarget.value } }
                        : current
                    )
                  }
                />
              ) : (
                <TextInput
                  key={field.k}
                  label={field.label}
                  value={itemModal.values[field.k] ?? ""}
                  onChange={(event) =>
                    setItemModal((current) =>
                      current
                        ? { ...current, values: { ...current.values, [field.k]: event.currentTarget.value } }
                        : current
                    )
                  }
                />
              )
            )}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={closeItemModal}>
                取消
              </Button>
              <Button loading={isSavingItem} onClick={() => void submitItemForm()}>
                保存
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={Boolean(openedMockup)}
        onClose={() => setOpenedMockup(null)}
        title={openedMockup ? fieldValue(openedMockup, "name") : ""}
        size="lg"
        centered
      >
        {openedMockup ? (
          <CourseDesignImage
            key={`${openedMockup.id}-${openedMockup.image_url ?? fieldValue(openedMockup, "slug")}-modal`}
            slug={fieldValue(openedMockup, "slug")}
            imageUrl={openedMockup.image_url}
            height={640}
          />
        ) : null}
      </Modal>

      <Group justify="space-between" align="center">
        <Title order={2}>课程设计</Title>
        <Badge size="lg" variant="light" color="grape">
          负责人：小雨
        </Badge>
      </Group>

      <Alert color="blue" variant="light" title="产品定位 · 为什么这样设计">
        <Stack gap={4}>
          <Text size="sm">
            我们只有 <b>1 个教室</b>，不主打线下大班。线下教室定位为
            <b>体验课 / 小班口语活动 / 答疑</b>的补充触点。
          </Text>
          <Text size="sm">
            主打 <b>自研学习 App</b>：学生每天登录完成「今日任务」（口语、语法、词汇、听力），
            内容<b>按水平分级</b>自适应推送。App 订阅月费是现金流基本盘，线下真人服务是增值。
          </Text>
          <Text size="sm" c="dimmed">
            下方为第一稿框架（命名 / 分级 / 定价 / 界面系统均为提案值），小雨在此基础上细化、
            上传高保真界面稿，并在「设计进度」里更新状态。
          </Text>
        </Stack>
      </Alert>

      <SectionCard index="0" title="设计进度追踪" subtitle="小雨在这里更新每项交付物的状态">
        <Group justify="space-between">
          {tasksQuery.error ? (
            <Alert color="red" variant="light" flex={1}>
              {tasksQuery.error instanceof Error ? tasksQuery.error.message : "未知错误"}
            </Alert>
          ) : (
            <Text size="sm" c="dimmed">
              按排序值和创建时间展示
            </Text>
          )}
          {canManageEducation ? <Button onClick={openCreateTaskModal}>新增任务</Button> : null}
        </Group>
        <ScrollArea>
          <Table miw={720} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>设计任务</Table.Th>
                <Table.Th w={90}>负责人</Table.Th>
                <Table.Th w={110}>状态</Table.Th>
                <Table.Th>交付物</Table.Th>
                {canManageEducation ? <Table.Th w={130}>操作</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tasksQuery.isLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Group justify="center" py="lg">
                      <Loader size="sm" />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : tasks.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={canManageEducation ? 5 : 4}>
                    <Text ta="center" c="dimmed" py="lg">
                      暂无设计任务
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                tasks.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>{row.title}</Table.Td>
                    <Table.Td>{row.owner}</Table.Td>
                    <Table.Td>
                      {canManageEducation ? (
                        <Select
                          data={STATUS_OPTIONS}
                          value={row.status}
                          onChange={(value) => void handleStatusChange(row, value)}
                          size="xs"
                          w={100}
                          disabled={updateTaskStatusMutation.isPending}
                        />
                      ) : (
                        <StatusBadge status={row.status} />
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {row.deliverable || "-"}
                      </Text>
                    </Table.Td>
                    {canManageEducation ? (
                      <Table.Td>
                        <Group gap={6}>
                          <Button size="xs" variant="light" onClick={() => openEditTaskModal(row)}>
                            编辑
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            loading={deleteTaskMutation.isPending}
                            onClick={() => void handleDeleteTask(row)}
                          >
                            删除
                          </Button>
                        </Group>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </SectionCard>

      {itemsQuery.error ? (
        <Alert color="red" variant="light">
          {itemsQuery.error instanceof Error ? itemsQuery.error.message : "未知错误"}
        </Alert>
      ) : null}
      {itemActionError ? (
        <Alert color="red" variant="light" onClose={() => setItemActionError(null)} withCloseButton>
          {itemActionError}
        </Alert>
      ) : null}
      {renderItemsLoading()}

      <SectionCard index="1" title="分级体系" subtitle="CEFR 对齐 6 级 · 入学 AI 测评定级，每 4 周复测微调">
        {renderLevelTable()}
        <Text size="sm" c="dimmed">
          定级方式（提案）：入学 <b>AI 自适应测评</b>（约 15 min，听力 + 口语 + 语法）→ 自动定级 →
          推荐课程；此后每 4 周一次复测，动态升降级。
        </Text>
      </SectionCard>

      <SectionCard index="2" title="课程命名 & 收费" subtitle="主打 App 订阅（SGD）· 命名走「分级 + 卖点」双名">
        {renderPricingTable()}

        <Alert color="gray" variant="light" title="定价逻辑（提案）">
          <List size="sm" spacing={4}>
            <List.Item>App 订阅锚定「比线下便宜一个数量级、比纯工具 App 多真人反馈」。</List.Item>
            <List.Item>级别越高，应试 / 职场属性越强，付费意愿越高 → 阶梯提价。</List.Item>
            <List.Item>年付≈打 8 折锁定 LTV；季付做过渡承接。</List.Item>
            <List.Item>L1 做引流价拉新，靠内容和真人点评往上转化到 L2+ 走量。</List.Item>
          </List>
        </Alert>

        <Divider label="增值服务（线下教室 + 真人）" labelPosition="left" />
        {renderSimpleCards("addon")}
      </SectionCard>

      <SectionCard
        index="3"
        title="每日任务设计 · Daily Set"
        subtitle="App 核心循环，每天一套 15–25 min，按级别难度自适应"
      >
        {renderDailyTable()}

        <Divider label="不同程度怎么区分" labelPosition="left" />
        {renderSimpleCards("tier")}
      </SectionCard>

      <SectionCard
        index="4"
        title="App 界面系统设计"
        subtitle="先拆参考 App 借鉴点，再产出各界面高保真稿并上传"
      >
        <Group justify="space-between">
          <Text fw={600} size="sm">
            参考 App & 借鉴点
          </Text>
        </Group>
        {renderSimpleCards("ref_app")}

        <Alert color="grape" variant="light" mt="xs">
          <Text size="sm">
            截图可直接在每张卡上传 png，未传则用内置 svg 兜底；小雨可先维护界面清单，再逐张替换为高保真稿。
          </Text>
        </Alert>

        <Divider label="关键界面清单（13 屏）" labelPosition="left" />
        {renderScreenCards()}

        <Text size="xs" c="dimmed">
          参考链接：
          <Anchor href="https://www.duolingo.com" target="_blank" ml={4}>
            Duolingo
          </Anchor>
          <Anchor href="https://elsaspeak.com" target="_blank" ml={8}>
            ELSA Speak
          </Anchor>
          <Anchor href="https://www.speak.com" target="_blank" ml={8}>
            Speak
          </Anchor>
          <Anchor href="https://www.cambly.com" target="_blank" ml={8}>
            Cambly
          </Anchor>
          <Anchor href="https://www.busuu.com" target="_blank" ml={8}>
            Busuu
          </Anchor>
        </Text>
      </SectionCard>
    </Stack>
  );
}
