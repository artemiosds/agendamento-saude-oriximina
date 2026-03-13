import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { lovable } from "@/integrations/lovable/index";
import logoSms from "@/assets/logo-sms.jpeg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Loader2, ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Step = 'login' | 'verify' | 'newpass' | 'done';

const Login: React.FC = () => {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Recovery state
  const [recoveryStep, setRecoveryStep] = useState<Step>('login');
  const [recCpf, setRecCpf] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmar, setRecConfirmar] = useState('');
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recErro, setRecErro] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!usuario.trim() || !senha.trim()) {
      setErro("Preencha todos os campos.");
      return;
    }
    setLoading(true);
    const result = await login(usuario.trim(), senha);
    setLoading(false);
    if (result.success) {
      navigate("/painel");
    } else {
      setErro(result.error || "Erro ao fazer login.");
    }
  };

  const handleVerify = async () => {
    setRecErro('');
    if (!recCpf.trim() || !recEmail.trim()) {
      setRecErro('Preencha CPF e e-mail.');
      return;
    }
    setRecLoading(true);
    // Just advance to new password step - actual validation happens on save
    setRecoveryStep('newpass');
    setRecLoading(false);
  };

  const handleResetPassword = async () => {
    setRecErro('');
    if (recNovaSenha.length < 6) {
      setRecErro('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (recNovaSenha !== recConfirmar) {
      setRecErro('As senhas não conferem.');
      return;
    }
    setRecLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { cpf: recCpf, email: recEmail, novaSenha: recNovaSenha, tipo: 'funcionario' },
      });
      if (error || data?.error) {
        setRecErro(data?.error || 'Erro ao redefinir senha.');
        setRecLoading(false);
        return;
      }
      setRecoveryStep('done');
      toast.success('Senha alterada com sucesso!');
      setTimeout(() => {
        setRecoveryStep('login');
        setRecCpf(''); setRecEmail(''); setRecNovaSenha(''); setRecConfirmar('');
      }, 3000);
    } catch {
      setRecErro('Erro ao conectar ao servidor.');
    }
    setRecLoading(false);
  };

  // Recovery screens
  if (recoveryStep !== 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-hero p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <button onClick={() => { setRecoveryStep('login'); setRecErro(''); }} className="inline-flex items-center text-sm text-white opacity-70 hover:opacity-100 mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao login
          </button>
          <Card className="shadow-elevated border-0">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-7 h-7 text-primary-foreground" />
                </div>
                <h2 className="text-xl font-bold font-display text-foreground">Recuperar Senha</h2>
                <p className="text-sm text-muted-foreground mt-1">Área de funcionários</p>
              </div>

              {recoveryStep === 'done' ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
                  <p className="text-success font-semibold">✅ Senha alterada com sucesso!</p>
                  <p className="text-sm text-muted-foreground">Você já pode fazer login com a nova senha.</p>
                </motion.div>
              ) : recoveryStep === 'verify' ? (
                <div className="space-y-4">
                  <div><Label>CPF</Label><Input value={recCpf} onChange={e => setRecCpf(e.target.value)} placeholder="000.000.000-00" /></div>
                  <div><Label>E-mail cadastrado</Label><Input type="email" value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="seu@email.com" /></div>
                  {recErro && <p className="text-sm text-destructive text-center">{recErro}</p>}
                  <Button onClick={handleVerify} className="w-full gradient-primary text-primary-foreground" disabled={recLoading}>
                    {recLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Verificar dados
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative">
                    <Label>Nova senha</Label>
                    <div className="relative">
                      <Input type={showNova ? 'text' : 'password'} value={recNovaSenha} onChange={e => setRecNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
                      <button type="button" onClick={() => setShowNova(!showNova)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showNova ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <Label>Confirmar nova senha</Label>
                    <div className="relative">
                      <Input type={showConfirmar ? 'text' : 'password'} value={recConfirmar} onChange={e => setRecConfirmar(e.target.value)} placeholder="Repita a senha" />
                      <button type="button" onClick={() => setShowConfirmar(!showConfirmar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  {recErro && <p className="text-sm text-destructive text-center">{recErro}</p>}
                  <Button onClick={handleResetPassword} className="w-full gradient-primary text-primary-foreground" disabled={recLoading}>
                    {recLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Salvar nova senha
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="inline-flex items-center text-sm text-white opacity-70 hover:opacity-100 mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar
        </Link>

        <Card className="shadow-elevated border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <img src={logoSms} alt="SMS Oriximiná" className="w-20 h-20 mx-auto rounded-2xl object-cover mb-4 shadow-md" />
              <h1 className="text-2xl font-bold font-display text-foreground">SMS Oriximiná</h1>
              <p className="text-muted-foreground text-sm mt-1">Secretaria Municipal de Saúde</p>
              <div className="mt-3 px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg">
                <p className="text-amber-700 text-sm font-bold text-center">🔒 Acesso Somente para Funcionários</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="usuario" className="text-foreground">Usuário</Label>
                <Input id="usuario" placeholder="Digite seu usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-11" autoComplete="username" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha" className="text-foreground">Senha</Label>
                <div className="relative">
                  <Input id="senha" type={showSenha ? 'text' : 'password'} placeholder="Digite sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11 pr-10" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {erro && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-destructive text-center">
                  {erro}
                </motion.p>
              )}

              <Button type="submit" className="w-full h-11 gradient-primary text-primary-foreground font-semibold" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>

              <button type="button" onClick={() => { setRecoveryStep('verify'); setRecErro(''); }} className="w-full text-sm text-primary hover:underline">
                Esqueci minha senha
              </button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
