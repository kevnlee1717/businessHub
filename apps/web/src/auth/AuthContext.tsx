import {
  type UseMutateAsyncFunction,
  useMutation,
  useQuery,
  useQueryClient
} from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo
} from "react";
import {
  UnauthorizedError,
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  type User
} from "../api/client";

type LoginVariables = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  login: UseMutateAsyncFunction<{ user: User }, Error, LoginVariables>;
  logout: UseMutateAsyncFunction<{ ok: true }, Error, void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const meQueryKey = ["auth", "me"] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: meQueryKey,
    queryFn: getMe,
    retry: false,
    staleTime: 60_000,
    throwOnError: false
  });

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginRequest(email, password),
    onSuccess: async (data) => {
      queryClient.setQueryData(meQueryKey, data);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: async () => {
      queryClient.setQueryData(meQueryKey, null);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
    }
  });

  const isUnauthorized = meQuery.error instanceof UnauthorizedError;
  const user = isUnauthorized ? null : meQuery.data?.user ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      login: loginMutation.mutateAsync,
      logout: logoutMutation.mutateAsync
    }),
    [loginMutation.mutateAsync, logoutMutation.mutateAsync, meQuery.isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
