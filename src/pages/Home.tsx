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
import logoSms from "@/assets/logo-sms-transparente.png";
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
      <header className="border-b border-primary/10 bg-background shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-5 px-6 py-4 sm:px-10 lg:px-16">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="SMS Oriximiná — página inicial">
            <img src={logoSms} alt="Logo oficial SMS Oriximiná" width={96} height={96} className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24" />
            <span className="min-w-0 text-base font-semibold leading-snug text-foreground sm:text-lg">Prefeitura de Oriximiná<span className="mt-1 block text-sm font-normal text-muted-foreground sm:text-base">Secretaria Municipal de Saúde</span></span>
          </Link>
          <nav aria-label="Navegação principal" className="flex w-full flex-wrap items-center justify-between gap-3 text-base sm:w-auto sm:gap-6">
            <a href="#servicos" className="inline-flex min-h-12 items-center font-medium text-muted-foreground hover:text-foreground">Serviços</a>
            <a href="#contato" className="inline-flex min-h-12 items-center font-medium text-muted-foreground hover:text-foreground">Contato</a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-12 gap-2 rounded-xl border-primary/25 px-4 text-base font-semibold text-foreground shadow-sm hover:bg-primary/5 sm:px-5"><Shield className="h-5 w-5" aria-hidden="true" />Área Restrita<ChevronDown className="h-5 w-5" aria-hidden="true" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-primary/15 p-2 shadow-xl">
                <DropdownMenuItem asChild><Link to="/login" aria-label="Painel do Servidor" className="min-h-20 items-start gap-3 rounded-xl px-3 py-4"><Shield className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0"><span className="block text-base font-semibold">Painel do Servidor</span><span className="mt-1 block whitespace-normal text-sm leading-relaxed text-muted-foreground">Acesso da equipe e administração.</span></span></Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/externo" aria-label="Acesso Regulador / Externo" className="min-h-20 items-start gap-3 rounded-xl px-3 py-4"><UserCheck className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0"><span className="block whitespace-normal text-base font-semibold">Acesso Regulador / Externo</span><span className="mt-1 block whitespace-normal text-sm leading-relaxed text-muted-foreground">Acesso de reguladores e parceiros.</span></span></Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-sky-50 text-slate-900">
        <img src={heroAtendimento} alt="Profissional de saúde acolhendo uma paciente" width={1600} height={800} loading="eager" className="block aspect-[2/1] w-full object-cover lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[58%]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,#f0f9ff_0%,#f0f9ff_38%,rgba(240,249,255,0.75)_48%,rgba(240,249,255,0.15)_62%,transparent_76%)] lg:block" />
        <div className="container relative mx-auto px-6 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl lg:w-[48%]"
          >
            <p className="mb-4 inline-flex rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-800">Saúde pública de Oriximiná</p>
            <h1 className="text-3xl md:text-5xl font-bold font-display leading-tight mb-4 text-balance">
              Sua saúde, mais perto de você.
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-slate-700">
              Agendamento online e serviços de saúde para você e sua família.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/agendar">
                <Button
                  size="lg"
                  className="h-14 rounded-xl bg-gradient-to-br from-[hsl(200,55%,38%)] to-[hsl(200,60%,28%)] px-6 text-base text-white font-semibold shadow-[0_6px_14px_rgba(0,0,0,0.15)] hover:brightness-105 active:scale-[0.97] transition-all duration-200 w-full sm:w-auto"
                >
                  <Calendar className="w-5 h-5 mr-2" />
                  Agendar Online
                </Button>
              </Link>
              <Link to="/portal">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 rounded-xl border-sky-700 bg-white px-6 text-base font-semibold text-sky-800 hover:bg-sky-100 hover:text-sky-900 w-full sm:w-auto"
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
      <section id="servicos" className="container mx-auto scroll-mt-6 px-6 py-12 sm:px-10 md:py-16 lg:px-16">
        <h2 className="mb-3 text-center text-3xl font-bold font-display text-foreground">Nossos Serviços</h2>
        <p className="mx-auto mb-9 max-w-xl text-center text-base leading-relaxed text-muted-foreground">Cuidado e acolhimento para você em cada etapa da vida.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {services.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="h-full rounded-2xl border border-primary/10 shadow-sm hover:shadow-card transition-shadow text-center">
                <CardContent className="p-6 sm:px-4 sm:py-7">
                  <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-5 shadow-sm">
                    <s.icon className="w-7 h-7 text-primary-foreground" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold font-display text-foreground">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Info */}
      <section id="contato" className="scroll-mt-6 bg-muted/50">
        <div className="container mx-auto px-6 py-16 sm:px-10 lg:px-16">
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
