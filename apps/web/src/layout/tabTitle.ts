import { createContext, useContext } from "react";

// 让具体页面在异步数据就绪后回填顶部标签页的标题(如案件详情拿到客户名后显示 "EP / 客户名")。
// 默认是空操作,只有被 AppShell 的 Provider 包裹时才真正生效。
export type SetTabTitle = (path: string, title: string) => void;

export const TabTitleContext = createContext<SetTabTitle>(() => {});

export function useSetTabTitle(): SetTabTitle {
  return useContext(TabTitleContext);
}
