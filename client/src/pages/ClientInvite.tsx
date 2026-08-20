import { ArrowRight, Building2, CheckCircle2, Clock3, LogIn, Mail, ShieldCheck } from "lucide-react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ClientInvite() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ? decodeURIComponent(params.token) : "";
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const invitationQuery = trpc.provider.getInvitation.useQuery(
    { token },
    { enabled: token.length >= 20, retry: false },
  );
  const acceptMutation = trpc.provider.acceptInvitation.useMutation({
    onSuccess: () => {
      toast.success("Votre espace client est prêt.");
      window.location.href = "/";
    },
    onError: error => toast.error(error.message),
  });

  const loginWithInvite = () => startLogin(`/invite/${encodeURIComponent(token)}`);
  const isBusy = authLoading || invitationQuery.isLoading;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dff7f2,_transparent_42%),linear-gradient(135deg,#fffaf2_0%,#f7f4ff_100%)] px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <Card className="w-full overflow-hidden rounded-[2rem] border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(51,65,85,0.14)] backdrop-blur">
          <CardHeader className="space-y-5 p-7 sm:p-9">
            <div className="flex items-center justify-between gap-3">
              <Badge className="bg-indigo-50 text-indigo-700" variant="outline"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Accès sécurisé</Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">AgencyManager Pro</span>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-teal-500 text-white shadow-lg shadow-indigo-200"><Building2 className="h-8 w-8" /></div>
            <div>
              <CardTitle className="text-3xl tracking-tight">Votre espace client</CardTitle>
              <CardDescription className="mt-2 text-base leading-7">Ce lien vous permet d’accéder à un environnement de gestion indépendant, préparé par votre prestataire.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-7 pb-8 sm:px-9 sm:pb-9">
            {!token || invitationQuery.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{!token ? "Le lien d’accès est incomplet." : invitationQuery.error?.message || "Ce lien d’accès n’est pas disponible."}</div>
            ) : isBusy ? (
              <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">Vérification du lien d’accès…</div>
            ) : invitationQuery.data ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-indigo-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-500">Espace</p><p className="mt-1 font-bold text-indigo-950">{invitationQuery.data.projectName}</p></div>
                  <div className="rounded-2xl bg-teal-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-600">Compte invité</p><p className="mt-1 break-all font-semibold text-teal-950">{invitationQuery.data.invitedEmail}</p></div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span>Ce lien est valable jusqu’au {new Date(invitationQuery.data.expiresAt).toLocaleString("fr-FR")} et ne peut être accepté qu’avec l’adresse email invitée.</span></div>
                {isAuthenticated ? (
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><Mail className="h-4 w-4" /> Connecté avec {user?.email || "votre compte"}</div><Button className="w-full bg-indigo-600 text-white hover:bg-indigo-500" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate({ token })}>{acceptMutation.isPending ? "Activation…" : "Ouvrir mon espace client"}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
                ) : (
                  <div className="space-y-3"><p className="text-sm leading-6 text-slate-600">Connectez-vous avec l’adresse invitée pour activer votre compte et ouvrir cet espace.</p><Button className="w-full bg-indigo-600 text-white hover:bg-indigo-500" onClick={loginWithInvite}><LogIn className="mr-2 h-4 w-4" /> Se connecter et continuer</Button></div>
                )}
              </>
            ) : null}
            {acceptMutation.isSuccess && <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Accès activé, redirection en cours.</div>}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
