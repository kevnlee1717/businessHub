import "@mantine/core/styles.css";
import "./theme.css";
import "./i18n";

import {
  Badge,
  Button,
  Card,
  createTheme,
  MantineProvider,
  MultiSelect,
  Paper,
  Select,
  Table,
} from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";

const queryClient = new QueryClient();
const root = document.getElementById("root");
const theme = createTheme({
  fontFamily:
    '"Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif',
  fontSizes: { xs: "12px", sm: "13px", md: "14px", lg: "16px", xl: "18px" },
  // element-admin: 控件/卡片圆角统一 4px
  defaultRadius: "sm",
  primaryColor: "dark",
  autoContrast: true,
  components: {
    // el-card 风格:1px 边框 #ebeef5 + 圆角 4px + 轻阴影
    Paper: Paper.extend({
      defaultProps: {
        withBorder: true,
        radius: "sm",
        shadow: "xs",
      },
    }),
    Card: Card.extend({
      defaultProps: {
        radius: "sm",
        withBorder: true,
        shadow: "xs",
      },
    }),
    Table: Table.extend({
      defaultProps: {
        verticalSpacing: "sm",
        horizontalSpacing: "md",
      },
    }),
    Button: Button.extend({
      defaultProps: {
        radius: "sm",
      },
    }),
    Badge: Badge.extend({
      defaultProps: {
        radius: "sm",
      },
    }),
    Select: Select.extend({
      defaultProps: {
        searchable: true,
        maxDropdownHeight: 260,
        nothingFoundMessage: "无匹配",
        comboboxProps: { withinPortal: true },
      },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: {
        searchable: true,
        maxDropdownHeight: 260,
        nothingFoundMessage: "无匹配",
        comboboxProps: { withinPortal: true },
      },
    }),
  },
});

if (!root) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>
);
