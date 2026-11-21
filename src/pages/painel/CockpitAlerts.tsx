import { BellRing, Check, ChevronRight } from 'lucide-react';

export type CockpitAlert = {
  id: string;
  zones: string[];
  title: string;
  summary: string;
  tone: 'danger' | 'warning';
  appointmentIds: string[];
};

export function CockpitAlerts({ alerts, acknowledged, theater, stale, onOpen, onAcknowledge }: {
  alerts: readonly CockpitAlert[];
  acknowledged: ReadonlySet<string>;
  theater: boolean;
  stale: boolean;
  onOpen: (alert: CockpitAlert, button: HTMLButtonElement) => void;
  onAcknowledge: (id: string) => void;
}) {
  return <section className="cockpit-alerts" aria-labelledby="cockpit-alert-title">
    <div className="cockpit-alert-heading">
      <h2 id="cockpit-alert-title"><BellRing size={17} aria-hidden="true" /> Alertas do plantão</h2>
      <span>{stale ? 'Dados da última leitura' : `${alerts.length} ativos`}</span>
    </div>
    {alerts.length ? <ul className="cockpit-alert-grid">{alerts.map(alert => {
      const ciente = acknowledged.has(alert.id);
      return <li key={alert.id} data-tone={alert.tone}>
        <div className="cockpit-alert-copy">
          <strong>{alert.title}</strong>
          <span>{alert.summary}</span>
        </div>
        {!theater && <div className="cockpit-alert-actions">
          <button type="button" className="planta-action" aria-label={`Ver detalhes de ${alert.title}`}
            aria-haspopup="dialog" onClick={event => onOpen(alert, event.currentTarget)}>
            Ver detalhes <ChevronRight size={14} aria-hidden="true" />
          </button>
          <button type="button" className="planta-action" aria-pressed={ciente} aria-label={`Ciente de ${alert.title}`}
            onClick={() => onAcknowledge(alert.id)}><Check size={14} aria-hidden="true" />{ciente ? 'Ciente nesta tela' : 'Ciente'}</button>
        </div>}
      </li>;
    })}</ul> : <p className="planta-empty">{stale ? 'Nenhum alerta na última leitura.' : 'Nenhum alerta operacional ativo.'}</p>}
  </section>;
}
