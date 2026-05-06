-- Tornar colunas de permissões individuais anuláveis para suportar herança
ALTER TABLE public.permissoes_usuario 
ALTER COLUMN can_view DROP NOT NULL,
ALTER COLUMN can_create DROP NOT NULL,
ALTER COLUMN can_edit DROP NOT NULL,
ALTER COLUMN can_delete DROP NOT NULL,
ALTER COLUMN can_execute DROP NOT NULL;

ALTER TABLE public.permissoes_usuario
ALTER COLUMN can_view SET DEFAULT NULL,
ALTER COLUMN can_create SET DEFAULT NULL,
ALTER COLUMN can_edit SET DEFAULT NULL,
ALTER COLUMN can_delete SET DEFAULT NULL,
ALTER COLUMN can_execute SET DEFAULT NULL;

-- As colunas mais recentes já são anuláveis, mas vamos garantir o padrão NULL
ALTER TABLE public.permissoes_usuario
ALTER COLUMN can_print SET DEFAULT NULL,
ALTER COLUMN can_export SET DEFAULT NULL,
ALTER COLUMN can_attach SET DEFAULT NULL,
ALTER COLUMN can_sign SET DEFAULT NULL,
ALTER COLUMN can_approve SET DEFAULT NULL,
ALTER COLUMN can_cancel SET DEFAULT NULL,
ALTER COLUMN can_configure SET DEFAULT NULL;

-- Opcional: Limpar permissões individuais que são cópias exatas do perfil (para restaurar herança)
-- Como são poucos registros (17), podemos deixar para o administrador ajustar ou resetar via interface.
