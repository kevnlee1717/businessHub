import { z } from "zod";

export const loginSchema = z.object({
  // 用户名登录:支持纯用户名(如 jingyi)或邮箱,不强制邮箱格式
  email: z.string().trim().min(1),
  password: z.string().min(1)
});

export const passwordRules = [
  { key: "minLength", label: "至少 8 位", test: (s: string) => s.length >= 8 },
  { key: "uppercase", label: "包含大写字母", test: (s: string) => /[A-Z]/.test(s) },
  { key: "lowercase", label: "包含小写字母", test: (s: string) => /[a-z]/.test(s) },
  { key: "number", label: "包含数字", test: (s: string) => /[0-9]/.test(s) },
  { key: "special", label: "包含特殊符号(如 !@#$%)", test: (s: string) => /[^A-Za-z0-9]/.test(s) }
] as const;

export const passwordSchema = z.string().superRefine((value, ctx) => {
  for (const rule of passwordRules) {
    if (!rule.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `密码需${rule.label}`
      });
    }
  }
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).optional(),
  new_password: passwordSchema
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1),
  name_en: z.string().trim().optional().nullable(),
  email: z.string().trim().min(1),
  phone: z.string().trim().optional().nullable()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
