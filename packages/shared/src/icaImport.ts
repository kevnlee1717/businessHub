/**
 * ICA 申诉案件批量导入 — 纯解析/归类函数
 * 全部无副作用，可在浏览器 / Node / 测试环境直接 import。
 */

export type SubmissionResult = "pending" | "approved" | "rejected";

// ─── 状态归一 ──────────────────────────────────────────────────────────────

/**
 * 从任意原始字符串推断 approved / rejected / pending。
 * 子串匹配(忽略大小写)：
 *   approved | granted  → "approved"
 *   reject | failed     → "rejected"
 *   其余               → "pending"
 */
export function normalizeStatus(raw: string): SubmissionResult {
  const s = raw.toLowerCase();
  if (/(approved|granted)/.test(s)) return "approved";
  if (/(reject|failed)/.test(s)) return "rejected";
  return "pending";
}

// ─── 客户去重键 ────────────────────────────────────────────────────────────

/** 姓名大小写/多余空白归一，用于客户去重 */
export function clientDedupKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

// ─── 文件分类 ──────────────────────────────────────────────────────────────

/**
 * 标准文件槽规则（顺序重要：先 Form14/申诉信/护照/户口/在职/酒店/担保人/拒信，
 * 最后才是身份证，避免 ISC... / Incumbency 误判）
 */
const SLOT_RULES: Array<[RegExp, string]> = [
  [/form\s*14/i, "Form 14"],
  [/appeal\s*letter|申诉信/i, "申诉信"],
  [/passport|护照|^pp[\s._\d]/i, "护照"],
  [/household|户口/i, "户口本"],
  [/incumbency|employment\s*cert|在职证明/i, "在职证明"],
  [/hotel|酒店/i, "新加坡酒店证明"],
  [/guarantor|担保人|name\s*card/i, "担保人材料"],
  [/aplout|拒信|拒签/i, "ICA 拒信"],
  // 身份证放最后：IC/ID/FIN/身份证/NRIC — 须在以上规则都不命中后才做
  [/\b(ic|id)[\s._\d]|身份证|nric|\bfin[\d\s._]/i, "身份证/NRIC"],
];

/** 根据文件名匹配标准槽；匹配不到一律 `其他/证据材料` */
export function classifyFile(filename: string): { slot: string } {
  for (const [re, slot] of SLOT_RULES) {
    if (re.test(filename)) return { slot };
  }
  return { slot: "其他/证据材料" };
}

// ─── 案件文件夹名解析 ──────────────────────────────────────────────────────

export interface ParsedCase {
  status: SubmissionResult;
  name: string;
  appealId: string | null;
  owner: string | null;
  round: number | null;
}

/**
 * 从文件夹名解析: status / name / appealId / owner / round。
 *
 * 真实数据格式多样，以下模式都会出现：
 *   REJECTED - NAME - ISC... - OWNER
 *   REJECT_NAME
 *   REJECTED-NAME-2ND APPEAL
 *   NAME - ISC... - OWNER        (无状态前缀, pending)
 *   NAME-GRANTED                 (状态在末尾)
 *   NAME 2ND APPEAL- REJECTED
 *   pending - NAME 3RD APPEAL - p
 */
