import React from 'react';
import { Button } from '@/components/ui/button';

/** A failed lazy chunk must not take down the Agenda or discard its selection. */
export default class PatientRegistrationBoundary extends React.Component<{children:React.ReactNode; onBack:()=>void},{failed:boolean}> {
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed ? <div role="alert" className="space-y-3 p-3">
   <p>Não foi possível carregar o cadastro. O agendamento foi preservado.</p>
   <Button variant="outline" onClick={this.props.onBack}>Voltar para o Agendamento</Button>
 </div> : this.props.children;}
}
