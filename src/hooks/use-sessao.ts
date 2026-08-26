import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { erp } from "@/lib/erp/db";
import type { Utilizador } from "@/lib/erp/tipos";

export interface Sessao {
  userId: string;
  email: string;
  utilizador: Utilizador | null;
}

export function useSessao() {
  return useQuery<Sessao | null>({
    queryKey: ["sessao"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: linha } = await erp()
        .from("utilizadores")
        .select("*")
        .eq("user_id", user.id)
        .is("eliminado_em", null)
        .maybeSingle();
      return {
        userId: user.id,
        email: user.email ?? "",
        utilizador: (linha ?? null) as Utilizador | null,
      };
    },
  });
}
