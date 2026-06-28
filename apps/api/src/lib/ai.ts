import { spawn } from "node:child_process";

export type RecruitmentCopyType = "ad" | "job_description" | "invite_script";

export type RecruitmentCopyInput = {
  industry?: string | undefined;
  job_title: string;
  salary_min?: number | null | undefined;
  salary_max?: number | null | undefined;
  salary_note?: string | null | undefined;
  job_content?: string | null | undefined;
  requirements?: string | null | undefined;
  source_text?: string | null | undefined;
  copy_type: RecruitmentCopyType;
  tone?: string | undefined;
  platform?: string | undefined;
};

const anthropicEndpoint = "https://api.anthropic.com/v1/messages";
const defaultModel = "sonnet";
const defaultClaudeBin = "claude";
const defaultTimeoutMs = 60_000;

type RecruitmentCopyResult =
  | {
      ok: true;
      draft: string;
      model: string;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      message: string;
    };

function copyTypeLabel(type: RecruitmentCopyType) {
  if (type === "job_description") return "岗位描述";
  if (type === "invite_script") return "邀约话术";
  return "招聘广告词";
}

function buildRecruitmentPrompt(input: RecruitmentCopyInput) {
  const salary =
    input.salary_min || input.salary_max
      ? `${input.salary_min ?? ""}${input.salary_min && input.salary_max ? "-" : ""}${input.salary_max ?? ""} SGD/月`
      : input.salary_note;

  return [
    "你是新加坡本地招聘文案助手。请只输出可直接给招聘人员使用的中文文案，不要解释过程。",
    `文案类型:${copyTypeLabel(input.copy_type)}`,
    input.platform ? `发布平台:${input.platform}` : undefined,
    input.tone ? `语气:${input.tone}` : undefined,
    input.industry ? `行业:${input.industry}` : undefined,
    `岗位:${input.job_title}`,
    salary ? `薪资:${salary}` : undefined,
    input.job_content ? `工作内容:${input.job_content}` : undefined,
    input.requirements ? `岗位要求:${input.requirements}` : undefined,
    input.source_text
      ? `以下是参考原文,请基于它改写/优化成${copyTypeLabel(input.copy_type)},保留关键信息:\n${input.source_text}`
      : undefined,
    "要求:信息准确、适合人工发布、不要承诺未提供的福利。"
  ]
    .filter(Boolean)
    .join("\n");
}

function getTimeoutMs() {
  const value = Number(process.env.RECRUITMENT_AI_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : defaultTimeoutMs;
}

function formatCliFailure(message: string, stderr?: string) {
  const detail = stderr?.trim();
  return detail ? `${message}: ${detail}` : message;
}

async function runClaudeCli(prompt: string, model: string) {
  const claudeBin = process.env.RECRUITMENT_AI_CLAUDE_BIN ?? defaultClaudeBin;
  const timeoutMs = getTimeoutMs();
  const args = [
    "-p",
    "--input-format",
    "text",
    "--output-format",
    "text",
    "--model",
    model,
    "--tools",
    "",
    "--safe-mode",
    "--no-session-persistence"
  ];

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(new Error(`claude CLI timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdin.on("error", (error) => {
      finish(() => {
        reject(new Error(`claude CLI stdin failed: ${error.message}`));
      });
    });

    child.on("error", (error) => {
      finish(() => {
        reject(new Error(`claude CLI is not available: ${error.message}`));
      });
    });

    child.on("close", (code, signal) => {
      finish(() => {
        if (code !== 0) {
          reject(new Error(formatCliFailure(`claude CLI failed with exit code ${code ?? `signal ${signal}`}`, stderr)));
          return;
        }

        const draft = stdout.trim();
        if (!draft) {
          reject(new Error(formatCliFailure("claude CLI returned an empty response", stderr)));
          return;
        }

        resolve(draft);
      });
    });

    child.stdin.end(prompt);
  });
}

async function generateWithAnthropicApi(prompt: string, model: string, apiKey: string): Promise<RecruitmentCopyResult> {
  try {
    const response = await fetch(anthropicEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        ok: false as const,
        statusCode: response.status >= 400 && response.status < 500 ? 400 : 502,
        error: "anthropic_request_failed",
        message: `Anthropic API request failed with status ${response.status}`
      };
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const draft = payload.content?.find((item) => item.type === "text")?.text?.trim();

    if (!draft) {
      return {
        ok: false as const,
        statusCode: 502,
        error: "anthropic_empty_response",
        message: "Anthropic API returned an empty response"
      };
    }

    return {
      ok: true as const,
      draft,
      model
    };
  } catch (error) {
    return {
      ok: false as const,
      statusCode: 502,
      error: "anthropic_unavailable",
      message: error instanceof Error ? `Anthropic API is unavailable: ${error.message}` : "Anthropic API is unavailable"
    };
  }
}

async function generateWithClaudeCli(prompt: string, model: string): Promise<RecruitmentCopyResult> {
  try {
    const draft = await runClaudeCli(prompt, model);
    return {
      ok: true as const,
      draft,
      model
    };
  } catch (error) {
    return {
      ok: false as const,
      statusCode: 502,
      error: "claude_cli_failed",
      message:
        error instanceof Error
          ? `claude CLI unavailable or failed: ${error.message}`
          : "claude CLI unavailable or failed"
    };
  }
}

export async function generateRecruitmentCopy(input: RecruitmentCopyInput): Promise<RecruitmentCopyResult> {
  const prompt = buildRecruitmentPrompt(input);
  const model = process.env.RECRUITMENT_AI_MODEL ?? defaultModel;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (process.env.RECRUITMENT_AI_BACKEND === "api" && apiKey) {
    return generateWithAnthropicApi(prompt, model, apiKey);
  }

  return generateWithClaudeCli(prompt, model);
}
