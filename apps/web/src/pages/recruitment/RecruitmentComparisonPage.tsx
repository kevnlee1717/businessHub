import { Badge, Box, Button, Card, Group, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { getOperatorComparison, type OperatorComparisonEntry } from "../../api/recruitment";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, deltaDays: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function pct(value: number | null | undefined) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function rateColor(rate: number | null | undefined) {
  if (rate == null) return "gray";
  if (rate >= 1) return "green";
  if (rate >= 0.5) return "yellow";
  return "red";
}

type RowDef = {
  label: string;
  value: (op: OperatorComparisonEntry) => number | null;
  render: (op: OperatorComparisonEntry) => React.ReactNode;
};

type SectionDef = { title: string; rows: RowDef[] };

const sections: SectionDef[] = [
  {
    title: "产出量",
    rows: [
      { label: "发帖", value: (op) => op.volume.postings, render: (op) => op.volume.postings },
      { label: "联系（跟进）", value: (op) => op.volume.contacts, render: (op) => op.volume.contacts },
      { label: "新群主", value: (op) => op.volume.new_group_owners, render: (op) => op.volume.new_group_owners },
      { label: "新增候选人", value: (op) => op.volume.candidates_added, render: (op) => op.volume.candidates_added },
      { label: "约面试次数", value: (op) => op.volume.interviews_created, render: (op) => op.volume.interviews_created }
    ]
  },
  {
    title: "指标完成度",
    rows: [
      {
        label: "应完成（周期×指标）",
        value: (op) => op.kpi.target_days,
        render: (op) => op.kpi.target_days
      },
      {
        label: "达标数",
        value: (op) => op.kpi.met_days,
        render: (op) => op.kpi.met_days
      },
      {
        label: "达标率",
        value: (op) => op.kpi.met_ratio,
        render: (op) => <Badge color={rateColor(op.kpi.met_ratio)}>{pct(op.kpi.met_ratio)}</Badge>
      },
      {
        label: "平均达成率",
        value: (op) => op.kpi.avg_completion_rate,
        render: (op) => <Badge color={rateColor(op.kpi.avg_completion_rate)}>{pct(op.kpi.avg_completion_rate)}</Badge>
      }
    ]
  },
  {
    title: "转化漏斗",
    rows: [
      {
        label: "约面试率",
        value: (op) => op.funnel.interview_rate,
        render: (op) => (
          <Group gap={6} justify="center">
            <Badge color={rateColor(op.funnel.interview_rate)}>{pct(op.funnel.interview_rate)}</Badge>
            <Text size="xs" c="dimmed">
              {op.funnel.reached_interview}/{op.funnel.candidates_added}
            </Text>
          </Group>
        )
      },
      {
        label: "面试到场率",
        value: (op) => op.funnel.show_rate,
        render: (op) => (
          <Group gap={6} justify="center">
            <Badge color={rateColor(op.funnel.show_rate)}>{pct(op.funnel.show_rate)}</Badge>
            <Text size="xs" c="dimmed">
              到场{op.funnel.interviews_concluded.done} 爽约{op.funnel.interviews_concluded.no_show} 取消
              {op.funnel.interviews_concluded.cancelled}
            </Text>
          </Group>
        )
      },
      {
        label: "面试成功率",
        value: (op) => op.funnel.pass_rate,
        render: (op) => (
          <Group gap={6} justify="center">
            <Badge color={rateColor(op.funnel.pass_rate)}>{pct(op.funnel.pass_rate)}</Badge>
            <Text size="xs" c="dimmed">
              过{op.funnel.results.pass} 未过{op.funnel.results.fail}
            </Text>
          </Group>
        )
      },
      {
        label: "录用率",
        value: (op) => op.funnel.offer_rate,
        render: (op) => (
          <Group gap={6} justify="center">
            <Badge color={rateColor(op.funnel.offer_rate)}>{pct(op.funnel.offer_rate)}</Badge>
            <Text size="xs" c="dimmed">
              {op.funnel.offered}/{op.funnel.candidates_added}
            </Text>
          </Group>
        )
      }
    ]
  },
  {
    title: "活跃度",
    rows: [{ label: "活跃天数", value: (op) => op.active_days, render: (op) => op.active_days }]
  }
];

export function RecruitmentComparisonPage() {
  const [from, setFrom] = useState(shiftDate(today(), -6));
  const [to, setTo] = useState(today());

  const comparisonQuery = useQuery({
    queryKey: ["recruitment", "operator-comparison", from, to],
    queryFn: () => getOperatorComparison({ from, to })
  });
  const operators = comparisonQuery.data?.operators ?? [];

  function leaderIds(row: RowDef) {
    const values = operators
      .map((op) => ({ id: op.employee_id, value: row.value(op) }))
      .filter((item): item is { id: string; value: number } => item.value != null);
    if (values.length < 2) return new Set<string>();
    const max = Math.max(...values.map((item) => item.value));
    if (values.every((item) => item.value === max)) return new Set<string>();
    return new Set(values.filter((item) => item.value === max).map((item) => item.id));
  }

  return (
    <Stack gap="md">
      <Card withBorder>
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Title order={5}>操作员绩效对比</Title>
          <Group gap="xs" align="flex-end">
            <TextInput type="date" label="开始日期" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
            <TextInput type="date" label="结束日期" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
            <Button
              variant="default"
              onClick={() => {
                setFrom(shiftDate(today(), -6));
                setTo(today());
              }}
            >
              近 7 天
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setFrom(monthStart(today()));
                setTo(today());
              }}
            >
              本月
            </Button>
          </Group>
        </Group>
      </Card>

      <Card withBorder p={0}>
        {comparisonQuery.isError ? (
          <Box p="md">
            <Text c="red">加载失败，请重试</Text>
          </Box>
        ) : operators.length === 0 ? (
          <Box p="md">
            <Text c="dimmed">{comparisonQuery.isLoading ? "加载中…" : "暂无绑定的操作员"}</Text>
          </Box>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={220}>维度</Table.Th>
                {operators.map((op) => (
                  <Table.Th key={op.employee_id} style={{ textAlign: "center" }}>
                    {op.name}
                    {op.ifm_display_name && op.ifm_display_name !== op.name ? (
                      <Text size="xs" c="dimmed">
                        {op.ifm_display_name}
                      </Text>
                    ) : null}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sections.map((section) => (
                <Fragment key={section.title}>
                  <Table.Tr>
                    <Table.Td colSpan={operators.length + 1} bg="var(--mantine-color-gray-0)">
                      <Text fw={600} size="sm">
                        {section.title}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {section.rows.map((row) => {
                    const leaders = leaderIds(row);
                    return (
                      <Table.Tr key={row.label}>
                        <Table.Td>{row.label}</Table.Td>
                        {operators.map((op) => (
                          <Table.Td
                            key={op.employee_id}
                            style={{ textAlign: "center" }}
                            {...(leaders.has(op.employee_id) ? { bg: "var(--mantine-color-green-0)" } : {})}
                          >
                            <Group gap={6} justify="center">
                              {row.render(op)}
                              {leaders.has(op.employee_id) ? (
                                <Badge size="xs" color="green" variant="light">
                                  领先
                                </Badge>
                              ) : null}
                            </Group>
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    );
                  })}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
      <Text size="xs" c="dimmed">
        口径：达标率/达成率与「指标任务」逐位一致；约面试率=期间新增候选人中进入面试的比例；到场率/成功率按面试时间落在区间的面试计；率值分母为 0 显示 —。
      </Text>
    </Stack>
  );
}
