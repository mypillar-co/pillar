import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CurrentMember {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  member_type: string;
  status: string;
  title: string | null;
  bio: string | null;
  photo_url: string | null;
  address: string | null;
  show_in_directory: boolean;
  join_date: string | null;
}

const MemberAuthCtx = createContext<{
  member: CurrentMember | null;
  loading: boolean;
  refetch: () => void;
} | null>(null);

export function MemberAuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = useQuery<CurrentMember | null>({
    queryKey: ["/api/members/me"],
    queryFn: async () => {
      const res = await fetch("/api/members/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch session");
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });
  return (
    <MemberAuthCtx.Provider value={{ member: data ?? null, loading: isLoading, refetch }}>
      {children}
    </MemberAuthCtx.Provider>
  );
}

export function useMember() {
  const ctx = useContext(MemberAuthCtx);
  if (!ctx) throw new Error("useMember must be used inside MemberAuthProvider");
  return ctx;
}

export function useMemberLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/members/logout", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      qc.setQueryData(["/api/members/me"], null);
      qc.invalidateQueries();
    },
  });
}
