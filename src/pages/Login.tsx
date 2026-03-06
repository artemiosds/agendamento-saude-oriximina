import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const Login: React.FC = () => {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!usuario.trim() || !senha.trim()) {
      setErro('Preencha todos os campos.');
      return;
    }
    setLoading(true);
    const result = await login(usuario.trim(), senha);
    setLoading(false);
    if (result.success) {
      navigate('/painel');
    } else {
      setErro(result.error || 'Erro ao fazer login.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-elevated border-0">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-primary mb-4">
                <Shield className="w-8 h-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold font-display text-foreground">
                SMS Oriximiná
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Secretaria Municipal de Saúde
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="usuario" className="text-foreground">Usuário</Label>
                <Input
                  id="usuario"
                  placeholder="Digite seu usuário"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="h-11"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha" className="text-foreground">Senha</Label>
                <Input
                  id="senha"
                  type="password"
                  placeholder="Digite sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-11"
                  autoComplete="current-password"
                />
              </div>

              {erro && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm text-destructive text-center"
                >
                  {erro}
                </motion.p>
              )}

              <Button
                type="submit"
                className="w-full h-11 gradient-primary text-primary-foreground font-semibold"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default Login;
