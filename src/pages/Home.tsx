import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Shield, Phone, MapPin, Clock, Heart, Stethoscope, Baby, Smile, User } from 'lucide-react';
import { motion } from 'framer-motion';

const services = [
  { icon: Stethoscope, title: 'Clínica Geral', desc: 'Consultas médicas gerais' },
  { icon: Baby, title: 'Pediatria', desc: 'Atendimento infantil' },
  { icon: Smile, title: 'Odontologia', desc: 'Saúde bucal' },
  { icon: Heart, title: 'Enfermagem', desc: 'Procedimentos e curativos' },
];

const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <h1 className="text-3xl md:text-5xl font-bold font-display leading-tight mb-4">
              Secretaria Municipal de Saúde de Oriximiná
            </h1>
            <p className="text-lg opacity-90 mb-8">
              Sistema de agendamento online. Agende sua consulta de forma rápida e prática.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/agendar">
                <Button size="lg" className="bg-primary-foreground text-foreground font-semibold hover:bg-primary-foreground/90 w-full sm:w-auto">
                  <Calendar className="w-5 h-5 mr-2" />
                  Agendar Online
                </Button>
              </Link>
              <Link to="/portal">
                <Button size="lg" variant="outline" className="border-primary-foreground bg-primary-foreground/20 text-primary-foreground font-semibold hover:bg-primary-foreground/30 w-full sm:w-auto">
                  <User className="w-5 h-5 mr-2" />
                  Portal do Paciente
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="border-primary-foreground/50 bg-transparent text-primary-foreground/80 font-semibold hover:bg-primary-foreground/10 w-full sm:w-auto">
                  <Shield className="w-5 h-5 mr-2" />
                  Painel Interno
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Services */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold font-display text-foreground text-center mb-8">Nossos Serviços</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {services.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
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
      <section className="bg-muted/50">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <MapPin className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Endereço</h3>
                <p className="text-sm text-muted-foreground">Rua Principal, 100 - Centro<br />Oriximiná - PA</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Horário</h3>
                <p className="text-sm text-muted-foreground">Seg a Sex: 07:00 às 17:00<br />Sábado: 07:00 às 12:00</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground">Contato</h3>
                <p className="text-sm text-muted-foreground">(93) 3544-0000<br />WhatsApp: (93) 99999-0000</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground/60 text-center py-6 text-sm">
        SMS Oriximiná © {new Date().getFullYear()} — Secretaria Municipal de Saúde
      </footer>
    </div>
  );
};

export default Home;
