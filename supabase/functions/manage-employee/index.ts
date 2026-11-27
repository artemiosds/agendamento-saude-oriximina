import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

type EmployeeAction = "can_view" | "can_create" | "can_edit" | "can_delete";
type EmployeeActor = {id:string; usuario:string; role:string; unidade_id:string; ativo:boolean};
type PermissionRow = {unidade_id:string; perfil?:string} & Partial<Record<EmployeeAction,boolean|null>>;
const normalizeRole = (raw:string) => {
  const role=String(raw||"").trim().toLowerCase();
  return ["gestão","gestor","coordenacao","coordenador"].includes(role)?"gestao":role==="recepção"?"recepcao":role==="tecnico"?"triagem":role==="tecnico_enfermagem"?"enfermagem":role;
};
const owner = (actor:EmployeeActor) => actor.usuario==="admin.sms" && normalizeRole(actor.role)==="master";
const protectedName = (value:unknown) => typeof value==="string" && value.trim().toLowerCase()==="admin.sms";
function resolveEmployeePermission(actor:EmployeeActor, field:EmployeeAction, userRows:PermissionRow[], roleRows:PermissionRow[]) {
  if(normalizeRole(actor.role)==="master")return true;
  const unit=actor.unidade_id||"",profile=normalizeRole(actor.role),raw=actor.role.trim().toLowerCase();
  const profileAt=(u:string)=>roleRows.find(row=>row.unidade_id===u&&row.perfil===profile)??roleRows.find(row=>row.unidade_id===u&&row.perfil===raw);
  const candidates=[...(unit?[userRows.find(row=>row.unidade_id===unit)]:[]),userRows.find(row=>row.unidade_id===""),...(unit?[profileAt(unit)]:[]),profileAt("")];
  return candidates.find(row=>row?.[field]!=null)?.[field]??(profile==="gestao"&&field!=="can_delete");
}
function employeeChangeError(actor:EmployeeActor,target:EmployeeActor|null,body:Record<string,unknown>):string|null {
  const global=owner(actor),master=normalizeRole(actor.role)==="master";
  if(!global&&(!actor.unidade_id||(target&&target.unidade_id!==actor.unidade_id)))return "Funcionário fora da sua unidade.";
  if(!global&&target&&protectedName(target.usuario))return "Administrador global protegido.";
  if(body.usuario!==undefined&&protectedName(body.usuario)&&(!target||!protectedName(target.usuario)))return "Usuário reservado ao administrador global.";
  if(!global&&body.unidade_id!==undefined&&body.unidade_id!==actor.unidade_id)return "Lotação fora da sua unidade.";
  if(!target&&!global&&body.unidade_id!==actor.unidade_id)return "Informe a sua unidade.";
  if(!master&&(normalizeRole(String(body.role||""))==="master"||target&&normalizeRole(target.role)==="master"))return "Somente Master pode gerenciar outro Master.";
  if(target&&protectedName(target.usuario)&&((body.usuario!==undefined&&body.usuario!==target.usuario)||(body.role!==undefined&&body.role!==target.role)||(body.unidade_id!==undefined&&body.unidade_id!==target.unidade_id)||body.ativo===false))return "Identidade e acesso do administrador global devem ser preservados.";
  if(target?.id===actor.id&&(body.ativo===false||(body.role!==undefined&&body.role!==target.role)||(body.unidade_id!==undefined&&body.unidade_id!==target.unidade_id)))return "Não é permitido desativar ou alterar o próprio perfil ou lotação.";
  return null;
}
const fail=(message:string,status=200)=>new Response(JSON.stringify({error:message}),{status,headers:corsHeaders});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;
    if(!["list","create","update","delete"].includes(action))return fail("Ação inválida.");
    const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!token)return fail("Autenticação necessária.",401);
    const {data:session,error:sessionError}=await supabaseAdmin.auth.getUser(token);
    if(sessionError||!session.user)return fail("Sessão inválida.",401);
    const {data:actor,error:actorError}=await supabaseAdmin.from("funcionarios").select("id,usuario,role,unidade_id,ativo").eq("auth_user_id",session.user.id).eq("ativo",true).maybeSingle();
    if(actorError||!actor)return fail("Funcionário ativo não encontrado.",403);
    const global=owner(actor);
    if(!global&&!actor.unidade_id)return fail("Sua conta não possui unidade autorizada.",403);
    let userRows:PermissionRow[]=[],roleRows:PermissionRow[]=[];
    if(normalizeRole(actor.role)!=="master"){
      const units=actor.unidade_id?[actor.unidade_id,""]:[""];
      const [individual,profile]=await Promise.all([
        supabaseAdmin.from("permissoes_usuario").select("unidade_id,can_view,can_create,can_edit,can_delete").eq("user_id",actor.id).eq("modulo","usuarios").in("unidade_id",units),
        supabaseAdmin.from("permissoes").select("perfil,unidade_id,can_view,can_create,can_edit,can_delete").eq("modulo","usuarios").in("perfil",[normalizeRole(actor.role),actor.role.trim().toLowerCase()]).in("unidade_id",units)
      ]);
      if(individual.error||profile.error)return fail("Não foi possível confirmar suas permissões.",403);
      userRows=individual.data||[];roleRows=profile.data||[];
    }
    const field:EmployeeAction=action==="create"?"can_create":action==="update"?"can_edit":action==="delete"?"can_delete":"can_view";
    if(!resolveEmployeePermission(actor,"can_view",userRows,roleRows)||!resolveEmployeePermission(actor,field,userRows,roleRows))return fail("Sem permissão para esta operação.",403);

    if (action === "create") {
      const scopeError=employeeChangeError(actor,null,body);
      if(scopeError)return fail(scopeError,403);
      const { nome, usuario, email, cpf, senha, setor, unidade_id, sala_id, cargo, role, criado_por, tempo_atendimento, profissao, tipo_conselho, numero_conselho, uf_conselho, pode_agendar_retorno, coren, cbo_codigo, cbo_descricao, cns } = body;

      if (!nome || !usuario || !email || !senha) {
        return new Response(
          JSON.stringify({ error: "Nome, usuário, e-mail e senha são obrigatórios." }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (typeof senha !== 'string' || senha.length < 6) {
        return new Response(
          JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Check if email already exists in funcionarios table
      const { data: existingFunc } = await supabaseAdmin
        .from("funcionarios")
        .select("id")
        .eq("email", email.trim().toLowerCase());

      if (existingFunc && existingFunc.length > 0) {
        return new Response(
          JSON.stringify({ error: "Este e-mail já está registrado no sistema." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Check if usuario already exists
      const { data: existingUser } = await supabaseAdmin
        .from("funcionarios")
        .select("id")
        .eq("usuario", usuario.trim());

      if (existingUser && existingUser.length > 0) {
        return new Response(
          JSON.stringify({ error: "Este nome de usuário já está em uso." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Create auth user
      const { data: authUser, error: authErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: email.trim().toLowerCase(),
          password: senha,
          email_confirm: true,
        });

      if (authErr) {
        // If user already exists in auth but not in funcionarios, try to find and link
        if (authErr.message?.includes("already been registered")) {
          return new Response(
            JSON.stringify({ error: "Este e-mail já está registrado na autenticação. Contate o administrador." }),
            { status: 200, headers: corsHeaders }
          );
        }
        return new Response(
          JSON.stringify({ error: "Erro ao criar acesso: " + authErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Insert into funcionarios
      const { data: func, error: dbErr } = await supabaseAdmin
        .from("funcionarios")
        .insert({
          auth_user_id: authUser.user.id,
          nome,
          usuario: usuario.trim(),
          email: email.trim().toLowerCase(),
          setor: setor || "",
          unidade_id: unidade_id || "",
          sala_id: sala_id || "",
          cargo: cargo || "",
          role: role || "recepcao",
          ativo: true,
          criado_por: actor.id,
          tempo_atendimento: tempo_atendimento || 30,
          profissao: profissao || "",
          tipo_conselho: tipo_conselho || "",
          numero_conselho: numero_conselho || "",
          uf_conselho: uf_conselho || "",
          pode_agendar_retorno: pode_agendar_retorno ?? false,
          cpf: cpf || "",
          coren: coren || "",
          custom_data: {
            ...(body.custom_data_extras && typeof body.custom_data_extras === 'object' ? body.custom_data_extras : {}),
            ...(cbo_codigo ? { cbo_codigo: String(cbo_codigo), cbo_descricao: String(cbo_descricao || '') } : {}),
            ...(cns ? { cns: String(cns).replace(/\D/g, '').slice(0, 15) } : {}),
          },
        })
        .select()
        .single();

      if (dbErr) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return new Response(
          JSON.stringify({ error: "Erro ao salvar funcionário: " + dbErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(JSON.stringify({ success: true, funcionario: func }), {
        headers: corsHeaders,
      });
    }

    if (action === "update") {
      const { id, senha } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ error: "ID do funcionário é obrigatório." }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Get current record
      const { data: current, error: fetchErr } = await supabaseAdmin
        .from("funcionarios")
        .select("id,auth_user_id,email,usuario,custom_data,role,unidade_id,ativo")
        .eq("id", id)
        .single();

      if (fetchErr || !current) {
        return new Response(
          JSON.stringify({ error: "Funcionário não encontrado." }),
          { status: 200, headers: corsHeaders }
        );
      }

      const scopeError=employeeChangeError(actor,current,body);
      if(scopeError)return fail(scopeError,403);

      // Build DB update fields (exclude non-DB fields)
      const dbFields: Record<string, any> = {};
      const allowedFields = [
        'nome', 'usuario', 'email', 'cpf', 'setor', 'unidade_id', 'sala_id',
        'cargo', 'role', 'ativo', 'tempo_atendimento', 'profissao',
        'tipo_conselho', 'numero_conselho', 'uf_conselho', 'pode_agendar_retorno', 'coren'
      ];

      for (const key of allowedFields) {
        if (body[key] !== undefined) {
          dbFields[key] = body[key];
        }
      }

      // Merge CBO, CNS and extra custom_data fields (preserve existing custom fields)
      const hasExtras = body.custom_data_extras && typeof body.custom_data_extras === 'object';
      if (body.cbo_codigo !== undefined || body.cbo_descricao !== undefined || body.cns !== undefined || hasExtras) {
        const existingCustom = (current.custom_data as Record<string, any>) || {};
        const merged: Record<string, any> = { ...existingCustom, ...(hasExtras ? body.custom_data_extras : {}) };
        if (body.cbo_codigo !== undefined || body.cbo_descricao !== undefined) {
          merged.cbo_codigo = String(body.cbo_codigo || '');
          merged.cbo_descricao = String(body.cbo_descricao || '');
        }
        if (body.cns !== undefined) {
          merged.cns = String(body.cns || '').replace(/\D/g, '').slice(0, 15);
        }
        dbFields.custom_data = merged;
      }

      // Normalize email
      if (dbFields.email) {
        dbFields.email = dbFields.email.trim().toLowerCase();
      }
      if (dbFields.usuario) {
        dbFields.usuario = dbFields.usuario.trim();
      }

      // Check for email uniqueness if email is changing
      const newEmail = dbFields.email;
      if (newEmail && newEmail !== current.email?.trim().toLowerCase()) {
        const { data: emailCheck } = await supabaseAdmin
          .from("funcionarios")
          .select("id")
          .eq("email", newEmail)
          .neq("id", id);

        if (emailCheck && emailCheck.length > 0) {
          return new Response(
            JSON.stringify({ error: "Este e-mail já está em uso por outro funcionário." }),
            { status: 200, headers: corsHeaders }
          );
        }
      }

      // Check for usuario uniqueness if usuario is changing
      const newUsuario = dbFields.usuario;
      if (newUsuario && newUsuario !== current.usuario) {
        const { data: userCheck } = await supabaseAdmin
          .from("funcionarios")
          .select("id")
          .eq("usuario", newUsuario)
          .neq("id", id);

        if (userCheck && userCheck.length > 0) {
          return new Response(
            JSON.stringify({ error: "Este nome de usuário já está em uso." }),
            { status: 200, headers: corsHeaders }
          );
        }
      }

      // FIRST: Update auth user (source of truth) BEFORE updating DB
      if (current.auth_user_id) {
        const authUpdate: Record<string, any> = {};
        
      if (senha && typeof senha === 'string' && senha.trim().length > 0) {
          if (senha.length < 6) {
            return new Response(
              JSON.stringify({ error: "A senha deve ter no mínimo 6 caracteres." }),
              { status: 200, headers: corsHeaders }
            );
          }
          if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/[0-9]/.test(senha)) {
            return new Response(
              JSON.stringify({ error: "A senha deve conter letras minúsculas, maiúsculas e números." }),
              { status: 200, headers: corsHeaders }
            );
          }
          authUpdate.password = senha;
        }
        if (newEmail && newEmail !== current.email?.trim().toLowerCase()) {
          authUpdate.email = newEmail;
          authUpdate.email_confirm = true; // Auto-confirm email change
        }

        if (Object.keys(authUpdate).length > 0) {
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
            current.auth_user_id,
            authUpdate
          );

          if (authErr) {
            console.error("Auth update error:", authErr);
            let errorMsg = "Erro ao atualizar credenciais de acesso.";
            if (authErr.message?.includes("weak_password") || (authErr as any).code === "weak_password" || authErr.message?.includes("Password should contain")) {
              errorMsg = "Senha fraca. A senha deve conter letras minúsculas, maiúsculas e números. Mínimo 6 caracteres.";
            } else {
              errorMsg = "Erro ao atualizar credenciais: " + authErr.message;
            }
            return new Response(
              JSON.stringify({ error: errorMsg }),
              { status: 200, headers: corsHeaders }
            );
          }
        }
      } else {
        // Funcionario has no auth link - create one if password is provided
        if (senha && dbFields.email) {
          const { data: newAuth, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: dbFields.email || current.email,
            password: senha,
            email_confirm: true,
          });

          if (createErr) {
            console.error("Auth create error:", createErr);
            return new Response(
              JSON.stringify({ error: "Erro ao criar credenciais: " + createErr.message }),
              { status: 200, headers: corsHeaders }
            );
          }

          dbFields.auth_user_id = newAuth.user.id;
        }
      }

      // THEN: Update DB
      const { data: func, error: dbErr } = await supabaseAdmin
        .from("funcionarios")
        .update(dbFields)
        .eq("id", id)
        .select()
        .single();

      if (dbErr) {
        console.error("DB update error:", dbErr);
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar: " + dbErr.message }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(JSON.stringify({ success: true, funcionario: func }), {
        headers: corsHeaders,
      });
    }

    if (action === "delete") {
      // IDs are also referenced by historical clinical records, including text IDs.
      // Preserve the employee and authentication link; deactivation is a separate authorized update.
      return fail("Exclusão definitiva suspensa para preservar os históricos. Utilize Desativar funcionário.");
    }

    if (action === "list") {
      let query=supabaseAdmin.from("funcionarios").select("*").order("criado_em",{ascending:false});
      if(!global)query=query.eq("unidade_id",actor.unidade_id).neq("usuario","admin.sms");
      const {data,error}=await query;
      if(error)return fail("Não foi possível consultar funcionários.");
      return new Response(JSON.stringify({funcionarios:data||[]}),{headers:corsHeaders});
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida." }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("Employee management error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro interno",
      }),
      { status: 200, headers: corsHeaders }
    );
  }
});
