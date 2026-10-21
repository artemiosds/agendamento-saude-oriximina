import { useId, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

// Sugestões locais informadas pela SMS; o campo continua aceitando texto livre.
const BAIRROS_ORIXIMINA = [
  "AREA PASTORAL", "BELA VISTA", "CENTRO", "CIDADE NOVA",
  "CONJUNTO HABITACIONAL LUIZ GONZAGA VIANA", "JESUS MISERICORDIOSO",
  "NOSSA SRA DA CONCEICAO", "NOSSA SENHORA DA PIEDADE",
  "NOSSA SENHORA DAS DORES", "NOSSA SENHORA DAS GRACAS",
  "NOSSA SENHORA DE FATIMA", "NOSSA SENHORA DE GUADALUPE",
  "NOSSA SENHORA DO PERPETUO SOCORRO", "NOVA VITORIA", "NOVO HORIZONTE",
  "PENTA", "PENTA II", "RESIDENCIAL TIA ANA", "SANTA LUZIA", "SANTA TEREZINHA",
  "SANTISSIMO SACRAMENTO", "SAO FRANCISCO", "SAO LAZARO", "SAO PEDRO",
  "SAO JOSE OPERARIO I", "SAO JOSE OPERARIO II", "UNIAO DA VITORIA",
] as const;

type Props = Omit<ComponentProps<typeof Input>, "list"> & { cep: string };

export default function BairroPacienteInput({ cep, ...props }: Props) {
  const id = useId();
  const sugerir = /^68270\d{3}$/.test(cep.replace(/\D/g, ""));
  return (
    <>
      <Input {...props} list={sugerir ? id : undefined} />
      {sugerir && (
        <>
          <datalist id={id}>
            {BAIRROS_ORIXIMINA.map(bairro => <option key={bairro} value={bairro} />)}
          </datalist>
          <p className="mt-1 text-xs text-muted-foreground">
            Escolha um bairro sugerido ou digite outro, se não estiver na lista.
          </p>
        </>
      )}
    </>
  );
}
