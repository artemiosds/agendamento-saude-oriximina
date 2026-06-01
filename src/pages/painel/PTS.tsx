            <DialogTitle className="font-display">Detalhes do PTS</DialogTitle>
          </DialogHeader>
          {detailPts && (() => {
            const pac = pacientes.find(p => p.id === detailPts.patient_id);
            const prof = funcionarios.find(f => f.id === detailPts.professional_id);
            return (
              <div className="space-y-4 text-sm">
                {/* Header info */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Paciente</span>
                    <p className="font-semibold">{pac?.nome || detailPts.patient_id}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Profissional</span>
                    <p>{prof?.nome || '—'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block">Status</span>
                    <Badge variant="outline" className={cn("text-xs mt-0.5", statusBadgeColor(detailPts.status || 'ativo'))}>
                      {detailPts.status || 'Ativo'}
                    </Badge>
                  </div>
                  {detailPts.prioridade && (
                    <div>
                      <span className="text-xs text-muted-foreground uppercase font-semibold block">Prioridade</span>
                      <Badge variant="outline" className={cn("text-xs mt-0.5", prioridadeColor(detailPts.prioridade))}>
                        {detailPts.prioridade}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Revisão alert */}
                {detailPts.data_proxima_revisao && (
                  <div className={cn(
                    "p-2 rounded-lg border text-xs flex items-center gap-2",
                    isOverdueReview(detailPts)
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-muted/30 border-border text-muted-foreground'
                  )}>
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Próxima revisão: {new Date(detailPts.data_proxima_revisao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    {isOverdueReview(detailPts) && ' — VENCIDA'}
                  </div>
                )}

                {/* Contexts */}
                {detailPts.contextos_afetados && detailPts.contextos_afetados.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Contextos Afetados</span>
                    <div className="flex flex-wrap gap-1">
                      {detailPts.contextos_afetados.map(c => <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>)}
                    </div>
                  </div>
                )}

                {/* Especialidades */}
                {detailPts.especialidades_envolvidas.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Especialidades</span>
                    <div className="flex flex-wrap gap-1">
                      {detailPts.especialidades_envolvidas.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                    </div>
                  </div>
                )}

                {/* Diagnóstico */}
                {detailPts.diagnostico_funcional && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Diagnóstico Funcional</span>
                    <p className="mt-1 bg-muted/30 rounded p-2">{detailPts.diagnostico_funcional}</p>
                  </div>
                )}

                {/* Objetivos */}
                {detailPts.objetivos_terapeuticos && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Objetivos Terapêuticos</span>
                    <p className="mt-1 bg-muted/30 rounded p-2">{detailPts.objetivos_terapeuticos}</p>
                  </div>
                )}

                {/* Metas estruturadas */}
                {detailMetas.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-2">Metas ({detailMetas.length})</span>
                    <div className="space-y-1.5">
                      {detailMetas.map((m, i) => (
                        <div key={i} className="border rounded p-2 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-xs">{m.titulo}</span>
                              <Badge variant="outline" className="text-[10px]">{m.categoria}</Badge>
                              <Badge variant="outline" className={cn("text-[10px]", statusMetaColor(m.status))}>{m.status}</Badge>
                            </div>
                            {m.indicador && <p className="text-[11px] text-muted-foreground">📊 {m.indicador}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SIGTAP */}
                {detailSigtap.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">Procedimentos SIGTAP</span>
                    <div className="flex flex-wrap gap-1">
                      {detailSigtap.map(s => (
                        <Badge key={s.procedimento_codigo} variant="secondary" className="text-xs font-mono">
                          {s.procedimento_codigo} — {s.procedimento_nome.slice(0, 30)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* CIDs */}
                {detailCids.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase font-semibold block mb-1">CIDs</span>
                    <div className="flex flex-wrap gap-1">
                      {detailCids.map(c => (
                        <Badge key={c.cid_codigo} variant="outline" className="text-xs font-mono" title={c.cid_descricao}>
                          {c.cid_codigo}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                {canEditPts(detailPts) && (
                  <div className="flex gap-2 pt-2 border-t flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => {
                      const pts = detailPts;
                      setDetailPts(null);
                      openEditDialog(pts);
                    }}>
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      setRevisaoForm({ obs: '', data_proxima: suggestReviewDate(30) });
                      setRevisaoOpen(true);
                    }}>
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Registrar Revisão
                    </Button>
                    {(!detailPts.status || detailPts.status === 'ativo') && (
                      <Button variant="outline" size="sm"
                        className="border-success/50 text-success hover:bg-success/10"
                        onClick={() => {
                          setAltaForm({ motivo_encerramento: '', resumo_desfecho: '', orientacoes_finais: '', criterio_alta_atingido: false, ciencia_familia: false, status_final: 'encerrado' });
                          setAltaOpen(true);
                        }}>
                        <CheckSquare className="w-3.5 h-3.5 mr-1" /> Alta/Encerrar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PTS;