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
  Ear,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import logoSms from "@/assets/logo-sms-transparente.png";
import heroAtendimento from "@/assets/hero-atendimento.webp";

const services = [
  { icon: Stethoscope, title: "Clínica Geral", desc: "Consultas médicas gerais" },
  { icon: Baby, title: "Pediatria", desc: "Atendimento infantil" },
  { icon: Smile, title: "Odontologia", desc: "Saúde bucal" },
  { icon: Heart, title: "Enfermagem", desc: "Procedimentos e curativos" },
  { icon: Activity, title: "Fisioterapia", desc: "Reabilitação e movimento" },
  { icon: Ear, title: "Fonoaudiologia", desc: "Cuidado com a fala, audição e deglutição" },
  { icon: Brain, title: "Psicologia", desc: "Saúde mental e bem-estar" },
  { icon: Apple, title: "Nutrição", desc: "Orientação alimentar" },
  { icon: Baby, title: "Odontopediatria", desc: "Saúde bucal infantil" },
  { icon: HeartHandshake, title: "Assistência Social", desc: "Apoio e orientação social" },
  { icon: HandMetal, title: "Terapia Ocupacional", desc: "Reabilitação funcional" },
];

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#edf3f8]">
      <header className="border-b border-[#2A6F97]/20 border-t-4 border-t-[#2A6F97] bg-white shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-5 px-6 py-4 sm:px-10 lg:px-16">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="SMS Oriximiná — página inicial">
            <img
              src={logoSms}
              alt="Logo oficial SMS Oriximiná"
              width={96}
              height={96}
              className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24"
            />
            <span className="min-w-0 text-base font-semibold leading-snug text-foreground sm:text-lg">
              Prefeitura de Oriximiná
              <span className="mt-1 block text-sm font-normal text-muted-foreground sm:text-base">
                Secretaria Municipal de Saúde
              </span>
            </span>
          </Link>
          <nav
            aria-label="Navegação principal"
            className="flex w-full flex-wrap items-center justify-between gap-3 text-base sm:w-auto sm:gap-6"
          >
            <a
              href="#servicos"
              className="inline-flex min-h-12 items-center font-medium text-slate-600 hover:text-[#2A6F97]"
            >
              Serviços
            </a>
            <a
              href="#contato"
              className="inline-flex min-h-12 items-center font-medium text-slate-600 hover:text-[#2A6F97]"
            >
              Contato
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-12 gap-2 rounded-xl border-[#2A6F97] bg-[#eaf3f9] px-4 text-base font-semibold text-[#164563] shadow-sm hover:bg-[#d8eaf5] sm:px-5"
                >
                  <Shield className="h-5 w-5" aria-hidden="true" />
                  Área Restrita
                  <ChevronDown className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-primary/15 p-2 shadow-xl"
              >
                <DropdownMenuItem asChild>
                  <Link
                    to="/login"
                    aria-label="Painel do Servidor"
                    className="min-h-20 items-start gap-3 rounded-xl px-3 py-4"
                  >
                    <Shield className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">Painel do Servidor</span>
                      <span className="mt-1 block whitespace-normal text-sm leading-relaxed text-slate-600">
                        Acesso da equipe e administração.
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/externo"
                    aria-label="Acesso Regulador / Externo"
                    className="min-h-20 items-start gap-3 rounded-xl px-3 py-4"
                  >
                    <UserCheck className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block whitespace-normal text-base font-semibold">
                        Acesso Regulador / Externo
                      </span>
                      <span className="mt-1 block whitespace-normal text-sm leading-relaxed text-slate-600">
                        Acesso de reguladores e parceiros.
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[#123c57] text-white">
        <img
          src={heroAtendimento}
          alt="Profissional de saúde acolhendo uma paciente"
          width={1600}
          height={800}
          loading="eager"
          className="block aspect-[2/1] w-full object-cover lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-[58%]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,#123c57_0%,#164b69_36%,rgba(22,75,105,0.94)_42%,rgba(22,75,105,0.45)_50%,transparent_64%)] lg:block"
        />
        <div className="container relative mx-auto px-6 py-12 sm:px-10 sm:py-16 lg:px-16 lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-xl lg:w-[48%]"
          >
            <p className="mb-5 inline-flex rounded-full border border-sky-200/40 bg-white/10 px-4 py-2 text-sm font-semibold text-sky-100">
              Saúde pública de Oriximiná
            </p>
            <h1 className="text-3xl md:text-5xl font-bold font-display leading-tight mb-4 text-balance">
              Sua saúde, mais perto de você.
            </h1>
            <p className="mb-8 max-w-lg text-lg leading-relaxed text-slate-100">
              Agendamento online e serviços de saúde para você e sua família.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/agendar">
                <Button
                  size="lg"
                  className="h-14 rounded-xl border border-sky-100 bg-white px-6 text-base text-[#164563] font-bold shadow-lg hover:bg-sky-100 active:scale-[0.98] transition-colors duration-200 w-full sm:w-auto"
                >
                  <Calendar className="w-5 h-5 mr-2" />
                  Agendar Online
                </Button>
              </Link>
              <Link to="/portal">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 rounded-xl border-white/70 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/15 hover:text-white w-full sm:w-auto"
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
        <h2 className="mb-3 text-center text-3xl font-bold font-display text-[#123c57]">Nossos Serviços</h2>
        <p className="mx-auto mb-9 max-w-xl text-center text-base leading-relaxed text-slate-600">
          Cuidado e acolhimento para você em cada etapa da vida.
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {services.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Card className="h-full rounded-2xl border border-slate-200 border-t-4 border-t-[#2A6F97] bg-white shadow-sm hover:border-t-[#164563] hover:shadow-lg transition-[box-shadow,border-color] duration-200 text-center">
                <CardContent className="p-6 sm:px-4 sm:py-7">
                  <div className="w-16 h-16 rounded-2xl bg-[#e5f0f7] ring-1 ring-[#2A6F97]/15 flex items-center justify-center mx-auto mb-5">
                    <s.icon className="w-7 h-7 text-[#2A6F97]" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold font-display text-[#123c57]">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{s.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Info */}
      <section id="contato" className="scroll-mt-6 border-t border-[#2A6F97]/15 bg-white">
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
                  (93) 99109-3163
                  <br />
                  WhatsApp: (93) 99109-3163
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#123c57] text-slate-200 text-center py-8 text-sm">
        SMS Oriximiná © {new Date().getFullYear()} — Secretaria Municipal de Saúde
        <nav aria-label="Acessos institucionais" className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 px-4">
          <a href="#contato" className="underline-offset-4 hover:text-white hover:underline">
            Informações ao Cidadão
          </a>
          <Link to="/login" className="underline-offset-4 hover:text-white hover:underline">
            Acesso do Servidor
          </Link>
          <Link to="/externo" className="underline-offset-4 hover:text-white hover:underline">
            Acesso Regulador / Externo
          </Link>
        </nav>
      </footer>
    </div>
  );
};

export default Home;
