import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock, RefreshCw, Loader2, ExternalLink } from 'lucide-react';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
  status?: string;
}

const AgendaGoogle: React.FC = () => {
  const gcal = useGoogleCalendar();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    gcal.checkStatus();
  }, []);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const items = await gcal.listEvents();
      setEvents(items);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (gcal.connected) {
      fetchEvents();
    }
  }, [gcal.connected]);

  const formatEventTime = (event: CalendarEvent) => {
    const startStr = event.start.dateTime || event.start.date;
    if (!startStr) return '';
    try {
      const d = parseISO(startStr);
      return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return startStr;
    }
  };

  if (!gcal.connected) {
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
              Configure a integração com o Google Agenda em <strong>Configurações</strong> para visualizar os eventos sincronizados aqui.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Agenda Google</h1>
          <p className="text-muted-foreground text-sm">Eventos sincronizados do Google Calendar</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEvents} disabled={loadingEvents}>
          {loadingEvents ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Atualizar
        </Button>
      </div>

      {loadingEvents && events.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground">Carregando eventos...</p>
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <CalendarClock className="w-12 h-12 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado nos próximos 90 dias.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {events.map(event => (
            <Card key={event.id} className="shadow-card border-0">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{event.summary || '(Sem título)'}</p>
                  <p className="text-xs text-muted-foreground">{formatEventTime(event)}</p>
                  {event.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{event.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {event.status === 'cancelled' && <Badge variant="destructive">Cancelado</Badge>}
                  {event.htmlLink && (
                    <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgendaGoogle;
