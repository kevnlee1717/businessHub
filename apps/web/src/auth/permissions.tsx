import { type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function useCan(perm: string): boolean {
  return useAuth().can(perm);
}

export function Can({
  perm,
  children,
  fallback = null
}: {
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
}): JSX.Element {
  return <>{useCan(perm) ? children : fallback}</>;
}
