import { z } from "zod";

export const loginSchema = z.object({
  // 用户名登录:支持纯用户名(如 jingyi)或邮箱,不强制邮箱格式
  email: z.string().trim().min(1),
  password: z.string().min(1)
});

export type LoginInput = z.infer<typeof loginSchema>;
