/**
 * Lista curada de medicamentos da RENAME 2024 (Relação Nacional de Medicamentos Essenciais)
 * e da REME (Relação Municipal de Medicamentos Essenciais) — modelo genérico de APS/UBS.
 *
 * Não é a lista oficial completa, mas cobre os principais itens essenciais.
 * Itens são identificados por codigo_rename para evitar duplicidade na importação.
 */

export type TipoMedicamento = 'comum' | 'controlado' | 'psicotropico' | 'antibiotico';
export type OrigemMedicamento = 'rename' | 'reme' | 'manual';

export interface MedicamentoSeed {
  codigo_rename: string;
  nome: string; // nome genérico (princípio ativo principal)
  nome_comercial: string;
  principio_ativo: string;
  concentracao: string;
  forma_farmaceutica: string;
  via_padrao: string;
  classe_terapeutica: string;
  tipo: TipoMedicamento;
  dosagem_padrao: string;
  apresentacao: string;
}

const m = (
  codigo: string,
  nome: string,
  comercial: string,
  ativo: string,
  conc: string,
  forma: string,
  via: string,
  classe: string,
  tipo: TipoMedicamento = 'comum',
): MedicamentoSeed => ({
  codigo_rename: codigo,
  nome,
  nome_comercial: comercial,
  principio_ativo: ativo,
  concentracao: conc,
  forma_farmaceutica: forma,
  via_padrao: via,
  classe_terapeutica: classe,
  tipo,
  dosagem_padrao: conc,
  apresentacao: `${forma} ${conc}`.trim(),
});

