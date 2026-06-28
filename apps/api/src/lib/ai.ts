export type RecruitmentCopyType = "ad" | "job_description" | "invite_script";

export type RecruitmentCopyInput = {
  industry?: string | undefined;
  job_title: string;
  salary_min?: number | null | undefined;
  salary_max?: number | null | undefined;
  salary_note?: string | null | undefined;
  job_content?: string | null | undefined;
  requirements?: string | null | undefined;
  copy_type: RecruitmentCopyType;
  tone?: string | undefined;
  platform?: string | undefined;
};

const anthropicEndpoint = "https://api.anthropic.com/v1/messages";

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
    "要求:信息准确、适合人工发布、不要承诺未提供的福利。"
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateRecruitmentCopy(input: RecruitmentCopyInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      ok: false as const,
      statusCode: 400,
      error: "anthropic_api_key_missing"
    };
  }

  const model = process.env.RECRUITMENT_AI_MODEL ?? "claude-sonnet-4-6";

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
            content: buildRecruitmentPrompt(input)
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        ok: false as const,
        statusCode: response.status >= 400 && response.status < 500 ? 400 : 502,
        error: "anthropic_request_failed"
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
        error: "anthropic_empty_response"
      };
    }

    return {
      ok: true as const,
      draft,
      model
    };
  } catch {
    return {
      ok: false as const,
      statusCode: 502,
      error: "anthropic_unavailable"
    };
  }
}
