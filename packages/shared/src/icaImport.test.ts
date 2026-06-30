import { describe, it, expect } from "vitest";
import {
  normalizeStatus,
  parseCaseFolderName,
  classifyFile,
  clientDedupKey,
} from "./icaImport";

describe("normalizeStatus", () => {
  it.each([
    ["APPROVED", "approved"],
    ["APPROVED_", "approved"],
    ["GRANTED", "approved"],
    ["REJECTED", "rejected"],
    ["REJECT_", "rejected"],
    ["Rejected-", "rejected"],
    ["FAILED", "rejected"],
    ["PENDING", "pending"],
    ["pending", "pending"],
    ["- p", "pending"],
    ["", "pending"],
    ["pend update", "pending"],
  ])("%s→%s", (i, e) => expect(normalizeStatus(i)).toBe(e));
});

describe("clientDedupKey", () => {
  it("大小写/空白归一", () =>
    expect(clientDedupKey("Dong  Yiwen")).toBe(clientDedupKey("DONG YIWEN")));
  it("保留多词", () =>
    expect(clientDedupKey("  LE THI NGOC VEN  ")).toBe("LE THI NGOC VEN"));
});

describe("parseCaseFolderName", () => {
  // --- 核心断言(任务要求) ---
  it("状态/姓名/AppealID/经办人", () => {
    expect(
      parseCaseFolderName("REJECTED - DONG YIWEN - ISC2603AM000466 -TAN")
    ).toEqual({
      status: "rejected",
      name: "DONG YIWEN",
      appealId: "ISC2603AM000466",
      owner: "TAN",
      round: null,
    });
  });

  it("带申诉轮次(Hu Yajun-2nd appeal)", () => {
    const r = parseCaseFolderName("Hu Yajun-2nd appeal");
    expect(r.name).toBe("HU YAJUN");
    expect(r.round).toBe(2);
    expect(r.status).toBe("pending");
  });

  it("无 AppealID/经办人(APPROVED - LEI GENHUA)", () => {
    const r = parseCaseFolderName("APPROVED - LEI GENHUA");
    expect(r.name).toBe("LEI GENHUA");
    expect(r.status).toBe("approved");
  });

  // --- 真实文件夹名: 2025 Aug (REJECT_ 前缀格式) ---
  it("APPROVED_ZHANG LIANPENG", () => {
    const r = parseCaseFolderName("APPROVED_ZHANG LIANPENG");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("ZHANG LIANPENG");
    expect(r.round).toBeNull();
    expect(r.owner).toBeNull();
  });

  it("REJECT_Hu Yajun 2nd Appeal", () => {
    const r = parseCaseFolderName("REJECT_Hu Yajun 2nd Appeal");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("HU YAJUN");
    expect(r.round).toBe(2);
  });

  // --- 真实文件夹名: 状态在末尾 ---
  it("CHEN FEI - GRANTED", () => {
    const r = parseCaseFolderName("CHEN FEI - GRANTED");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("CHEN FEI");
  });

  it("WU ZIHONG-GRANTED", () => {
    const r = parseCaseFolderName("WU ZIHONG-GRANTED");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("WU ZIHONG");
  });

  it("LI DONGMIN-approved", () => {
    const r = parseCaseFolderName("LI DONGMIN-approved");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("LI DONGMIN");
  });

  it("HUANG AIPING 2ND APPEAL-REJECTED", () => {
    const r = parseCaseFolderName("HUANG AIPING 2ND APPEAL-REJECTED");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("HUANG AIPING");
    expect(r.round).toBe(2);
  });

  it("CHANG QING 2ND APPEAL- REJECTED", () => {
    const r = parseCaseFolderName("CHANG QING 2ND APPEAL- REJECTED");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("CHANG QING");
    expect(r.round).toBe(2);
  });

  it("DUAN GUOQIANG-RE APPEAL - FAILED", () => {
    const r = parseCaseFolderName("DUAN GUOQIANG-RE APPEAL - FAILED");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("DUAN GUOQIANG");
  });

  it("YANG HAIBO -2NDAPPEAL-GRANTED", () => {
    const r = parseCaseFolderName("YANG HAIBO -2NDAPPEAL-GRANTED");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("YANG HAIBO");
    expect(r.round).toBe(2);
  });

  // --- 真实文件夹名: REJECTED- 无空格 ---
  it("REJECTED-CHEN YINGQIAN", () => {
    const r = parseCaseFolderName("REJECTED-CHEN YINGQIAN");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("CHEN YINGQIAN");
  });

  it("REJECTED-LIANG QINGCHAO-2ND APPEAL", () => {
    const r = parseCaseFolderName("REJECTED-LIANG QINGCHAO-2ND APPEAL");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("LIANG QINGCHAO");
    expect(r.round).toBe(2);
  });

  // --- 紧贴状态词前缀(无空格) 必须从 name 剥掉，否则破坏去重 ---
  it("REJECTED-GONG ZIHONG 2nd Appeal (状态紧贴姓名)", () => {
    const r = parseCaseFolderName("REJECTED-GONG ZIHONG 2nd Appeal");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("GONG ZIHONG");
    expect(r.round).toBe(2);
  });

  it("APPROVED-WANG GUOLANG (状态紧贴姓名)", () => {
    const r = parseCaseFolderName("APPROVED-WANG GUOLANG");
    expect(r.status).toBe("approved");
    expect(r.name).toBe("WANG GUOLANG");
  });

  // --- 开头混入不可见私用区字符(U+F021)，前缀仍须剥净、去重一致 ---
  it("前导垃圾字符 U+F021 + REJECTED-GONG ZIHONG → 与干净版同 dedupKey", () => {
    const r = parseCaseFolderName("REJECTED-GONG ZIHONG 2nd Appeal");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("GONG ZIHONG");
    expect(r.round).toBe(2);
    // 与 Sep 2025 的 "Rejected-GONG ZIHONG" 必须得到同一个 dedup key
    expect(r.name).toBe(parseCaseFolderName("Rejected-GONG ZIHONG").name);
    // 真实磁盘文件夹首字节就是 U+F021，确保前导垃圾字符被剥净
    const dirty = parseCaseFolderName("REJECTED-GONG ZIHONG 2nd Appeal");
    expect(dirty.name).toBe("GONG ZIHONG");
    expect(dirty.status).toBe("rejected");
    expect(dirty.round).toBe(2);
  });

  // --- 真实文件夹名: REJECTED - 带 AppealID + 经办人 ---
  it("APPROVED - LEI GENHUA - ISC2604AM000493 - WU KS", () => {
    const r = parseCaseFolderName(
      "APPROVED - LEI GENHUA - ISC2604AM000493 - WU KS"
    );
    expect(r.status).toBe("approved");
    expect(r.name).toBe("LEI GENHUA");
    expect(r.appealId).toBe("ISC2604AM000493");
    expect(r.owner).toBe("WU KS");
  });

  it("REJECTED - HAO JIAHUAN - ISC2604AM000349 - BAO", () => {
    const r = parseCaseFolderName(
      "REJECTED - HAO JIAHUAN - ISC2604AM000349 - BAO"
    );
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("HAO JIAHUAN");
    expect(r.appealId).toBe("ISC2604AM000349");
    expect(r.owner).toBe("BAO");
  });

  it("REJECTED - LI CUI - ISC2604AM000961- JI YQ", () => {
    const r = parseCaseFolderName(
      "REJECTED - LI CUI - ISC2604AM000961- JI YQ"
    );
    expect(r.name).toBe("LI CUI");
    expect(r.appealId).toBe("ISC2604AM000961");
    expect(r.owner).toBe("JI YQ");
  });

  it("REJECTED - LIAN QINGCHAO 3RD APPEAL ISC2603AM000021 - GUAN YM", () => {
    const r = parseCaseFolderName(
      "REJECTED - LIAN QINGCHAO 3RD APPEAL ISC2603AM000021 - GUAN YM"
    );
    expect(r.name).toBe("LIAN QINGCHAO");
    expect(r.round).toBe(3);
    expect(r.appealId).toBe("ISC2603AM000021");
    expect(r.owner).toBe("GUAN YM");
  });

  // --- AE 类型 AppealID (2026 Jun/May) ---
  it("CHIM CHING YING - ISC2606AE001761 (无状态前缀)", () => {
    const r = parseCaseFolderName("CHIM CHING YING - ISC2606AE001761");
    expect(r.status).toBe("pending");
    expect(r.name).toBe("CHIM CHING YING");
    expect(r.appealId).toBe("ISC2606AE001761");
    expect(r.owner).toBeNull();
  });

  it("CHENG JUELIN - ISC2605AE002024 - GOH KS", () => {
    const r = parseCaseFolderName(
      "CHENG JUELIN - ISC2605AE002024 - GOH KS"
    );
    expect(r.status).toBe("pending");
    expect(r.name).toBe("CHENG JUELIN");
    expect(r.appealId).toBe("ISC2605AE002024");
    expect(r.owner).toBe("GOH KS");
  });

  it("REJECTED - ZHOU QIN - ISC2606AE000099 - BAO", () => {
    const r = parseCaseFolderName(
      "REJECTED - ZHOU QIN - ISC2606AE000099 - BAO"
    );
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("ZHOU QIN");
    expect(r.appealId).toBe("ISC2606AE000099");
    expect(r.owner).toBe("BAO");
  });

  // --- pending 前缀 ---
  it("pending - Hu Yajun 4th Appeal", () => {
    const r = parseCaseFolderName("pending - Hu Yajun 4th Appeal");
    expect(r.status).toBe("pending");
    expect(r.name).toBe("HU YAJUN");
    expect(r.round).toBe(4);
  });

  it("pending - CUI LIHUA 2ND APPEAL - YANG", () => {
    const r = parseCaseFolderName("pending - CUI LIHUA 2ND APPEAL - YANG");
    expect(r.status).toBe("pending");
    expect(r.name).toBe("CUI LIHUA");
    expect(r.round).toBe(2);
    expect(r.owner).toBe("YANG");
  });

  it("pend update LIANG CHENGBAO 3RD APPEAL - p", () => {
    const r = parseCaseFolderName("pend update LIANG CHENGBAO 3RD APPEAL - p");
    expect(r.status).toBe("pending");
    expect(r.name).toBe("LIANG CHENGBAO");
    expect(r.round).toBe(3);
  });

  // --- "own sponsor" / 非经办人末尾 ---
  it("HAN JIANHUA - own sponsor", () => {
    const r = parseCaseFolderName("HAN JIANHUA - own sponsor");
    expect(r.name).toBe("HAN JIANHUA");
    expect(r.owner).toBeNull();
  });

  it("REJECTED - ZHONG XIAOBIAO - own sponsor", () => {
    const r = parseCaseFolderName("REJECTED - ZHONG XIAOBIAO - own sponsor");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("ZHONG XIAOBIAO");
    expect(r.owner).toBeNull();
  });

  // --- 无状态前缀 + owner short code ---
  it("TRAN THI KHOA - p (pending marker, owner null)", () => {
    const r = parseCaseFolderName("TRAN THI KHOA - p");
    expect(r.name).toBe("TRAN THI KHOA");
    // "p" 是单字母 pending 提醒，非经办人
    expect(r.owner).toBeNull();
  });

  it("YANG SONGJIAO - p", () => {
    const r = parseCaseFolderName("YANG SONGJIAO - p");
    expect(r.name).toBe("YANG SONGJIAO");
  });

  // --- 3rd appeal (Dec 2025) ---
  it("REJECTED - Hu Yajun 3rd Appeal", () => {
    const r = parseCaseFolderName("REJECTED - Hu Yajun 3rd Appeal");
    expect(r.status).toBe("rejected");
    expect(r.name).toBe("HU YAJUN");
    expect(r.round).toBe(3);
  });

  // --- AppealID 黏连在名字后 (无空格) ---
  it("REJECTED - GUAN XIAOCHUN ISC2603AM000027- TAN", () => {
    const r = parseCaseFolderName(
      "REJECTED - GUAN XIAOCHUN ISC2603AM000027- TAN"
    );
    expect(r.name).toBe("GUAN XIAOCHUN");
    expect(r.appealId).toBe("ISC2603AM000027");
    expect(r.owner).toBe("TAN");
  });

  // --- MSLULU 经办人 ---
  it("APPROVED - WU LIMING DAWN  ISC2603AM000238 - MSLULU", () => {
    const r = parseCaseFolderName(
      "APPROVED - WU LIMING DAWN  ISC2603AM000238 - MSLULU"
    );
    expect(r.status).toBe("approved");
    expect(r.name).toBe("WU LIMING DAWN");
    expect(r.appealId).toBe("ISC2603AM000238");
    expect(r.owner).toBe("MSLULU");
  });
});

