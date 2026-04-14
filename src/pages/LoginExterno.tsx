import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Eye, EyeOff, UserCheck } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

const LoginExterno: React.FC = () => {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-external", {
        body: { action: "login", email: email.trim(), senha },
      });

      if (error || data?.error) {
        setErro(data?.error || "Erro ao conectar.");
        setLoading(false);
        return;
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      // Store external professional info in sessionStorage
      if (data?.external) {
        sessionStorage.setItem("external_professional", JSON.stringify(data.external));
      }

      navigate("/externo/agendar");
    } catch {
      setErro("Erro ao conectar ao servidor.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center text-sm text-white opacity-70 hover:opacity-100 mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Link>
        <Card className="shadow-elevated border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center mx-auto mb-4">
                <UserCheck className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold font-display text-foreground">Acesso Externo</h1>
              <p className="text-muted-foreground text-sm mt-1">Profissionais externos autorizados</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Input id="senha" type={showSenha ? "text" : "password"} placeholder="Sua senha" value={senha} onChange={e => setSenha(e.target.value)} className="h-11 pr-10" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {erro && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive text-center">{erro}</motion.p>
              )}
              <Button type="submit" className="w-full h-11 gradient-primary text-primary-foreground font-semibold" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default LoginExterno;