export function parseCaseFolderName(folder: string): ParsedCase {
  let s = folder.trim();

  // ── 1. 提取 AppealID ──────────────────────────────────────────────────────
  // 正常格式: ISC2604AM000493 / ISC2606AE001761
  // 异常格式: (ISCISC2603AM000485) — ISC 重复
  // 先移除括号包围的整块（可能含错字），再匹配裸 ID
  s = s.replace(/\((?:ISC)?ISC\d{4}A[ME]\d{6}\)/gi, (m) => {
    // 先捕获 ID，再替换整个括号块
    return m; // 占位，下面统一提取
  });

  const appealIdMatch = s.match(/ISC(\d{4}A[ME]\d{6})/i);
  let appealId: string | null = null;
  if (appealIdMatch) {
    appealId = "ISC" + appealIdMatch[1]!.toUpperCase();
    // 移除匹配到的 ID（及可能包裹它的括号）
    s = s.replace(/\((?:ISC)?ISC\d{4}A[ME]\d{6}\)/gi, " ");
    s = s.replace(/(?:ISC)?ISC\d{4}A[ME]\d{6}/gi, " ");
  }
  // 移除 "Appeal ID " 前缀残留
  s = s.replace(/\bAppeal\s+ID\b\s*/gi, "");

  // ── 2. 提取轮次 ───────────────────────────────────────────────────────────
  // 匹配: 2nd appeal / 2ND APPEAL / 2NDAPPEAL / 3rd Appeal / 4th Appeal 等
  const roundMatch = s.match(/(\d)(?:st|nd|rd|th)\s*APPEAL/i);
  let round: number | null = null;
  if (roundMatch) {
    round = parseInt(roundMatch[1]!, 10);
    s = s.replace(roundMatch[0]!, " ");
  }
  // 移除 RE APPEAL / REAPPEAL (无编号的再申请标记)
  s = s.replace(/\bRE[\s-]*APPEAL\b/gi, " ");
  // 移除其他非姓名尾注
  s = s.replace(/\b(RESUBMIT\w*|ADDITIONAL|REAPPEAL)\b/gi, " ");

  // ── 3. 推断状态 ───────────────────────────────────────────────────────────
  const status = normalizeStatus(folder); // 用原始字符串，避免被后续替换影响

  // ── 4. 去除状态前缀/后缀 ─────────────────────────────────────────────────
  // 前缀: REJECTED - / REJECTED- / REJECTED_ / REJECT_ / APPROVED - / PENDING - / pend update
  s = s.replace(
    /^(?:REJECTED|REJECT|APPROVED|GRANTED|PENDING|PEND(?:\s+UPDATE)?)\s*[-_\s]+/i,
    ""
  );
  // 后缀: -REJECTED / - FAILED / -GRANTED / - APPROVED 等
  s = s.replace(/\s*[-_]+\s*(?:REJECTED|REJECT|APPROVED|GRANTED|FAILED|PENDING)\s*$/i, "");

  // ── 5. 清理多余空格/连字符 ────────────────────────────────────────────────
  s = s.replace(/\s{2,}/g, " ");
  // 多余的连续分隔符: " - - " / "- -" → " - "
  s = s.replace(/(\s*-\s*){2,}/g, " - ");
  // 去头尾的 "-" 和空格
  s = s.replace(/^\s*-+\s*/, "").replace(/\s*-+\s*$/, "").trim();

  // ── 6. 分段 → 提取 name / owner ──────────────────────────────────────────
  // 分隔符: " - " (空格-横杠-空格) 或 " -" (空格-横杠，末段常见)
  const parts = s
    .split(/\s+-\s*|\s*-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let name: string;
  let owner: string | null = null;

  if (parts.length === 0) {
    name = s;
  } else if (parts.length === 1) {
    name = parts[0]!;
  } else {
    const lastPart = parts[parts.length - 1]!;
    if (looksLikeOwnerCode(lastPart)) {
      owner = lastPart.toUpperCase();
      name = parts[0]!;
    } else {
      name = parts[0]!;
    }
  }

  return {
    status,
    name: clientDedupKey(name),
    appealId,
    owner,
    round,
  };
}

/**
 * 判断字符串是否像经办人短代号。
 * 经验规则:
 *   - 1-2 个词(多词如 "REFUSED ENTRY IN MAY 2026" 不是)
 *   - 单词合计长度 ≤ 8 个字符
 *   - 不以 own/sponsor/refused/resubmit/additional/cancel/banned 开头
 *   - 不是单个小写字母 (p = pending 提醒)
 */
function looksLikeOwnerCode(s: string): boolean {
  const trimmed = s.trim();
  // 单个小写字母: "p" 是 pending 提醒，不是经办人
  if (/^[a-z]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  // 超过 2 词 → 肯定不是短代号
  if (words.length > 2) return false;
  // 合计字符长度 (不含空格) > 8 → 太长
  const len = words.join("").length;
  if (len > 8) return false;

  // 已知非经办人开头词
  if (
    /^(own|sponsor|refused|resubmit|additional|cancel|banned|reappeal)/i.test(
      trimmed
    )
  )
    return false;

  return true;
}
