import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
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
import { useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import {
  createCourseDesignTask,
  deleteCourseDesignTask,
  listCourseDesignTasks,
  updateCourseDesignTask,
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
 * - §1~§4 设计内容（分级/命名定价/每日任务/App 界面系统）为静态设计稿，
 *   随设计推进改本文件、走 dev → prod 提交流水线更新（与项目现有工作流一致）。
 *
 * 界面稿：小雨把高保真稿命名 <slug>.png 放到 apps/web/public/course-design/ 即覆盖内置 svg；
 * §4 每张卡可点击放大。
 *
 * 首版内容为第一稿框架/提案（命名、分级、定价、界面系统均为建议值），供小雨细化、替换。
 */

type Status = CourseDesignTaskStatus;
type TaskFormValues = {
  title?: string | undefined;
  owner?: string | undefined;
  status?: CourseDesignTaskStatus | undefined;
  deliverable?: string | null | undefined;
};

const courseDesignTasksQueryKey = ["education", "course-design-tasks"] as const;

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

/**
 * 界面稿显示槽：优先加载 <slug>.png（小雨后续导出的高保真稿），
 * 其次 <slug>.svg（本项目内置的中保真原型稿），都没有则显示占位。
 * 放到 apps/web/public/course-design/ 即自动显示。
 */
function CourseDesignImage({ slug, height, onClick }: { slug: string; height: number; onClick?: () => void }) {
  const sources = [`/course-design/${slug}.png`, `/course-design/${slug}.svg`];
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
            public/course-design/{slug}.svg
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

function MockupSlot({ slug, onOpen }: { slug: string; onOpen: () => void }) {
  return <CourseDesignImage slug={slug} height={360} onClick={onOpen} />;
}

// ── 数据 ──────────────────────────────────────────────────────────────────

const LEVELS: {
  code: string;
  name: string;
  cefr: string;
  who: string;
  focus: string;
}[] = [
  { code: "L1", name: "入门 Starter", cefr: "pre-A1 / A1", who: "零基础", focus: "字母·发音·生存口语" },
  { code: "L2", name: "基础 Elementary", cefr: "A1 – A2", who: "识单词但不敢开口", focus: "日常对话·基础语法" },
  { code: "L3", name: "进阶 Pre-Intermediate", cefr: "A2 – B1", who: "能说短句", focus: "完整表达·时态体系" },
  { code: "L4", name: "中级 Intermediate", cefr: "B1", who: "日常够用想提升", focus: "流利交流·职场场景" },
  { code: "L5", name: "中高级 Upper", cefr: "B1 – B2", who: "应试/职场刚需", focus: "雅思 5.5–6.5·职场沟通" },
  { code: "L6", name: "高级 Advanced", cefr: "B2 – C1", who: "高阶精英", focus: "学术·商务·雅思 7+" }
];

const PRICING: {
  code: string;
  market: string;
  monthly: string;
  quarter: string;
  yearly: string;
  reason: string;
}[] = [
  { code: "L1", market: "开口说 · 零基础启航", monthly: "68", quarter: "180", yearly: "588", reason: "引流价，低门槛拉新；比纯工具 App 贵一点但含真人点评" },
  { code: "L2", market: "日常英语 · 生活通", monthly: "88", quarter: "238", yearly: "788", reason: "主力走量档，覆盖最大人群" },
  { code: "L3", market: "进阶表达 · 语法突破", monthly: "108", quarter: "288", yearly: "988", reason: "去中文化拐点，付费意愿开始上升" },
  { code: "L4", market: "流利中级 · 职场沟通", monthly: "128", quarter: "348", yearly: "1188", reason: "加职场场景，客单上移" },
  { code: "L5", market: "雅思冲刺 · 5.5–6.5", monthly: "168", quarter: "458", yearly: "1588", reason: "应试溢价，对标线下雅思班几千刀" },
  { code: "L6", market: "高阶精英 · 学术商务", monthly: "198", quarter: "528", yearly: "1888", reason: "高净值小众，利润档" }
];

const ADDONS: { name: string; price: string; note: string }[] = [
  { name: "1v1 外教口语 25 min", price: "S$35 / 节 · 10 节 S$320", note: "App 订阅之上的增值，拉高客单" },
  { name: "周末线下口语角（8 人小班）", price: "S$40 / 次 · 月卡 S$128", note: "唯一教室的最佳用法：社群黏性" },
  { name: "私教定制陪跑（月）", price: "S$388", note: "高级别/应试冲刺人群" }
];

const DAILY_SET: { icon: string; step: string; desc: string; ref: string }[] = [
  { icon: "🔥", step: "词汇闪卡 Warm-up", desc: "5 词，SRS 间隔重复，滑卡认识/不认识", ref: "百词斩 / Duolingo" },
  { icon: "🎙", step: "口语跟读 + AI 打分", desc: "音素级发音评分，红黄绿高亮 + 雷达图", ref: "ELSA Speak" },
  { icon: "💬", step: "AI 情景对话", desc: "1 个场景 3–5 轮，roleplay，实时纠错", ref: "Speak" },
  { icon: "📖", step: "语法微课 + 即时练", desc: "1 个点讲解卡 + 3 题，答错即时纠错弹层", ref: "Duolingo" },
  { icon: "👂", step: "听力片段 + 理解题", desc: "短音频 + 2–3 题，级别越高越长", ref: "Busuu" },
  { icon: "✅", step: "打卡结算", desc: "连续天数 streak、经验值 XP、周榜结算弹窗", ref: "Duolingo" }
];

const TIER_DIFF: { tier: string; detail: string }[] = [
  { tier: "L1 – L2", detail: "跟读/闪卡为主，语法轻量，中文辅助多，每日 15 min" },
  { tier: "L3 – L4", detail: "对话/语法为主，逐步去中文化，加写作微任务，每日 20 min" },
  { tier: "L5 – L6", detail: "应试题型（雅思 part）、长文听力、观点表达，去脚手架，每日 25 min+" }
];

const REF_APPS: { name: string; borrow: string }[] = [
  { name: "Duolingo", borrow: "学习路径 path、streak/XP 游戏化、答错即时纠错弹层" },
  { name: "ELSA Speak", borrow: "音素级发音打分、红黄绿高亮、发音雷达图" },
  { name: "Speak", borrow: "AI 自由对话、roleplay 场景卡、对话式 tutor" },
  { name: "Cambly", borrow: "真人外教预约、视频课界面、评价体系" },
  { name: "Busuu", borrow: "学习计划、社区互改、复习提醒" }
];

const SCREENS: { slug: string; no: string; name: string; purpose: string; ref: string }[] = [
  { slug: "onboarding", no: "1", name: "定级测评流程", purpose: "欢迎 → 15min 自适应测评 → 定级结果 → 推荐课程", ref: "Busuu / Duolingo onboarding" },
  { slug: "home", no: "2", name: "首页 · 今日任务", purpose: "Daily Set 卡片流 + 顶栏 streak + 学习路径入口", ref: "Duolingo 首页" },
  { slug: "path", no: "3", name: "学习路径 Path", purpose: "级别地图，节点解锁，进度可视", ref: "Duolingo path" },
  { slug: "speaking", no: "4", name: "口语练习页", purpose: "跟读 + 波形 + AI 打分雷达 + 重录", ref: "ELSA" },
  { slug: "ai-chat", no: "5", name: "AI 情景对话页", purpose: "对话气泡 + roleplay 卡 + 纠错高亮", ref: "Speak" },
  { slug: "grammar", no: "6", name: "语法微课页", purpose: "讲解卡 + 即时练题 + 纠错弹层", ref: "Duolingo" },
  { slug: "listening", no: "7", name: "听力页", purpose: "音频播放 + 逐句 + 理解题", ref: "Busuu" },
  { slug: "review", no: "8", name: "复习 / 错题本", purpose: "SRS 待复习队列 + 错题重练", ref: "百词斩" },
  { slug: "checkin", no: "9", name: "打卡结算页", purpose: "XP、连击、成就弹窗、周榜", ref: "Duolingo" },
  { slug: "leaderboard", no: "10", name: "排行榜 / 学习小组", purpose: "周榜 + 联盟晋级 + 小组 PK", ref: "Duolingo 联盟" },
  { slug: "profile", no: "11", name: "我的", purpose: "等级、进度、订阅、约外教入口", ref: "通用" },
  { slug: "paywall", no: "12", name: "订阅付费页", purpose: "级别套餐、月/季/年、权益对比", ref: "Duolingo Plus / Cambly" },
  { slug: "booking", no: "13", name: "线下 / 外教预约", purpose: "口语角、1v1 排期与预约", ref: "Cambly" }
];

// ── 组件 ──────────────────────────────────────────────────────────────────

export function CourseDesignPanel() {
  const queryClient = useQueryClient();
  const canManageEducation = useCan("education.manage");
  const [editingTask, setEditingTask] = useState<CourseDesignTask | null>(null);
  const [taskModalOpened, setTaskModalOpened] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);
  const [openedMockup, setOpenedMockup] = useState<{ slug: string; name: string } | null>(null);

  const tasksQuery = useQuery({
    queryKey: courseDesignTasksQueryKey,
    queryFn: listCourseDesignTasks
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
  const taskErrors = taskForm.formState.errors;
  const tasks = tasksQuery.data?.tasks ?? [];
  const isSavingTask = createTaskMutation.isPending || updateTaskMutation.isPending;

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
            <TextInput
              label="标题"
              withAsterisk
              {...taskForm.register("title")}
              error={taskErrors.title?.message}
            />
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
            <TextInput
              label="交付物"
              {...taskForm.register("deliverable")}
              error={taskErrors.deliverable?.message}
            />
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
        opened={Boolean(openedMockup)}
        onClose={() => setOpenedMockup(null)}
        title={openedMockup?.name}
        size="lg"
        centered
      >
        {openedMockup ? <CourseDesignImage key={openedMockup.slug} slug={openedMockup.slug} height={640} /> : null}
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

      {/* 0. 设计进度 */}
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

      {/* 1. 分级体系 */}
      <SectionCard index="1" title="分级体系" subtitle="CEFR 对齐 6 级 · 入学 AI 测评定级，每 4 周复测微调">
        <ScrollArea>
          <Table miw={760} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>级别</Table.Th>
                <Table.Th>名称</Table.Th>
                <Table.Th w={110}>CEFR</Table.Th>
                <Table.Th>目标人群</Table.Th>
                <Table.Th>训练重心</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {LEVELS.map((lv) => (
                <Table.Tr key={lv.code}>
                  <Table.Td>
                    <Badge variant="light">{lv.code}</Badge>
                  </Table.Td>
                  <Table.Td>{lv.name}</Table.Td>
                  <Table.Td>{lv.cefr}</Table.Td>
                  <Table.Td>{lv.who}</Table.Td>
                  <Table.Td>{lv.focus}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
        <Text size="sm" c="dimmed">
          定级方式（提案）：入学 <b>AI 自适应测评</b>（约 15 min，听力 + 口语 + 语法）→ 自动定级 →
          推荐课程；此后每 4 周一次复测，动态升降级。
        </Text>
      </SectionCard>

      {/* 2. 课程命名 & 收费 */}
      <SectionCard index="2" title="课程命名 & 收费" subtitle="主打 App 订阅（SGD）· 命名走「分级 + 卖点」双名">
        <ScrollArea>
          <Table miw={860} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={60}>级别</Table.Th>
                <Table.Th>营销课名</Table.Th>
                <Table.Th w={80}>月费</Table.Th>
                <Table.Th w={80}>季付</Table.Th>
                <Table.Th w={80}>年付</Table.Th>
                <Table.Th>定价理由</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {PRICING.map((p) => (
                <Table.Tr key={p.code}>
                  <Table.Td>
                    <Badge variant="light">{p.code}</Badge>
                  </Table.Td>
                  <Table.Td>{p.market}</Table.Td>
                  <Table.Td>S${p.monthly}</Table.Td>
                  <Table.Td>S${p.quarter}</Table.Td>
                  <Table.Td>S${p.yearly}</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {p.reason}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Alert color="gray" variant="light" title="定价逻辑（提案）">
          <List size="sm" spacing={4}>
            <List.Item>App 订阅锚定「比线下便宜一个数量级、比纯工具 App 多真人反馈」。</List.Item>
            <List.Item>级别越高，应试 / 职场属性越强，付费意愿越高 → 阶梯提价。</List.Item>
            <List.Item>年付≈打 8 折锁定 LTV；季付做过渡承接。</List.Item>
            <List.Item>L1 做引流价拉新，靠内容和真人点评往上转化到 L2+ 走量。</List.Item>
          </List>
        </Alert>

        <Divider label="增值服务（线下教室 + 真人）" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {ADDONS.map((a) => (
            <Card key={a.name} withBorder radius="md" padding="md">
              <Text fw={600}>{a.name}</Text>
              <Text size="sm" mt={4}>
                {a.price}
              </Text>
              <Text size="xs" c="dimmed" mt={6}>
                {a.note}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </SectionCard>

      {/* 3. 每日任务设计 */}
      <SectionCard
        index="3"
        title="每日任务设计 · Daily Set"
        subtitle="App 核心循环，每天一套 15–25 min，按级别难度自适应"
      >
        <ScrollArea>
          <Table miw={720} verticalSpacing="sm" withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}></Table.Th>
                <Table.Th>环节</Table.Th>
                <Table.Th>说明</Table.Th>
                <Table.Th w={140}>借鉴</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {DAILY_SET.map((d) => (
                <Table.Tr key={d.step}>
                  <Table.Td>
                    <Text size="lg">{d.icon}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {d.step}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.desc}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="outline" color="gray">
                      {d.ref}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Divider label="不同程度怎么区分" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {TIER_DIFF.map((t) => (
            <Card key={t.tier} withBorder radius="md" padding="md">
              <Badge variant="light" mb={6}>
                {t.tier}
              </Badge>
              <Text size="sm">{t.detail}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </SectionCard>

      {/* 4. App 界面系统 */}
      <SectionCard
        index="4"
        title="App 界面系统设计"
        subtitle="先拆参考 App 借鉴点，再产出各界面高保真稿并上传"
      >
        <Text fw={600} size="sm">
          参考 App & 借鉴点
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {REF_APPS.map((r) => (
            <Card key={r.name} withBorder radius="md" padding="md">
              <Badge color="teal" variant="light" mb={6}>
                {r.name}
              </Badge>
              <Text size="sm">{r.borrow}</Text>
            </Card>
          ))}
        </SimpleGrid>

        <Alert color="grape" variant="light" mt="xs">
          <Text size="sm">
            下方 13 屏均已内置<b>中保真原型稿（.svg）</b>，直接展示"界面应该长什么样"。
            小雨据此产出高保真稿时，命名为 <b>&lt;slug&gt;.png</b> 放到{" "}
            <b>apps/web/public/course-design/</b> 即可覆盖显示（有 png 用 png，无则回落到内置 svg）。
          </Text>
        </Alert>

        <Divider label="关键界面清单（13 屏）" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {SCREENS.map((s) => (
            <Card key={s.slug} withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Group gap="xs" align="center">
                  <ThemeIcon variant="light" size="sm" radius="xl">
                    <Text size="xs" fw={700}>
                      {s.no}
                    </Text>
                  </ThemeIcon>
                  <Text fw={600} size="sm">
                    {s.name}
                  </Text>
                </Group>
                <MockupSlot slug={s.slug} onOpen={() => setOpenedMockup({ slug: s.slug, name: s.name })} />
                <Text size="xs">{s.purpose}</Text>
                <Group gap={6}>
                  <Badge size="xs" variant="outline" color="gray">
                    借鉴：{s.ref}
                  </Badge>
                  <Text size="xs" c="dimmed">
                    {s.slug}.svg
                  </Text>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

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
