import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

/** Text stays in a patient-scoped buffer until an explicit commit; idle saves read a snapshot. */
export function useBufferedClinicalText<T extends { paciente_id: string }>(
  formRef: MutableRefObject<T>,
  setForm: Dispatch<SetStateAction<T>>,
  onIdle: () => void,
  onDirty?: () => void,
) {
  const draft = useRef<{ patient: string; patch: Partial<T> }>({ patient: formRef.current.paciente_id, patch: {} });
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRevision = useRef(0);
  const savedTextRevision = useRef(0);
  const textEpoch = useRef(0);
  const [textResetKey, setTextResetKey] = useState(0);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onDirtyRef = useRef(onDirty);
  onDirtyRef.current = onDirty;

  const cancelTimer = useCallback(() => {
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = null;
  }, []);
  useEffect(() => cancelTimer, [cancelTimer]);

  const readLatestForm = useCallback((base = formRef.current): T =>
    draft.current.patient === base.paciente_id ? { ...base, ...draft.current.patch } : base, [formRef]);
  const readBufferedValue = useCallback(<K extends keyof T>(field: K): T[K] | undefined =>
    draft.current.patient === formRef.current.paciente_id ? draft.current.patch[field] : undefined, [formRef]);
  const scheduleIdle = useCallback(() => {
    cancelTimer();
    const epoch = textEpoch.current;
    textTimer.current = setTimeout(() => {
      textTimer.current = null;
      if (epoch === textEpoch.current) onIdleRef.current();
    }, 800);
  }, [cancelTimer]);
  const bufferText = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    const patient = formRef.current.paciente_id;
    if (draft.current.patient !== patient) draft.current = { patient, patch: {} };
    draft.current.patch[field] = value;
    textRevision.current += 1;
    onDirtyRef.current?.();
    scheduleIdle();
  }, [formRef, scheduleIdle]);

  // Returns the snapshot synchronously; callers never wait for React state before saving.
  const flushText = useCallback((base = formRef.current): T => {
    cancelTimer();
    if (draft.current.patient !== base.paciente_id || !Object.keys(draft.current.patch).length) return base;
    const patch = draft.current.patch;
    const result = { ...base, ...patch };
    draft.current = { patient: base.paciente_id, patch: {} };
    if (formRef.current.paciente_id === base.paciente_id) formRef.current = result;
    setForm(current => current.paciente_id === base.paciente_id ? { ...current, ...patch } : current);
    return result;
  }, [cancelTimer, formRef, setForm]);

  // Explicit commands (SOAP chips/template/copy) may replace a focused field.
  const replaceText = useCallback((patch: Partial<T>) => {
    const patient = formRef.current.paciente_id;
    draft.current = { patient, patch: { ...(draft.current.patient === patient ? draft.current.patch : {}), ...patch } };
    textRevision.current += 1;
    onDirtyRef.current?.();
    const result = flushText();
    setTextResetKey(key => key + 1);
    scheduleIdle();
    return result;
  }, [flushText, formRef, scheduleIdle]);

  const resetTextForm = useCallback((next: T) => {
    cancelTimer();
    textEpoch.current += 1;
    draft.current = { patient: next.paciente_id, patch: {} };
    textRevision.current = 0;
    savedTextRevision.current = 0;
    onDirtyRef.current?.();
    formRef.current = next;
    setForm(next);
    setTextResetKey(key => key + 1);
  }, [cancelTimer, formRef, setForm]);

  const acknowledgeTextSave = useCallback((epoch: number, revision: number) => {
    if (epoch !== textEpoch.current) return false;
    savedTextRevision.current = Math.max(savedTextRevision.current, revision);
    return revision === textRevision.current;
  }, []);

  return { readLatestForm, readBufferedValue, bufferText, flushText, replaceText, resetTextForm,
    textTimer, textRevision, savedTextRevision, textEpoch, textResetKey, acknowledgeTextSave };
}
