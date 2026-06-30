// 公司内部文件库的 6 个内容 tab。folderPrefix = documents.folder_path 的首段,
// 必须与录入脚本 importCompanyFiles.ts 写入的路径一致。
export type CompanyFileSection = {
  value: string; // 路由 path 段
  folderPrefix: string; // folder_path 首段(中文)
  labelKey: string; // i18n key
};

export const companyFileSections: CompanyFileSection[] = [
  { value: "rent", folderPrefix: "租房&租金", labelKey: "documents.tabs.rent" },
  { value: "salary", folderPrefix: "工资", labelKey: "documents.tabs.salary" },
  { value: "contracts", folderPrefix: "合同", labelKey: "documents.tabs.contracts" },
  { value: "invoices", folderPrefix: "发票", labelKey: "documents.tabs.invoices" },
  { value: "certificates", folderPrefix: "证明&模板", labelKey: "documents.tabs.certificates" },
  { value: "fees", folderPrefix: "收费标准", labelKey: "documents.tabs.fees" }
];
