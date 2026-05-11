import { readFileSync, writeFileSync } from 'fs';

// Since I can't read from virtual tool-results directly in Bun, 
// I'll rely on the bash redirection to pass the content.

async function main() {
    let content = "";
    process.stdin.on("data", chunk => content += chunk);
    process.stdin.on("end", () => {
        const rowRegex = /<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<\/tr>/gs;
        const procedures: Map<string, {name: string, cids: Set<string>}> = new Map();
        
        let match;
        while ((match = rowRegex.exec(content)) !== null) {
            const code = match[1].trim();
            const name = match[2].trim();
            const cid = match[3].trim();
            
            if (code && name && code !== "Código do procedimento") {
                if (!procedures.has(code)) {
                    procedures.set(code, { name, cids: new Set() });
                }
                if (cid) {
                    procedures.get(code)!.cids.add(cid);
                }
            }
        }
        
        let sql = "DELETE FROM sigtap_procedimento_cids WHERE procedimento_codigo IN (SELECT codigo FROM sigtap_procedimentos WHERE especialidade = 'fonoaudiologia');\n";
        sql += "DELETE FROM sigtap_procedimentos WHERE especialidade = 'fonoaudiologia';\n";
        
        for (const [code, data] of procedures.entries()) {
            const safeName = data.name.replace(/'/g, "''");
            const totalCids = data.cids.size;
            sql += `INSERT INTO sigtap_procedimentos (codigo, nome, especialidade, origem, total_cids, ativo) VALUES ('${code}', '${safeName}', 'fonoaudiologia', 'SIGTAP', ${totalCids}, true);\n`;
            for (const cid of data.cids) {
                sql += `INSERT INTO sigtap_procedimento_cids (procedimento_codigo, cid_codigo) VALUES ('${code}', '${cid}');\n`;
            }
        }
        
        console.log(sql);
    });
}

main();
