// 公司内部文件库的内容 tab。folderPrefix = documents.folder_path 的首段,
// 必须与录入脚本 importCompanyFiles.ts 写入的路径一致。
export type CompanyFileSection = {
  value: string; // 路由 path 段
  folderPrefix: string; // folder_path 首段(中文)
  labelKey: string; // i18n key
  withMonth?: boolean; // 上传时可选所属月份 + 列表显示月份(工资)
};

export const companyFileSections: CompanyFileSection[] = [
  { value: "rent", folderPrefix: "租房&租金", labelKey: "documents.tabs.rent" },
  { value: "salary", folderPrefix: "工资", labelKey: "documents.tabs.salary", withMonth: true },
  { value: "contracts", folderPrefix: "合同", labelKey: "documents.tabs.contracts" },
  { value: "invoices", folderPrefix: "发票", labelKey: "documents.tabs.invoices" },
  { value: "certificates", folderPrefix: "证明&模板", labelKey: "documents.tabs.certificates" },
  { value: "bizfile", folderPrefix: "BizFile", labelKey: "documents.tabs.bizfile" }
];
