/**
 * ICA 申诉工作流模板步骤定义（纯数据，无副作用）
 * 被 seed.ts 引用（新建模板时使用），也被 applyIcaTemplate.ts（更新已有模板）使用。
 */

export const icaTemplateSteps = [
  {
    stepOrder: 1,
    name: "签约",
    nameEn: "Sign Contract",
    requiredDocuments: [{ name: "签约合同", name_en: "Service Contract", required: true }]
  },
  {
    stepOrder: 2,
    name: "搜集资料",
    nameEn: "Collect Documents",
    requiredDocuments: [
      { name: "护照", name_en: "Passport", required: true },
      { name: "身份证/NRIC", name_en: "ID Card", required: true },
      { name: "户口本", name_en: "Household Register", required: false },
      { name: "在职证明", name_en: "Incumbency Certificate", required: false },
      { name: "新加坡酒店证明", name_en: "Hotel Proof", required: false },
      { name: "ICA 拒信", name_en: "ICA Rejection Letter", required: false },
      { name: "其他/证据材料", name_en: "Supporting Evidence", required: false }
    ]
  },
  {
    stepOrder: 3,
    name: "写申诉信",
    nameEn: "Write Appeal Letter",
    requiredDocuments: [{ name: "申诉信", name_en: "Appeal Letter", required: true }]
  },
  {
    stepOrder: 4,
    name: "填表格",
    nameEn: "Fill Forms",
    requiredDocuments: [{ name: "Form 14", name_en: "Form 14", required: true }]
  },
  {
    stepOrder: 5,
    name: "选担保人",
    nameEn: "Select Guarantor",
    description: "从担保人库选(后续版本)",
    requiredDocuments: [{ name: "担保人材料", name_en: "Guarantor Documents", required: true }]
  },
  {
    stepOrder: 6,
    name: "担保人扫脸",
    nameEn: "Guarantor Face Scan",
    requiredDocuments: []
  },
  {
    stepOrder: 7,
    name: "提交",
    nameEn: "Submit",
    description: "结果一般3个月后,失败需重走担保人扫脸再提交(后续版本记录每次提交/拒绝时间)",
    requiredDocuments: []
  }
];
