import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import logoSms from "@/assets/logo-sms.jpeg";

type AuthorizationDetails = {
  authorization_id: string;
  client: { name: string; uri?: string; logo_uri?: string };
  scope: string;
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!authorizationId) {
        setError("Solicitação de autorização inválida ou incompleta.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      const { data, error: requestError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        return;
      }
      if (data && "redirect_url" in data) {
        window.location.replace(data.redirect_url);
        return;
      }
      setDetails(data as AuthorizationDetails);
    };

    load();
    return () => { active = false; };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    setError(null);
    const method = approve
      ? supabase.auth.oauth.approveAuthorization.bind(supabase.auth.oauth)
      : supabase.auth.oauth.denyAuthorization.bind(supabase.auth.oauth);
    const { data, error: decisionError } = await method(authorizationId, { skipBrowserRedirect: true });
    if (decisionError) {
      setError(decisionError.message);
      setBusy(false);
      return;
    }
    if (!data?.redirect_url) {
      setError("O serviço de autorização não retornou o destino da conexão.");
      setBusy(false);
      return;
    }
    window.location.replace(data.redirect_url);
  };

  return (
    <main className="min-h-screen gradient-hero flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-elevated border-0">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center gap-4 mb-6">
            <img src={logoSms} alt="SMS Oriximiná" className="h-14 w-14 rounded-lg object-cover" />
            <div>
              <p className="text-sm text-muted-foreground">Integração segura</p>
              <h1 className="text-xl font-bold text-foreground">Autorizar acesso ao sistema</h1>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive">
              <ShieldCheck />
              <AlertTitle>Não foi possível autorizar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : !details ? (
            <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando solicitação…
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-lg border bg-muted/40 p-4">
                <p className="font-semibold text-foreground">{details.client?.name || "Aplicativo conectado"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Solicita acesso somente leitura para buscar pacientes e consultar agendas conforme suas permissões.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                O aplicativo conectado atuará com sua conta. Nenhuma informação poderá ser criada, alterada ou excluída por estas ferramentas.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" disabled={busy} onClick={() => decide(false)}>Negar</Button>
                <Button disabled={busy} onClick={() => decide(true)}>
                  {busy && <Loader2 className="animate-spin" />} Autorizar conexão
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}