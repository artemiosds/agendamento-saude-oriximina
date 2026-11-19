import type { ReactNode } from 'react';
import { Clock3 } from 'lucide-react';
import { AvatarPersonagem, type Papel } from './AvatarPersonagem';
import './hospitalVirtual.css';

type Ambiente = 'recepcao' | 'triagem' | 'consulta' | 'procedimentos';

function Mobiliario({ ambiente }: { ambiente: Ambiente }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 360 115" className="hospital-mobiliario">
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M20 65 81 38h204l51 28-44 40H72z" fill="#edf4f3" stroke="#c5d8da" />
      <path d="m42 76 273-1M60 91h237M91 44l-9 58m53-58-3 59m52-59v59m46-59 7 59m36-59 12 59" stroke="#d7e4e3" />
      <path d="M21 62V22l59-17h205l51 17v40l-51-17H80z" fill="#d6e7e9" stroke="#adcbd0" />
      <path d="M80 6v39m205-39v39" stroke="#b9d6d8" />
      <path d="M93 14h43v20H93z" fill="#a4cfd9" stroke="#789ea7" />
      <path d="M114 15v18m-20-10h41" stroke="#f2fcff" />
      {ambiente === 'recepcao' && <>
        <path d="M78 61h70l13 7v12H90l-12-7z" fill="#80a9b7" stroke="#568191" />
        <path d="M94 66v14m19-14v14m19-14v14m19-14v14M92 80v7m65-7v7" stroke="#568191" />
        <path d="M202 54h84l18 11v15h-89l-13-9z" fill="#96bdc5" stroke="#698c95" />
        <path d="M202 54h84l18 11h-89z" fill="#c7d9d6" stroke="#698c95" />
        <path d="M225 45h23v13h-23z" fill="#466977" />
        <path d="M228 48h17v7h-17z" fill="#8ed6d5" />
        <path d="M267 42h16v13h-16z" fill="#f5f5ed" stroke="#a5bbbc" />
      </>}
      {(ambiente === 'consulta' || ambiente === 'triagem') && <>
        <path d="M177 60h104l14 9v9H190l-13-7zM193 77v13m93-13v13" fill="#c7bba6" stroke="#8b9895" />
        <path d="M177 60h104l14 9H190z" fill="#ddcfbc" stroke="#8b9895" />
        <path d="M209 46h28v16h-28z" fill="#456775" />
        <path d="M212 49h22v10h-22z" fill="#8fd4db" />
        <path d="M224 61v5m-5 0h11" stroke="#456775" />
        <path d="m256 62 16 0 5 4h-16z" fill="#f1f3ec" />
      </>}
      {ambiente === 'triagem' && <>
        <path d="M96 74V48m-5 0h10v6H91zm-6 26h23v5H85z" fill="#e4e9dc" stroke="#698695" />
        <path d="M259 17h21v18h-21z" fill="#f7faf9" stroke="#91aeb5" />
        <path d="M263 21h12m-12 4h12m-12 4h8" stroke="#92afba" />
        <circle cx="274" cy="22" r="2" fill="#dc8270" />
      </>}
      {ambiente === 'consulta' && <>
        <path d="M68 59h71l9 6v10H77l-9-6zM79 75v12m61-12v12" fill="#a8cfd0" stroke="#70969c" />
        <path d="M69 59h70l9 6H77z" fill="#d4e8eb" stroke="#84abb0" />
        <path d="m75 58 13 0 7 6H81z" fill="#f0f7f3" />
        <path d="M305 18v35m-8-30h16m-13 29h11" stroke="#819ea6" />
        <circle cx="306" cy="28" r="4" fill="#92bac4" />
      </>}
      {ambiente === 'procedimentos' && <>
        <g stroke="#659698" fill="#a9ccca">
          <path d="m71 57 11 16h52v9H77L63 62zM82 82v9m39-9v9" />
          <path d="m224 57 11 16h52v9h-59l-14-20zM233 82v9m44-9v9" />
        </g>
        <g stroke="#678d9a" fill="#c3e1e0">
          <path d="M147 83V43h-14m8 40h13M299 83V43h-14m8 40h13" fill="none" />
          <rect x="130" y="42" width="8" height="13" rx="2" /><rect x="282" y="42" width="8" height="13" rx="2" />
        </g>
        <path d="M165 32h29v23h-29z" fill="#edf5ed" stroke="#9bb9b8" />
        <path d="M179 37v13m-6-6h12" stroke="#ab756c" strokeWidth="2" />
      </>}
    </g>
  </svg>;
}

export function SalaIlustrada({ ambiente, children }: { ambiente: Ambiente; children?: ReactNode }) {
  return <div className="hospital-sala" data-ambiente={ambiente}>
    <Mobiliario ambiente={ambiente} />
    <div className="hospital-ocupantes">{children}</div>
  </div>;
}

export function Ocupante({ papel, nome, detalhe, tom, variante, facing, risk, timer }: {
  papel: Papel; nome?: string; detalhe?: string; tom?: string; variante?: string;
  facing?: 'left'; risk?: string; timer?: boolean;
}) {
  return <div className="hospital-ocupante" data-facing={facing}>
    {nome && <div className="hospital-balao"><strong>{nome}</strong>{detalhe && <span className="hospital-detalhe"
      data-tone={tom} data-risk={risk} data-timer={timer || undefined}>
      {timer && <Clock3 size={12} aria-hidden="true" />}{detalhe}</span>}</div>}
    <AvatarPersonagem papel={papel} variante={variante} />
  </div>;
}
