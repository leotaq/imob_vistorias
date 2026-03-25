"use client";

import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import { notifyAuthStateChanged } from "@/hooks/useActor";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

export default function AcessoPendentePage() {
  const router = useRouter();

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    notifyAuthStateChanged();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl border border-amber-200 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Beta com Google Login
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Seu acesso ainda esta pendente
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Sua conta Google ja foi reconhecida pela beta, mas ainda precisa ser vinculada
          manualmente a uma pessoa existente no sistema. Um admin pode fazer isso na area
          administrativa usando o PIN do sistema.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Enquanto isso, voce nao consegue acessar as telas operacionais da beta.
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => router.refresh()}>
            Atualizar status
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/pessoas")}>
            Abrir Admin
          </Button>
          <Button variant="secondary" onClick={signOut}>
            Sair da conta Google
          </Button>
        </div>
      </div>
    </div>
  );
}
