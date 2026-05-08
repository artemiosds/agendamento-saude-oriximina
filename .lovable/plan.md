I have identified the root causes of the patient data saving issues across various flows (Agenda, Patient Record Confirmation, Arrival Confirmation).

### Root Causes Identified
1.  **Duplicate Save Logic**: Multiple components implement their own save logic instead of using the centralized `updatePacienteCadastro` helper, leading to inconsistencies.
2.  **Naming Convention Mismatch**: Some flows use camelCase (e.g., `nomeMae`) while others use snake_case (e.g., `nome_mae`). The database expects snake_case, but some components were failing to map them correctly before the final update.
3.  **Incomplete Payload Mapping**: Certain fields present in the UI (like detailed address fields in `custom_data`) were not always included in the save payload.
4.  **Autosave vs. Manual Conflict**: In `ConferirDadosPacienteModal`, the autosave could fire while a manual save was in progress, or vice-versa, potentially causing race conditions.
5.  **Lack of Centralized Sanitization**: While `sanitizePacientePayload` exists, it wasn't consistently applied to all direct database calls.

### Implementation Plan

#### 1. Enhance `src/lib/paciente-utils.ts`
*   Update `normalizePatientPayload` to be even more robust, ensuring all possible field variations (camelCase and snake_case) from all forms (Agenda, Patients, Confirmation) are correctly mapped to the database structure.
*   Ensure `sanitizePacientePayload` covers all critical `NOT NULL` columns.

#### 2. Fix `src/components/ConferirDadosPacienteModal.tsx`
*   Ensure it uses the enhanced `normalizePatientPayload` and `updatePacienteCadastro`.
*   Fix the Address structure mapping (moving fields correctly into `custom_data`).
*   Improve the "Salvar Alterações" button to ensure it clears any pending autosave and provides clear feedback.

#### 3. Fix `src/pages/painel/Agenda.tsx`
*   Ensure that when a new appointment is created for a new patient, the patient data is persisted correctly using the centralized logic.
*   Verify the `Confirmar Chegada` flow to ensure data is saved before the status update.

#### 4. Fix `src/pages/painel/Pacientes.tsx`
*   Update the `openEdit` and `openNew` flows to ensure the form state is perfectly aligned with the expected schema.
*   Standardize the save button to use the centralized utility.

#### 5. Fix `src/pages/painel/AtualizacaoCadastral.tsx`
*   Standardize the `handleSaveQuick` method to ensure it maps all fields correctly and uses the centralized helper.

### Technical Details
*   **Centralized Helper**: `updatePacienteCadastro` will remain the "source of truth" for saving.
*   **Data Mapping**: 
    *   Standard Table Fields: `nome`, `cpf`, `cns`, `telefone`, `data_nascimento`, `nome_mae`, `email`, `endereco`, `unidade_id`, `municipio`, etc.
    *   Custom Data Fields (JSON): `sexo`, `raca_cor`, `logradouro`, `numero`, `bairro`, `cep`, etc.
*   **Validation**: Ensure no `null` values are sent to `NOT NULL` columns by using `sanitizePacientePayload`.
*   **Cache Invalidation**: Use `queryClient.invalidateQueries` to ensure the UI updates immediately after a save.

This approach fixes the "real error" (data mismatch and inconsistent logic) without refactoring the entire system, adhering to the requested surgical correction.
