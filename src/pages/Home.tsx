import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  Shield,
  Phone,
  MapPin,
  Clock,
  Heart,
  Stethoscope,
  Baby,
  Smile,
  Activity,
  Brain,
  Apple,
  User,
  HeartHandshake,
  HandMetal,
  UserCheck,
  ChevronDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import logoSms from "@/assets/logo-sms.jpeg";
import heroAtendimento from "@/assets/hero-atendimento.webp";

const services = [
  { icon: Stethoscope, title: "Clínica Geral", desc: "Consultas médicas gerais" },
  { icon: Baby, title: "Pediatria", desc: "Atendimento infantil" },
  { icon: Smile, title: "Odontologia", desc: "Saúde bucal" },
  { icon: Heart, title: "Enfermagem", desc: "Procedimentos e curativos" },
  { icon: Activity, title: "Fisioterapia", desc: "Reabilitação e movimento" },
  { icon: Brain, title: "Psicologia", desc: "Saúde mental e bem-estar" },
  { icon: Apple, title: "Nutrição", desc: "Orientação alimentar" },
  { icon: Baby, title: "Odontopediatria", desc: "Saúde bucal infantil" },
  { icon: HeartHandshake, title: "Assistência Social", desc: "Apoio e orientação social" },
  { icon: HandMetal, title: "Terapia Ocupacional", desc: "Reabilitação funcional" },
];

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="SMS Oriximiná — página inicial">
            <img src={logoSms} alt="Logo oficial SMS Oriximiná" width={64} height={64} className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" />
            <span className="text-sm font-semibold leading-snug text-foreground sm:text-base">Prefeitura de Oriximiná<span className="block text-xs font-normal text-muted-foreground sm:text-sm">Secretaria Municipal de Saúde</span></span>
          </Link>
          <nav aria-label="Navegação principal" className="flex w-full items-center justify-between gap-3 text-sm sm:w-auto sm:gap-6">
            <a href="#servicos" className="text-muted-foreground hover:text-foreground">Serviços</a>
            <a href="#contato" className="text-muted-foreground hover:text-foreground">Contato</a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2"><Shield className="h-4 w-4" aria-hidden="true" />Área Restrita<ChevronDown className="h-4 w-4" aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild><Link to="/login" className="gap-2"><Shield className="h-4 w-4" />Painel do Servidor</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/externo" className="gap-2"><UserCheck className="h-4 w-4" />Acesso Regulador / Externo</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-sky-50 text-slate-900">
        <img src={heroAtendimento} alt="Profissional de saúde acolhendo uma paciente" width={1600} height={800} loading="eager" className="block aspect-[2/1] w-full object-cover lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[58%]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-sky-50 via-sky-50/95 to-transparent lg:block" />
        <div className="container relative mx-auto px-4 py-10 sm:py-14 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl"
          >
            <p className="mb-3 text-sm font-semibold text-sky-800">Saúde pública de Oriximiná</p>
            <h1 className="text-3xl md:text-5xl font-bold font-display leading-tight mb-4">
              Sua saúde, mais perto de você.
            </h1>
            <p className="text-lg opacity-90 mb-8">
              Agendamento online e serviços de saúde para você e sua família.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/agendar">
                <Button
                  size="lg"
                  className="bg-gradient-to-br from-[hsl(200,55%,38%)] to-[hsl(200,60%,28%)] text-white font-semibold tracking-wide shadow-[0_6px_14px_rgba(0,0,0,0.15)] hover:brightness-105 hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 w-full sm:w-auto"
                >
                  <Calendar className="w-5 h-5 mr-2" />
                  Agendar Online
                </Button>
              </Link>
              <Link to="/portal">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-sky-700 bg-white text-sky-800 hover:bg-sky-100 hover:text-sky-900 w-full sm:w-auto"
                >
                  <User className="w-5 h-5 mr-2" />
                  Consultar Agendamento
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services */}
      <section id="servicos" className="container mx-auto scroll-mt-6 px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold font-display text-foreground text-center mb-8">Nossos Serviços</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="shadow-card border-0 hover:shadow-elevated transition-shadow text-center">
                <CardContent className="p-6">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
                    <s.icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h3 className="font-semibold font-display text-foreground mb-1">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Info */}
      <section id="contato" className="scroll-mt-6 bg-muted/50">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <MapPin className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Endereço</h3>
                <p className="text-sm text-muted-foreground">RUA BARÃO DO RIO BRANCO, Nº 2336 CENTRO, CEP: 68270-000</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Horário</h3>
                <p className="text-sm text-muted-foreground">Seg a Sex: 08:00 às 18:00</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Contato</h3>
                <p className="text-sm text-muted-foreground">
                  (93) 3544-1587
                  <br />
                  WhatsApp: (93) 99999-0000
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground/60 text-center py-6 text-sm">
        SMS Oriximiná © {new Date().getFullYear()} — Secretaria Municipal de Saúde
        <nav aria-label="Acessos institucionais" className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 px-4">
          <a href="#contato" className="hover:text-sidebar-foreground">Informações ao Cidadão</a>
          <Link to="/login" className="hover:text-sidebar-foreground">Acesso do Servidor</Link>
          <Link to="/externo" className="hover:text-sidebar-foreground">Acesso Regulador / Externo</Link>
        </nav>
      </footer>
    </div>
  );
};

export default Home;