describe("classifyFile", () => {
  it.each([
    // Form 14
    ["form14.pdf", "Form 14"],
    ["form14.docx", "Form 14"],
    ["form14completed.pdf", "Form 14"],
    ["form14 (LI YANFANG).pdf", "Form 14"],
    ["form14(吴丽兰).pdf", "Form 14"],
    // 申诉信
    ["APPEAL LETTER.docx", "申诉信"],
    ["APPEAL LETTER.pdf", "申诉信"],
    ["APPEAL LETTER -HU YAJUN.pdf", "申诉信"],
    ["APPEAL LETTER(吴丽兰).pdf", "申诉信"],
    // 护照
    ["PASSPORT.jpg", "护照"],
    ["护照.jpg", "护照"],
    ["护照.pdf", "护照"],
    // 户口本
    ["HOUSEHOLD REGISTER.jpg", "户口本"],
    ["户口本.pdf", "户口本"],
    ["户口1.jpg", "户口本"],
    // 在职证明
    ["Incumbency Certification（在职证明）.docx", "在职证明"],
    ["Incumbency Certification(在职证明.pdf", "在职证明"],
    ["BANK STATEMENT_EMPLOYMENT CERT.pdf", "在职证明"],
    // 新加坡酒店证明
    ["WANG GUOLANG 新加坡酒店.pdf", "新加坡酒店证明"],
    // 担保人材料
    ["guarantor name card.jpg", "担保人材料"],
    ["担保人签名.docx", "担保人材料"],
    // ICA 拒信
    ["APLOUT_ISC2603AM000466_00.pdf", "ICA 拒信"],
    ["APLOUT_ISC2603AM000140_00 2.pdf", "ICA 拒信"],
    // 身份证/NRIC
    ["IC.pdf", "身份证/NRIC"],
    ["身份证.jpg", "身份证/NRIC"],
    ["IC BACK.jpg", "身份证/NRIC"],
    ["IC1.jpg", "身份证/NRIC"],
    ["IC2.jpg", "身份证/NRIC"],
    ["id1.jpg", "身份证/NRIC"],
    ["ID.pdf", "身份证/NRIC"],
    ["HUSBAND ID.pdf", "身份证/NRIC"],
    ["CHINA ID.pdf", "身份证/NRIC"],
    ["FIN.jpg", "身份证/NRIC"],
    ["FIN1.jpg", "身份证/NRIC"],
    // 其他
    ["WechatIMG123.jpg", "其他/证据材料"],
    ["随便.bin", "其他/证据材料"],
    ["bank.pdf", "其他/证据材料"],
    ["报告.jpg", "其他/证据材料"],
  ])("%s→%s", (f, s) => expect(classifyFile(f).slot).toBe(s));

  it("Incumbency 含在职证明(优先于身份证 IC 规则)", () => {
    // Incumbency 开头含 IC，确认走在职证明槽
    expect(classifyFile("Incumbency Cert.pdf").slot).toBe("在职证明");
  });
});
