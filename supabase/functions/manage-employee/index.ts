import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

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

    if (action === "create") {
      const { nome, usuario, email, cpf, senha, setor, unidade_id, sala_id, cargo, role, criado_por, tempo_atendimento, profissao, tipo_conselho, numero_conselho, uf_conselho, pode_agendar_retorno, coren } = body;

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
          criado_por: criado_por || "",
          tempo_atendimento: tempo_atendimento || 30,
          profissao: profissao || "",
          tipo_conselho: tipo_conselho || "",
          numero_conselho: numero_conselho || "",
          uf_conselho: uf_conselho || "",
          pode_agendar_retorno: pode_agendar_retorno ?? false,
          cpf: cpf || "",
          coren: coren || "",
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
        .select("auth_user_id, email, usuario")
        .eq("id", id)
        .single();

      if (fetchErr || !current) {
        return new Response(
          JSON.stringify({ error: "Funcionário não encontrado." }),
          { status: 200, headers: corsHeaders }
        );
      }

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
      const { id } = body;

      const { data: func } = await supabaseAdmin
        .from("funcionarios")
        .select("auth_user_id")
        .eq("id", id)
        .single();

      if (func?.auth_user_id) {
        await supabaseAdmin.auth.admin.deleteUser(func.auth_user_id);
      }

      await supabaseAdmin.from("funcionarios").delete().eq("id", id);

      return new Response(JSON.stringify({ success: true }), {
        headers: corsHeaders,
      });
    }

    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("funcionarios")
        .select("*")
        .order("criado_em", { ascending: false });

      return new Response(JSON.stringify({ funcionarios: data || [] }), {
        headers: corsHeaders,
      });
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
