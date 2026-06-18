// Wrapper de compatibilidade — toda a renderização real do Laudo APAC vive
// agora em ApacLaudoSvg (SVG único). Este arquivo mantém a API antiga
// (ref com `element`, `isReady`, `waitReady`) e adiciona `svg` para a
// rotina de impressão/PDF.

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { AnyPaciente } from "@/lib/apacLaudoData";
import { ApacLaudoSvg, type ApacLaudoSvgHandle } from "./ApacLaudoSvg";

interface Props {
  paciente: AnyPaciente | null;
}

export interface ApacLaudoTemplateHandle {
  element: HTMLDivElement | null;
  svg: SVGSVGElement | null;
  isReady: () => boolean;
  waitReady: (timeoutMs?: number) => Promise<void>;
}

export const ApacLaudoTemplate = forwardRef<ApacLaudoTemplateHandle, Props>(
  function ApacLaudoTemplate({ paciente }, ref) {
    const inner = useRef<ApacLaudoSvgHandle>(null);
    useImperativeHandle(
      ref,
      () => ({
        get element() {
          return inner.current?.element ?? null;
        },
        get svg() {
          return inner.current?.svg ?? null;
        },
        isReady: () => inner.current?.isReady() ?? false,
        waitReady: (ms?: number) => inner.current?.waitReady(ms) ?? Promise.resolve(),
      }),
      [],
    );
    return <ApacLaudoSvg ref={inner} paciente={paciente} />;
  },
);

export default ApacLaudoTemplate;
