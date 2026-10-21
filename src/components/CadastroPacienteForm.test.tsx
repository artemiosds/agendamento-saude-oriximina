import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CadastroPacienteForm, { emptyPacienteForm, type PacienteFormData } from "./CadastroPacienteForm";
const history = vi.hoisted(() => ({ callback: undefined as ((referral: Record<string, string>) => void) | undefined }));
const procedures = vi.hoisted(() => ({ load: vi.fn(async () => ({ data: [], error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: procedures.load }) }),
} }));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { unidadeId: "test" } }) }));
vi.mock("@/hooks/useCustomFields", () => ({ useCustomFields: () => ({
  resolved: { fields: [] }, getNativeLabel: (_name: string, label: string) => label, isNativeHidden: () => false,
}) }));
vi.mock("@/components/PatientAttachmentManager", () => ({ default: () => null }));
vi.mock("@/components/Pacientes/PatientReferralHistory", async () => {
  const { forwardRef } = await import("react");
  return { default: forwardRef((_props: { onLatestReferralChange?: (referral: Record<string, string>) => void }, _ref) => {
    history.callback = _props.onLatestReferralChange;
    return null;
  }) };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("formulário principal e endereço", () => {
  it("inicia novos cadastros com sugestões sem alterar o paciente ao abrir edição", () => {
    expect(emptyPacienteForm).toMatchObject({
      municipio: "Oriximiná", customData: { cep: "68270-000", uf: "PA", ibge_municipio: "1505304" },
    });
    const onChange = vi.fn();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<CadastroPacienteForm form={{
      ...emptyPacienteForm, municipio: "Manaus", customData: { uf: "AM", cep: "", logradouro: "RUA EXISTENTE" },
    }} isEdit onChange={onChange} onSave={() => {}} saving={false} errors={{}} />);
    expect(onChange).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aplica CEP em customData preservando a identificação e outros dados durante a busca", async () => {
    let resolve: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(r => { resolve = r; })));
    function Form() {
      const [value, setValue] = useState<PacienteFormData>({
        ...emptyPacienteForm, customData: { uf: "PA", cep: "", numero: "17", complemento: "CASA", campo_extra: true },
      });
      return <>
        <CadastroPacienteForm form={value} onChange={setValue} isEdit={false} onSave={() => {}} saving={false} errors={{}} />
        <button onClick={() => setValue(p => ({ ...p, nome: "NOME DURANTE BUSCA" }))}>Editar nome</button>
        <output data-testid="form">{JSON.stringify(value)}</output>
      </>;
    }
    render(<Form />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Endereço" }), { button: 0, ctrlKey: false });
    fireEvent.change(screen.getByPlaceholderText("00000-000"), { target: { value: "68250000" } });
    fireEvent.blur(screen.getByPlaceholderText("00000-000"));
    fireEvent.click(screen.getByRole("button", { name: "Editar nome" }));
    await act(async () => resolve!({ ok: true, json: async () => ({
      cep: "68250000", city: "Óbidos", state: "PA", street: "Rua São João", neighborhood: "Centro",
    }) } as Response));
    const saved = JSON.parse(screen.getByTestId("form").textContent!);
    expect(saved).toMatchObject({
      nome: "NOME DURANTE BUSCA", municipio: "OBIDOS",
      customData: { cep: "68250-000", uf: "PA", endereco_uf: "PA", endereco_municipio: "OBIDOS",
        ibge_municipio: "1505106", logradouro: "RUA SAO JOAO", bairro: "CENTRO",
        numero: "17", complemento: "CASA", campo_extra: true },
    });
  });

  it.each([
    ["tipoLogradouro", "Endereço"], ["bairro", "Endereço"], ["cep", "Endereço"],
    ["racaCor", "Complementares"], ["nacionalidade", "Complementares"],
    ["telefone", "Contato"], ["sexo", "Identificação"],
  ])("abre a aba real e foca o campo pendente %s", async (field, tab) => {
    const { container } = render(<CadastroPacienteForm form={emptyPacienteForm} onChange={vi.fn()}
      isEdit={false} onSave={() => {}} saving={false} errors={{ [field]: "Campo obrigatório" }} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => {
      const message = container.querySelector(`[data-validation-field="${field}"]`)!;
      const control = message.parentElement!.querySelector('input:not([type="hidden"]),textarea,button[role="combobox"],[role="radio"],button');
      expect(control).toHaveFocus();
    });
  });

  it("direciona novamente para a pendência ao repetir a tentativa de salvar", async () => {
    const props = { form: emptyPacienteForm, onChange: vi.fn(), isEdit: false, onSave: vi.fn(), saving: false };
    const { rerender } = render(<CadastroPacienteForm {...props} errors={{ bairro: "Bairro obrigatório" }} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Endereço" })).toHaveAttribute("aria-selected", "true"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Identificação" }), { button: 0 });
    rerender(<CadastroPacienteForm {...props} errors={{ bairro: "Bairro obrigatório" }} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "Endereço" })).toHaveAttribute("aria-selected", "true"));
  });

  it("sincroniza o encaminhamento sem repor identificação, contato ou endereço antigos", async () => {
    function Form() {
      const [value, setValue] = useState<PacienteFormData>({ ...emptyPacienteForm, nome: "NOME ATUAL",
        telefone: "93999999999", customData: { cep: "68270-000", extra: "MANTER" } });
      return <><CadastroPacienteForm pacienteId="p1" form={value} onChange={setValue} isEdit={false}
        onSave={() => {}} saving={false} errors={{}} /><output data-testid="synced">{JSON.stringify(value)}</output></>;
    }
    render(<Form />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Complementares" }), { button: 0 });
    act(() => history.callback!({ patient_id: "p1", cid: "H90", especialidade_destino: "FONOAUDIOLOGIA", justificativa: "NOVA" }));
    expect(JSON.parse(screen.getByTestId("synced").textContent!)).toMatchObject({
      nome: "NOME ATUAL", telefone: "93999999999", cid: "H90", especialidadeDestino: "FONOAUDIOLOGIA",
      justificativa: "NOVA", customData: { cep: "68270-000", extra: "MANTER" },
    });
    act(() => history.callback!({ patient_id: "OUTRO", cid: "ERRADO" }));
    expect(JSON.parse(screen.getByTestId("synced").textContent!).cid).toBe("H90");
  });

  it("uma consulta atrasada de procedimentos não desfaz a edição ou o encaminhamento sincronizado", async () => {
    let resolve: (value: { data: []; error: null }) => void;
    procedures.load.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    function Form() {
      const [value, setValue] = useState<PacienteFormData>({ ...emptyPacienteForm, nome: "ANTIGO" });
      return <><CadastroPacienteForm pacienteId="p1" form={value} onChange={setValue} isEdit
        onSave={() => {}} saving={false} errors={{}} /><output data-testid="procedure-form">{JSON.stringify(value)}</output></>;
    }
    render(<Form />);
    fireEvent.change(screen.getByPlaceholderText("NOME DO PACIENTE"), { target: { value: "NOME EDITADO" } });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Complementares" }), { button: 0 });
    act(() => history.callback!({ patient_id: "p1", cid: "H90", especialidade_destino: "FONOAUDIOLOGIA" }));
    await act(async () => resolve!({ data: [], error: null }));
    expect(JSON.parse(screen.getByTestId("procedure-form").textContent!)).toMatchObject({
      nome: "NOME EDITADO", cid: "H90", especialidadeDestino: "FONOAUDIOLOGIA", patientProcedures: [],
    });
  });
});
