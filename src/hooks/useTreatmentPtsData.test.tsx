import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTreatmentPtsData, type TreatmentPtsRecord } from "@/hooks/useTreatmentPtsData";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function pts(id: string): TreatmentPtsRecord {
  return {
    id,
    patient_id: `patient-${id}`,
    professional_id: "professional-1",
    unit_id: "unit-1",
    diagnostico_funcional: "diagnóstico",
    objetivos_terapeuticos: "objetivos",
    metas_curto_prazo: "",
    metas_medio_prazo: "",
    metas_longo_prazo: "",
    especialidades_envolvidas: [],
    status: "ativo",
    created_at: "2026-09-27T00:00:00.000Z",
    updated_at: "2026-09-27T00:00:00.000Z",
  };
}

const baseOptions = {
  createOpen: false,
  createPatientId: null,
  cyclePatientId: null,
  linkedPtsId: null,
  scopeKey: "user-1|unit-1",
  loadActivePtsForPatient: vi.fn(async () => [] as TreatmentPtsRecord[]),
  loadPtsById: vi.fn(async () => null as TreatmentPtsRecord | null),
};

describe("useTreatmentPtsData", () => {
  it("does not query PTS during the initial page load; queries only after opening a relevant flow", async () => {
    const loadActive = vi.fn(async () => [pts("create")]);
    const loadById = vi.fn(async () => pts("linked"));
    const { result, rerender } = renderHook((props) => useTreatmentPtsData(props), {
      initialProps: { ...baseOptions, loadActivePtsForPatient: loadActive, loadPtsById: loadById },
    });

    expect(loadActive).not.toHaveBeenCalled();
    expect(loadById).not.toHaveBeenCalled();

    rerender({ ...baseOptions, createOpen: true, createPatientId: "patient-create", loadActivePtsForPatient: loadActive, loadPtsById: loadById });
    await waitFor(() => expect(result.current.createPts).toEqual([pts("create")]));
    expect(loadActive).toHaveBeenCalledTimes(1);
    expect(loadActive).toHaveBeenCalledWith("patient-create");

    rerender({ ...baseOptions, cyclePatientId: "patient-cycle", loadActivePtsForPatient: loadActive, loadPtsById: loadById });
    await waitFor(() => expect(loadActive).toHaveBeenCalledWith("patient-cycle"));
    expect(loadById).not.toHaveBeenCalled();
  });

  it("keeps only the newest patient's PTS when responses arrive out of order", async () => {
    const first = deferred<TreatmentPtsRecord[]>();
    const second = deferred<TreatmentPtsRecord[]>();
    const loadActive = vi.fn((patientId: string) => patientId === "patient-a" ? first.promise : second.promise);
    const { result, rerender } = renderHook((props) => useTreatmentPtsData(props), {
      initialProps: { ...baseOptions, createOpen: true, createPatientId: "patient-a", loadActivePtsForPatient: loadActive },
    });

    rerender({ ...baseOptions, createOpen: true, createPatientId: "patient-b", loadActivePtsForPatient: loadActive });
    await act(async () => second.resolve([pts("b")]));
    await waitFor(() => expect(result.current.createPts).toEqual([pts("b")]));
    await act(async () => first.resolve([pts("a")]));

    expect(result.current.createPts).toEqual([pts("b")]);
  });

  it("ignores a linked PTS response from a cycle selected earlier", async () => {
    const first = deferred<TreatmentPtsRecord | null>();
    const second = deferred<TreatmentPtsRecord | null>();
    const loadById = vi.fn((id: string) => id === "pts-a" ? first.promise : second.promise);
    const { result, rerender } = renderHook((props) => useTreatmentPtsData(props), {
      initialProps: { ...baseOptions, linkedPtsId: "pts-a", loadPtsById: loadById },
    });

    rerender({ ...baseOptions, linkedPtsId: "pts-b", loadPtsById: loadById });
    await act(async () => second.resolve(pts("b")));
    await waitFor(() => expect(result.current.linkedPts).toEqual(pts("b")));
    await act(async () => first.resolve(pts("a")));

    expect(result.current.linkedPts).toEqual(pts("b"));
  });

  it("does not reuse a patient's PTS response after the unit scope changes", async () => {
    const oldScope = deferred<TreatmentPtsRecord[]>();
    const newScope = deferred<TreatmentPtsRecord[]>();
    const loadActive = vi.fn((_patientId: string, scopeKey: string) =>
      scopeKey.endsWith("unit-1") ? oldScope.promise : newScope.promise,
    );
    const loadForScope = (scopeKey: string) => (patientId: string) => loadActive(patientId, scopeKey);
    const { result, rerender } = renderHook((props) => useTreatmentPtsData(props), {
      initialProps: {
        ...baseOptions,
        createOpen: true,
        createPatientId: "patient-a",
        scopeKey: "user-1|unit-1",
        loadActivePtsForPatient: loadForScope("user-1|unit-1"),
      },
    });

    rerender({
      ...baseOptions,
      createOpen: true,
      createPatientId: "patient-a",
      scopeKey: "user-1|unit-2",
      loadActivePtsForPatient: loadForScope("user-1|unit-2"),
    });
    await act(async () => newScope.resolve([pts("unit-2")]));
    await waitFor(() => expect(result.current.createPts).toEqual([pts("unit-2")]));
    await act(async () => oldScope.resolve([pts("unit-1")]));

    expect(result.current.createPts).toEqual([pts("unit-2")]);
  });

  it("does not surface an error from an obsolete patient request", async () => {
    const oldRequest = deferred<TreatmentPtsRecord[]>();
    const loadActive = vi.fn((patientId: string) =>
      patientId === "patient-old" ? oldRequest.promise : Promise.resolve([pts("current")]),
    );
    const onError = vi.fn();
    const { result, rerender } = renderHook((props) => useTreatmentPtsData(props), {
      initialProps: {
        ...baseOptions,
        createOpen: true,
        createPatientId: "patient-old",
        loadActivePtsForPatient: loadActive,
        onError,
      },
    });

    rerender({
      ...baseOptions,
      createOpen: true,
      createPatientId: "patient-current",
      loadActivePtsForPatient: loadActive,
      onError,
    });
    await waitFor(() => expect(result.current.createPts).toEqual([pts("current")]));
    await act(async () => oldRequest.reject(new Error("falha antiga")));

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.createPts).toEqual([pts("current")]);
  });
});
