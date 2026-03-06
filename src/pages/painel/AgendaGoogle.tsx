import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarClock, ExternalLink } from 'lucide-react';

const AgendaGoogle: React.FC = () => {
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Agenda Google</h1>
        <p className="text-muted-foreground text-sm">Visualizar eventos sincronizados</p>
      </div>

      <Card className="shadow-card border-0">
        <CardContent className="p-8 text-center">
          <CalendarClock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="font-semibold font-display text-foreground mb-2">Google Agenda não conectada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure a integração com o Google Agenda em Configurações para visualizar os eventos sincronizados aqui.
          </p>
          <p className="text-xs text-muted-foreground">
            Após a integração, os eventos aparecerão filtrados por unidade e profissional, indicando quais pertencem ao sistema e quais são externos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgendaGoogle;