// ============================================================
// RENAME — Relação Nacional (modelo essencial)
// ============================================================
export const RENAME_MEDICAMENTOS: MedicamentoSeed[] = [
  // Analgésicos e Antipiréticos
  m('R001', 'Paracetamol', 'Tylenol', 'Paracetamol', '500mg', 'Comprimido', 'oral', 'Analgésicos e Antipiréticos'),
  m('R002', 'Paracetamol', 'Tylenol Gotas', 'Paracetamol', '200mg/mL', 'Solução oral', 'oral', 'Analgésicos e Antipiréticos'),
  m('R003', 'Dipirona Sódica', 'Novalgina', 'Dipirona Sódica', '500mg', 'Comprimido', 'oral', 'Analgésicos e Antipiréticos'),
  m('R004', 'Dipirona Sódica', 'Novalgina Gotas', 'Dipirona Sódica', '500mg/mL', 'Solução oral', 'oral', 'Analgésicos e Antipiréticos'),
  m('R005', 'Dipirona Sódica', 'Novalgina Injetável', 'Dipirona Sódica', '500mg/mL', 'Solução injetável', 'intramuscular', 'Analgésicos e Antipiréticos'),
  m('R006', 'Ácido Acetilsalicílico', 'AAS', 'Ácido Acetilsalicílico', '100mg', 'Comprimido', 'oral', 'Antiagregantes Plaquetários'),
  m('R007', 'Ácido Acetilsalicílico', 'AAS Adulto', 'Ácido Acetilsalicílico', '500mg', 'Comprimido', 'oral', 'Analgésicos e Antipiréticos'),
  m('R008', 'Tramadol', 'Tramal', 'Cloridrato de Tramadol', '50mg', 'Cápsula', 'oral', 'Opioides', 'controlado'),
  m('R009', 'Tramadol', 'Tramal Injetável', 'Cloridrato de Tramadol', '50mg/mL', 'Solução injetável', 'intramuscular', 'Opioides', 'controlado'),
  m('R010', 'Codeína + Paracetamol', 'Tylex', 'Codeína 30mg + Paracetamol 500mg', '30mg+500mg', 'Comprimido', 'oral', 'Opioides', 'controlado'),
  m('R011', 'Morfina', 'Dimorf', 'Sulfato de Morfina', '10mg', 'Comprimido', 'oral', 'Opioides', 'controlado'),
  m('R012', 'Morfina', 'Dimorf Injetável', 'Sulfato de Morfina', '10mg/mL', 'Solução injetável', 'subcutânea', 'Opioides', 'controlado'),

  // Anti-inflamatórios
  m('R020', 'Ibuprofeno', 'Advil', 'Ibuprofeno', '400mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R021', 'Ibuprofeno', 'Alivium Gotas', 'Ibuprofeno', '50mg/mL', 'Suspensão oral', 'oral', 'Anti-inflamatórios'),
  m('R022', 'Diclofenaco Sódico', 'Voltaren', 'Diclofenaco Sódico', '50mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R023', 'Diclofenaco Sódico', 'Voltaren Injetável', 'Diclofenaco Sódico', '25mg/mL', 'Solução injetável', 'intramuscular', 'Anti-inflamatórios'),
  m('R024', 'Diclofenaco de Potássio', 'Cataflam', 'Diclofenaco Potássico', '50mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R025', 'Nimesulida', 'Nisulid', 'Nimesulida', '100mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R026', 'Naproxeno', 'Flanax', 'Naproxeno Sódico', '550mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R027', 'Cetoprofeno', 'Profenid', 'Cetoprofeno', '100mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R028', 'Meloxicam', 'Movatec', 'Meloxicam', '15mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('R029', 'Prednisona', 'Meticorten', 'Prednisona', '20mg', 'Comprimido', 'oral', 'Corticosteroides'),
  m('R030', 'Prednisolona', 'Predsim', 'Prednisolona', '3mg/mL', 'Solução oral', 'oral', 'Corticosteroides'),
  m('R031', 'Dexametasona', 'Decadron', 'Dexametasona', '4mg', 'Comprimido', 'oral', 'Corticosteroides'),
  m('R032', 'Dexametasona', 'Decadron Injetável', 'Fosfato Dissódico de Dexametasona', '4mg/mL', 'Solução injetável', 'intramuscular', 'Corticosteroides'),
  m('R033', 'Hidrocortisona', 'Solucortef', 'Succinato Sódico de Hidrocortisona', '100mg', 'Pó liofilizado injetável', 'intravenosa', 'Corticosteroides'),
  m('R034', 'Betametasona', 'Diprospan', 'Dipropionato + Fosfato de Betametasona', '5mg+2mg/mL', 'Solução injetável', 'intramuscular', 'Corticosteroides'),

  // Antibióticos
  m('R050', 'Amoxicilina', 'Amoxil', 'Amoxicilina', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R051', 'Amoxicilina', 'Amoxil Suspensão', 'Amoxicilina', '50mg/mL', 'Pó para suspensão oral', 'oral', 'Antibióticos', 'antibiotico'),
  m('R052', 'Amoxicilina + Clavulanato', 'Clavulin', 'Amoxicilina 500mg + Clavulanato de Potássio 125mg', '500mg+125mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R053', 'Ampicilina', 'Binotal', 'Ampicilina', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R054', 'Cefalexina', 'Keflex', 'Cefalexina', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R055', 'Cefadroxila', 'Cefamox', 'Cefadroxila', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R056', 'Ceftriaxona', 'Rocefin', 'Ceftriaxona Sódica', '1g', 'Pó liofilizado injetável', 'intramuscular', 'Antibióticos', 'antibiotico'),
  m('R057', 'Azitromicina', 'Zitromax', 'Azitromicina', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R058', 'Azitromicina', 'Zitromax Suspensão', 'Azitromicina', '40mg/mL', 'Pó para suspensão oral', 'oral', 'Antibióticos', 'antibiotico'),
  m('R059', 'Claritromicina', 'Klaricid', 'Claritromicina', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R060', 'Eritromicina', 'Pantomicina', 'Estolato de Eritromicina', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R061', 'Doxiciclina', 'Vibramicina', 'Cloridrato de Doxiciclina', '100mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R062', 'Tetraciclina', 'Tetrex', 'Cloridrato de Tetraciclina', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R063', 'Ciprofloxacino', 'Cipro', 'Cloridrato de Ciprofloxacino', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R064', 'Norfloxacino', 'Floxacin', 'Norfloxacino', '400mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R065', 'Levofloxacino', 'Levaquin', 'Hemi-hidrato de Levofloxacino', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R066', 'Sulfametoxazol + Trimetoprima', 'Bactrim', 'Sulfametoxazol 400mg + Trimetoprima 80mg', '400mg+80mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R067', 'Sulfametoxazol + Trimetoprima', 'Bactrim Suspensão', 'Sulfametoxazol 40mg/mL + Trimetoprima 8mg/mL', '40mg+8mg/mL', 'Suspensão oral', 'oral', 'Antibióticos', 'antibiotico'),
  m('R068', 'Metronidazol', 'Flagyl', 'Metronidazol', '250mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('R069', 'Metronidazol', 'Flagyl Suspensão', 'Benzoilmetronidazol', '40mg/mL', 'Suspensão oral', 'oral', 'Antibióticos', 'antibiotico'),
  m('R070', 'Clindamicina', 'Dalacin', 'Cloridrato de Clindamicina', '300mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R071', 'Nitrofurantoína', 'Macrodantina', 'Nitrofurantoína', '100mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('R072', 'Benzilpenicilina Benzatina', 'Benzetacil', 'Benzilpenicilina Benzatina', '1.200.000UI', 'Pó liofilizado injetável', 'intramuscular', 'Antibióticos', 'antibiotico'),
  m('R073', 'Benzilpenicilina Procaína', 'Despacilina', 'Benzilpenicilina Procaína 300.000UI + Potássica 100.000UI', '400.000UI', 'Pó liofilizado injetável', 'intramuscular', 'Antibióticos', 'antibiotico'),

  // Anti-hipertensivos
  m('R100', 'Captopril', 'Capoten', 'Captopril', '25mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R101', 'Enalapril', 'Renitec', 'Maleato de Enalapril', '10mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R102', 'Enalapril', 'Renitec', 'Maleato de Enalapril', '20mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R103', 'Losartana Potássica', 'Cozaar', 'Losartana Potássica', '50mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R104', 'Losartana Potássica', 'Cozaar', 'Losartana Potássica', '100mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R105', 'Anlodipino', 'Norvasc', 'Besilato de Anlodipino', '5mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R106', 'Anlodipino', 'Norvasc', 'Besilato de Anlodipino', '10mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R107', 'Nifedipino', 'Adalat', 'Nifedipino Retard', '20mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R108', 'Hidroclorotiazida', 'Clorana', 'Hidroclorotiazida', '25mg', 'Comprimido', 'oral', 'Diuréticos'),
  m('R109', 'Furosemida', 'Lasix', 'Furosemida', '40mg', 'Comprimido', 'oral', 'Diuréticos'),
  m('R110', 'Furosemida', 'Lasix Injetável', 'Furosemida', '10mg/mL', 'Solução injetável', 'intravenosa', 'Diuréticos'),
  m('R111', 'Espironolactona', 'Aldactone', 'Espironolactona', '25mg', 'Comprimido', 'oral', 'Diuréticos'),
  m('R112', 'Atenolol', 'Atenol', 'Atenolol', '50mg', 'Comprimido', 'oral', 'Beta-bloqueadores'),
  m('R113', 'Atenolol', 'Atenol', 'Atenolol', '100mg', 'Comprimido', 'oral', 'Beta-bloqueadores'),
  m('R114', 'Propranolol', 'Inderal', 'Cloridrato de Propranolol', '40mg', 'Comprimido', 'oral', 'Beta-bloqueadores'),
  m('R115', 'Metoprolol', 'Selozok', 'Succinato de Metoprolol', '50mg', 'Comprimido', 'oral', 'Beta-bloqueadores'),
  m('R116', 'Carvedilol', 'Coreg', 'Carvedilol', '6,25mg', 'Comprimido', 'oral', 'Beta-bloqueadores'),
  m('R117', 'Metildopa', 'Aldomet', 'Metildopa', '250mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R118', 'Clonidina', 'Atensina', 'Cloridrato de Clonidina', '0,150mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('R119', 'Hidralazina', 'Apresolina', 'Cloridrato de Hidralazina', '25mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),

  // Cardiovasculares
  m('R140', 'Digoxina', 'Digoxina', 'Digoxina', '0,25mg', 'Comprimido', 'oral', 'Cardiovasculares'),
  m('R141', 'Sinvastatina', 'Zocor', 'Sinvastatina', '20mg', 'Comprimido', 'oral', 'Hipolipemiantes'),
  m('R142', 'Sinvastatina', 'Zocor', 'Sinvastatina', '40mg', 'Comprimido', 'oral', 'Hipolipemiantes'),
  m('R143', 'Atorvastatina', 'Lipitor', 'Atorvastatina Cálcica', '20mg', 'Comprimido', 'oral', 'Hipolipemiantes'),
  m('R144', 'Varfarina Sódica', 'Marevan', 'Varfarina Sódica', '5mg', 'Comprimido', 'oral', 'Anticoagulantes'),
  m('R145', 'Clopidogrel', 'Plavix', 'Bissulfato de Clopidogrel', '75mg', 'Comprimido', 'oral', 'Antiagregantes Plaquetários'),
  m('R146', 'Isossorbida (Mono)', 'Monocordil', 'Mononitrato de Isossorbida', '20mg', 'Comprimido', 'oral', 'Cardiovasculares'),
  m('R147', 'Isossorbida (Di)', 'Isordil', 'Dinitrato de Isossorbida', '5mg', 'Comprimido', 'sublingual', 'Cardiovasculares'),

  // Antidiabéticos
  m('R160', 'Metformina', 'Glifage', 'Cloridrato de Metformina', '500mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('R161', 'Metformina', 'Glifage', 'Cloridrato de Metformina', '850mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('R162', 'Glibenclamida', 'Daonil', 'Glibenclamida', '5mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('R163', 'Gliclazida', 'Diamicron MR', 'Gliclazida', '30mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('R164', 'Insulina NPH', 'Humulin N', 'Insulina Humana NPH', '100UI/mL', 'Suspensão injetável', 'subcutânea', 'Antidiabéticos'),
  m('R165', 'Insulina Regular', 'Humulin R', 'Insulina Humana Regular', '100UI/mL', 'Solução injetável', 'subcutânea', 'Antidiabéticos'),

  // Psicotrópicos e Controlados
  m('R180', 'Diazepam', 'Valium', 'Diazepam', '10mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R181', 'Diazepam', 'Valium Injetável', 'Diazepam', '5mg/mL', 'Solução injetável', 'intramuscular', 'Benzodiazepínicos', 'psicotropico'),
  m('R182', 'Clonazepam', 'Rivotril', 'Clonazepam', '2mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R183', 'Clonazepam', 'Rivotril Gotas', 'Clonazepam', '2,5mg/mL', 'Solução oral', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R184', 'Alprazolam', 'Frontal', 'Alprazolam', '1mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R185', 'Bromazepam', 'Lexotan', 'Bromazepam', '3mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R186', 'Lorazepam', 'Lorax', 'Lorazepam', '2mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R187', 'Midazolam', 'Dormonid', 'Maleato de Midazolam', '15mg', 'Comprimido', 'oral', 'Benzodiazepínicos', 'psicotropico'),
  m('R188', 'Fluoxetina', 'Prozac', 'Cloridrato de Fluoxetina', '20mg', 'Cápsula', 'oral', 'Antidepressivos', 'controlado'),
  m('R189', 'Sertralina', 'Zoloft', 'Cloridrato de Sertralina', '50mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R190', 'Sertralina', 'Zoloft', 'Cloridrato de Sertralina', '100mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R191', 'Amitriptilina', 'Tryptanol', 'Cloridrato de Amitriptilina', '25mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R192', 'Nortriptilina', 'Pamelor', 'Cloridrato de Nortriptilina', '25mg', 'Cápsula', 'oral', 'Antidepressivos', 'controlado'),
  m('R193', 'Paroxetina', 'Aropax', 'Cloridrato de Paroxetina', '20mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R194', 'Escitalopram', 'Lexapro', 'Oxalato de Escitalopram', '10mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R195', 'Citalopram', 'Cipramil', 'Bromidrato de Citalopram', '20mg', 'Comprimido', 'oral', 'Antidepressivos', 'controlado'),
  m('R196', 'Venlafaxina', 'Efexor', 'Cloridrato de Venlafaxina', '75mg', 'Cápsula', 'oral', 'Antidepressivos', 'controlado'),
  m('R197', 'Risperidona', 'Risperdal', 'Risperidona', '2mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('R198', 'Haloperidol', 'Haldol', 'Haloperidol', '5mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('R199', 'Haloperidol', 'Haldol Injetável', 'Haloperidol', '5mg/mL', 'Solução injetável', 'intramuscular', 'Antipsicóticos', 'controlado'),
  m('R200', 'Olanzapina', 'Zyprexa', 'Olanzapina', '10mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('R201', 'Quetiapina', 'Seroquel', 'Hemifumarato de Quetiapina', '100mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('R202', 'Carbonato de Lítio', 'Carbolitium', 'Carbonato de Lítio', '300mg', 'Comprimido', 'oral', 'Estabilizadores de Humor', 'controlado'),
  m('R203', 'Carbamazepina', 'Tegretol', 'Carbamazepina', '200mg', 'Comprimido', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R204', 'Fenitoína', 'Hidantal', 'Fenitoína Sódica', '100mg', 'Comprimido', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R205', 'Fenobarbital', 'Gardenal', 'Fenobarbital', '100mg', 'Comprimido', 'oral', 'Anticonvulsivantes', 'psicotropico'),
  m('R206', 'Fenobarbital', 'Gardenal Gotas', 'Fenobarbital', '40mg/mL', 'Solução oral', 'oral', 'Anticonvulsivantes', 'psicotropico'),
  m('R207', 'Ácido Valproico', 'Depakene', 'Ácido Valproico', '250mg', 'Cápsula', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R208', 'Topiramato', 'Topamax', 'Topiramato', '50mg', 'Comprimido', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R209', 'Lamotrigina', 'Lamictal', 'Lamotrigina', '100mg', 'Comprimido', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R210', 'Gabapentina', 'Neurontin', 'Gabapentina', '300mg', 'Cápsula', 'oral', 'Anticonvulsivantes', 'controlado'),
  m('R211', 'Pregabalina', 'Lyrica', 'Pregabalina', '75mg', 'Cápsula', 'oral', 'Anticonvulsivantes', 'controlado'),

  // Gastrointestinais
  m('R230', 'Omeprazol', 'Losec', 'Omeprazol', '20mg', 'Cápsula', 'oral', 'Gastrointestinais'),
  m('R231', 'Omeprazol', 'Losec', 'Omeprazol', '40mg', 'Cápsula', 'oral', 'Gastrointestinais'),
  m('R232', 'Pantoprazol', 'Pantozol', 'Pantoprazol Sódico', '40mg', 'Comprimido', 'oral', 'Gastrointestinais'),
  m('R233', 'Esomeprazol', 'Nexium', 'Esomeprazol Magnésico', '40mg', 'Comprimido', 'oral', 'Gastrointestinais'),
  m('R234', 'Ranitidina', 'Antak', 'Cloridrato de Ranitidina', '150mg', 'Comprimido', 'oral', 'Gastrointestinais'),
  m('R235', 'Hidróxido de Alumínio + Magnésio', 'Mylanta Plus', 'Hidróxido de Alumínio + Magnésio + Simeticona', '60mg+40mg+5mg/mL', 'Suspensão oral', 'oral', 'Gastrointestinais'),
  m('R236', 'Metoclopramida', 'Plasil', 'Cloridrato de Metoclopramida', '10mg', 'Comprimido', 'oral', 'Antieméticos'),
  m('R237', 'Metoclopramida', 'Plasil Injetável', 'Cloridrato de Metoclopramida', '5mg/mL', 'Solução injetável', 'intramuscular', 'Antieméticos'),
  m('R238', 'Bromoprida', 'Digesan', 'Bromoprida', '10mg', 'Comprimido', 'oral', 'Antieméticos'),
  m('R239', 'Ondansetrona', 'Zofran', 'Cloridrato de Ondansetrona', '4mg', 'Comprimido', 'oral', 'Antieméticos'),
  m('R240', 'Domperidona', 'Motilium', 'Domperidona', '10mg', 'Comprimido', 'oral', 'Antieméticos'),
  m('R241', 'Hioscina', 'Buscopan', 'Butilbrometo de Escopolamina', '10mg', 'Comprimido', 'oral', 'Antiespasmódicos'),
  m('R242', 'Hioscina Composta', 'Buscopan Composto', 'Butilbrometo de Escopolamina 10mg + Dipirona 250mg', '10mg+250mg', 'Comprimido', 'oral', 'Antiespasmódicos'),
  m('R243', 'Loperamida', 'Imosec', 'Cloridrato de Loperamida', '2mg', 'Comprimido', 'oral', 'Antidiarreicos'),
  m('R244', 'Sais para Reidratação Oral', 'SRO', 'Glicose + Cloreto de Sódio + Cloreto de Potássio + Citrato de Sódio', '27,9g', 'Pó para solução oral', 'oral', 'Reidratantes'),
  m('R245', 'Lactulose', 'Duphalac', 'Lactulose', '667mg/mL', 'Xarope', 'oral', 'Laxativos'),
  m('R246', 'Bisacodil', 'Dulcolax', 'Bisacodil', '5mg', 'Drágea', 'oral', 'Laxativos'),
  m('R247', 'Albendazol', 'Zentel', 'Albendazol', '400mg', 'Comprimido mastigável', 'oral', 'Antiparasitários'),
  m('R248', 'Mebendazol', 'Pantelmin', 'Mebendazol', '100mg', 'Comprimido', 'oral', 'Antiparasitários'),
  m('R249', 'Metronidazol', 'Flagyl Geleia', 'Metronidazol', '100mg/g', 'Geleia vaginal', 'vaginal', 'Antiparasitários'),

  // Respiratórios
  m('R270', 'Salbutamol', 'Aerolin', 'Sulfato de Salbutamol', '100mcg/dose', 'Aerossol oral', 'inalatória', 'Respiratórios'),
  m('R271', 'Salbutamol', 'Aerolin Spray', 'Sulfato de Salbutamol', '5mg/mL', 'Solução para nebulização', 'inalatória', 'Respiratórios'),
  m('R272', 'Beclometasona', 'Clenil', 'Dipropionato de Beclometasona', '250mcg/dose', 'Aerossol oral', 'inalatória', 'Respiratórios'),
  m('R273', 'Budesonida', 'Pulmicort', 'Budesonida', '200mcg/dose', 'Pó inalante', 'inalatória', 'Respiratórios'),
  m('R274', 'Formoterol + Budesonida', 'Symbicort', 'Formoterol 6mcg + Budesonida 200mcg', '6mcg+200mcg', 'Pó inalante', 'inalatória', 'Respiratórios'),
  m('R275', 'Ipratrópio', 'Atrovent', 'Brometo de Ipratrópio', '0,250mg/mL', 'Solução para nebulização', 'inalatória', 'Respiratórios'),
  m('R276', 'Loratadina', 'Claritin', 'Loratadina', '10mg', 'Comprimido', 'oral', 'Antialérgicos'),
  m('R277', 'Loratadina', 'Claritin Xarope', 'Loratadina', '1mg/mL', 'Xarope', 'oral', 'Antialérgicos'),
  m('R278', 'Dexclorfeniramina', 'Polaramine', 'Maleato de Dexclorfeniramina', '2mg', 'Comprimido', 'oral', 'Antialérgicos'),
  m('R279', 'Dexclorfeniramina', 'Polaramine Xarope', 'Maleato de Dexclorfeniramina', '0,4mg/mL', 'Xarope', 'oral', 'Antialérgicos'),
  m('R280', 'Cetirizina', 'Zyrtec', 'Cloridrato de Cetirizina', '10mg', 'Comprimido', 'oral', 'Antialérgicos'),
  m('R281', 'Prometazina', 'Fenergan', 'Cloridrato de Prometazina', '25mg', 'Comprimido', 'oral', 'Antialérgicos'),
  m('R282', 'Acetilcisteína', 'Fluimucil', 'Acetilcisteína', '600mg', 'Comprimido efervescente', 'oral', 'Mucolíticos'),
  m('R283', 'Ambroxol', 'Mucosolvan', 'Cloridrato de Ambroxol', '30mg', 'Comprimido', 'oral', 'Mucolíticos'),

  // Tópicos / Dermatológicos
  m('R310', 'Permetrina', 'Kwell', 'Permetrina', '50mg/mL', 'Loção tópica', 'tópica', 'Dermatológicos'),
  m('R311', 'Hidrocortisona Creme', 'Berlison', 'Hidrocortisona', '10mg/g', 'Creme', 'tópica', 'Corticosteroides Tópicos'),
  m('R312', 'Cetoconazol Creme', 'Nizoral', 'Cetoconazol', '20mg/g', 'Creme dermatológico', 'tópica', 'Antifúngicos'),
  m('R313', 'Cetoconazol', 'Nizoral', 'Cetoconazol', '200mg', 'Comprimido', 'oral', 'Antifúngicos'),
  m('R314', 'Miconazol', 'Daktarin', 'Nitrato de Miconazol', '20mg/g', 'Creme dermatológico', 'tópica', 'Antifúngicos'),
  m('R315', 'Fluconazol', 'Zoltec', 'Fluconazol', '150mg', 'Cápsula', 'oral', 'Antifúngicos'),
  m('R316', 'Nistatina', 'Micostatin', 'Nistatina', '100.000UI/mL', 'Suspensão oral', 'oral', 'Antifúngicos'),
  m('R317', 'Aciclovir Creme', 'Zovirax', 'Aciclovir', '50mg/g', 'Creme dermatológico', 'tópica', 'Antivirais'),
  m('R318', 'Aciclovir', 'Zovirax', 'Aciclovir', '200mg', 'Comprimido', 'oral', 'Antivirais'),
  m('R319', 'Neomicina + Bacitracina', 'Nebacetin', 'Sulfato de Neomicina + Bacitracina Zíncica', '5mg+250UI/g', 'Pomada', 'tópica', 'Antibióticos Tópicos', 'antibiotico'),
  m('R320', 'Sulfadiazina de Prata', 'Dermazine', 'Sulfadiazina de Prata', '10mg/g', 'Creme', 'tópica', 'Antibióticos Tópicos', 'antibiotico'),

  // Oftalmológicos
  m('R340', 'Tobramicina Colírio', 'Tobrex', 'Tobramicina', '3mg/mL', 'Solução oftálmica', 'ocular', 'Oftalmológicos', 'antibiotico'),
  m('R341', 'Ciprofloxacino Colírio', 'Cilodex', 'Ciprofloxacino', '3,5mg/mL', 'Solução oftálmica', 'ocular', 'Oftalmológicos', 'antibiotico'),
  m('R342', 'Cloranfenicol Colírio', 'Quemicetina', 'Cloranfenicol', '5mg/mL', 'Solução oftálmica', 'ocular', 'Oftalmológicos', 'antibiotico'),

  // Vitaminas e Suplementos
  m('R380', 'Ácido Fólico', 'Folacin', 'Ácido Fólico', '5mg', 'Comprimido', 'oral', 'Vitaminas e Suplementos'),
  m('R381', 'Sulfato Ferroso', 'Sulfato Ferroso', 'Sulfato Ferroso', '40mg Fe', 'Comprimido', 'oral', 'Vitaminas e Suplementos'),
  m('R382', 'Sulfato Ferroso Gotas', 'Sulfato Ferroso Pediátrico', 'Sulfato Ferroso', '25mg Fe/mL', 'Solução oral', 'oral', 'Vitaminas e Suplementos'),
  m('R383', 'Vitamina B12', 'Citoneurin 5000', 'Cianocobalamina', '5000mcg/mL', 'Solução injetável', 'intramuscular', 'Vitaminas e Suplementos'),
  m('R384', 'Vitamina D3', 'DePura', 'Colecalciferol', '7000UI/mL', 'Solução oral', 'oral', 'Vitaminas e Suplementos'),
  m('R385', 'Carbonato de Cálcio', 'Calcium', 'Carbonato de Cálcio', '500mg', 'Comprimido', 'oral', 'Vitaminas e Suplementos'),
  m('R386', 'Polivitamínico', 'Centrum', 'Vitaminas + Minerais', '1 cápsula', 'Cápsula', 'oral', 'Vitaminas e Suplementos'),

  // Endócrinos / Hormônios
  m('R410', 'Levotiroxina Sódica', 'Puran T4', 'Levotiroxina Sódica', '50mcg', 'Comprimido', 'oral', 'Endócrinos'),
  m('R411', 'Levotiroxina Sódica', 'Puran T4', 'Levotiroxina Sódica', '100mcg', 'Comprimido', 'oral', 'Endócrinos'),
  m('R412', 'Anticoncepcional Oral', 'Microvlar', 'Levonorgestrel 0,15mg + Etinilestradiol 0,03mg', '0,15mg+0,03mg', 'Comprimido', 'oral', 'Contraceptivos'),
  m('R413', 'Noretisterona Trimestral', 'Depo-Provera', 'Acetato de Medroxiprogesterona', '150mg/mL', 'Suspensão injetável', 'intramuscular', 'Contraceptivos'),
  m('R414', 'Levonorgestrel', 'Postinor-Uno', 'Levonorgestrel', '1,5mg', 'Comprimido', 'oral', 'Contraceptivos'),

  // Diversos / Outros
  m('R450', 'Soro Fisiológico 0,9%', 'SF 0,9%', 'Cloreto de Sódio', '9mg/mL', 'Solução injetável', 'intravenosa', 'Soros e Fluidoterapia'),
  m('R451', 'Soro Glicosado 5%', 'SG 5%', 'Glicose', '50mg/mL', 'Solução injetável', 'intravenosa', 'Soros e Fluidoterapia'),
  m('R452', 'Ringer Lactato', 'Ringer', 'Cloreto de Sódio + Lactato de Sódio + Cloreto de Potássio + Cloreto de Cálcio', '500mL', 'Solução injetável', 'intravenosa', 'Soros e Fluidoterapia'),
  m('R453', 'Adrenalina', 'Epinefrina', 'Epinefrina', '1mg/mL', 'Solução injetável', 'intramuscular', 'Emergência'),
  m('R454', 'Atropina', 'Atropina', 'Sulfato de Atropina', '0,25mg/mL', 'Solução injetável', 'intravenosa', 'Emergência'),
  m('R455', 'Lidocaína 2%', 'Xilocaína 2%', 'Cloridrato de Lidocaína', '20mg/mL', 'Solução injetável', 'subcutânea', 'Anestésicos Locais'),
  m('R456', 'Glicose 50%', 'Glicose Hipertônica', 'Glicose', '500mg/mL', 'Solução injetável', 'intravenosa', 'Emergência'),
  m('R457', 'Heparina Sódica', 'Liquemine', 'Heparina Sódica', '5000UI/mL', 'Solução injetável', 'subcutânea', 'Anticoagulantes'),
  m('R458', 'Enoxaparina Sódica', 'Clexane', 'Enoxaparina Sódica', '40mg/0,4mL', 'Solução injetável', 'subcutânea', 'Anticoagulantes'),
];

// ============================================================
// REME — Relação Municipal (modelo de complementos a APS/UBS)
// ============================================================
export const REME_MEDICAMENTOS: MedicamentoSeed[] = [
  m('REME001', 'Tenoxicam', 'Tilatil', 'Tenoxicam', '20mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('REME002', 'Cetoprofeno', 'Profenid Injetável', 'Cetoprofeno', '50mg/mL', 'Solução injetável', 'intramuscular', 'Anti-inflamatórios'),
  m('REME003', 'Piroxicam', 'Feldene', 'Piroxicam', '20mg', 'Cápsula', 'oral', 'Anti-inflamatórios'),
  m('REME004', 'Ácido Mefenâmico', 'Ponstan', 'Ácido Mefenâmico', '500mg', 'Comprimido', 'oral', 'Anti-inflamatórios'),
  m('REME010', 'Levomepromazina', 'Neozine', 'Maleato de Levomepromazina', '25mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('REME011', 'Clorpromazina', 'Amplictil', 'Cloridrato de Clorpromazina', '100mg', 'Comprimido', 'oral', 'Antipsicóticos', 'controlado'),
  m('REME012', 'Periciazina', 'Neuleptil', 'Periciazina', '10mg', 'Cápsula', 'oral', 'Antipsicóticos', 'controlado'),
  m('REME020', 'Loperamida Composta', 'Diasec', 'Loperamida + Simeticona', '2mg+125mg', 'Comprimido', 'oral', 'Antidiarreicos'),
  m('REME021', 'Racecadotrila', 'Tiorfan', 'Racecadotrila', '100mg', 'Cápsula', 'oral', 'Antidiarreicos'),
  m('REME022', 'Saccharomyces boulardii', 'Floratil', 'Saccharomyces boulardii', '200mg', 'Cápsula', 'oral', 'Probióticos'),
  m('REME030', 'Cefuroxima', 'Zinnat', 'Cefuroxima Axetil', '500mg', 'Comprimido', 'oral', 'Antibióticos', 'antibiotico'),
  m('REME031', 'Cefaclor', 'Ceclor', 'Cefaclor', '500mg', 'Cápsula', 'oral', 'Antibióticos', 'antibiotico'),
  m('REME032', 'Eritromicina Suspensão', 'Pantomicina Suspensão', 'Estolato de Eritromicina', '50mg/mL', 'Suspensão oral', 'oral', 'Antibióticos', 'antibiotico'),
  m('REME040', 'Captopril', 'Capoten', 'Captopril', '50mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('REME041', 'Verapamil', 'Dilacoron', 'Cloridrato de Verapamil', '80mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('REME042', 'Diltiazem', 'Balcor', 'Cloridrato de Diltiazem', '60mg', 'Comprimido', 'oral', 'Anti-hipertensivos'),
  m('REME050', 'Glimepirida', 'Amaryl', 'Glimepirida', '2mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('REME051', 'Sitagliptina', 'Januvia', 'Fosfato de Sitagliptina', '100mg', 'Comprimido', 'oral', 'Antidiabéticos'),
  m('REME060', 'Ibuprofeno + Cafeína', 'Doril', 'Ibuprofeno + Cafeína', '200mg+30mg', 'Comprimido', 'oral', 'Analgésicos e Antipiréticos'),
  m('REME061', 'Paracetamol + Cafeína', 'Tylenol DC', 'Paracetamol + Cafeína', '500mg+65mg', 'Comprimido', 'oral', 'Analgésicos e Antipiréticos'),
  m('REME062', 'Dipirona + Cafeína + Orfenadrina', 'Dorflex', 'Dipirona + Cafeína + Citrato de Orfenadrina', '300mg+50mg+35mg', 'Comprimido', 'oral', 'Relaxantes Musculares'),
  m('REME063', 'Ciclobenzaprina', 'Miosan', 'Cloridrato de Ciclobenzaprina', '10mg', 'Comprimido', 'oral', 'Relaxantes Musculares'),
  m('REME070', 'Salbutamol Xarope', 'Aerolin Xarope', 'Sulfato de Salbutamol', '0,4mg/mL', 'Xarope', 'oral', 'Respiratórios'),
  m('REME071', 'Bromexina', 'Bisolvon', 'Cloridrato de Bromexina', '8mg', 'Comprimido', 'oral', 'Mucolíticos'),
  m('REME072', 'Guaifenesina', 'Histamin Expectorante', 'Guaifenesina', '20mg/mL', 'Xarope', 'oral', 'Expectorantes'),
  m('REME080', 'Sulfato de Magnésio', 'Sulfato de Magnésio 50%', 'Sulfato de Magnésio', '500mg/mL', 'Solução injetável', 'intramuscular', 'Emergência'),
  m('REME081', 'Bicarbonato de Sódio 8,4%', 'Bicarbonato', 'Bicarbonato de Sódio', '84mg/mL', 'Solução injetável', 'intravenosa', 'Soros e Fluidoterapia'),
  m('REME082', 'Cloreto de Potássio 19,1%', 'KCl 19,1%', 'Cloreto de Potássio', '191mg/mL', 'Solução injetável', 'intravenosa', 'Soros e Fluidoterapia'),
];
