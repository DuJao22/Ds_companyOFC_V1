import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');

class DBWrapper {
  private db: Database.Database;

  constructor() {
    try {
      this.db = new Database(dbPath);
      console.log('Connected to local SQLite database at', dbPath);
      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
    } catch (err: any) {
      console.error('Error opening local SQLite database:', err.message);
      throw err;
    }
  }

  /**
   * Executes a SQL query. Supports both string and template literal usage.
   */
  async sql(strings: TemplateStringsArray | string, ...values: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        let query = '';
        let params = values;

        if (typeof strings === 'string') {
          query = strings;
        } else {
          query = strings[0];
          for (let i = 0; i < values.length; i++) {
            query += '?' + strings[i + 1];
          }
        }

        const trimmedQuery = query.trim().toUpperCase();
        const isSelect = trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('PRAGMA');

        const stmt = this.db.prepare(query);

        if (isSelect) {
          const rows = stmt.all(...params);
          resolve(rows);
        } else {
          const info = stmt.run(...params);
          resolve({ lastID: info.lastInsertRowid, changes: info.changes });
        }
      } catch (err: any) {
        console.error('SQL Error:', err.message, '\nQuery:', typeof strings === 'string' ? strings : strings[0]);
        reject(err);
      }
    });
  }

  async close() {
    return new Promise<void>((resolve) => {
      this.db.close();
      console.log('Local SQLite connection closed.');
      resolve();
    });
  }

  /**
   * Pings the database to keep the connection alive (no-op for local SQLite)
   */
  async ping() {
    return Promise.resolve();
  }
}

const globalForDb = globalThis as unknown as {
  db: DBWrapper | undefined;
};

const db = globalForDb.db ?? new DBWrapper();

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

// Graceful shutdown
process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

// Initialize schema asynchronously
let isInitializing = false;
let isInitialized = false;

async function initializeSchema() {
  if (isInitializing || isInitialized) return;
  isInitializing = true;
  
  try {
    console.log('Initializing local SQLite schema...');
    await db.sql`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        api_key TEXT UNIQUE
      );
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        city TEXT,
        description TEXT,
        services TEXT,
        map_link TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        status TEXT DEFAULT 'prospectado',
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prompt_template TEXT NOT NULL,
        flow_structure TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS flow_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT UNIQUE NOT NULL,
        site_id INTEGER,
        site_name TEXT,
        status TEXT NOT NULL DEFAULT 'processing',
        final_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await db.sql`
      CREATE TABLE IF NOT EXISTS flow_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        data TEXT,
        FOREIGN KEY (execution_id) REFERENCES flow_executions (execution_id)
      );
    `;

    // Helper to add multiple columns if they don't exist
    const addColumnsIfMissing = async (table: string, columnsToAdd: { name: string, type: string }[]) => {
      try {
        const columns = await db.sql(`PRAGMA table_info(${table})`);
        const existingNames = columns.map((c: any) => c.name);
        
        for (const col of columnsToAdd) {
          if (!existingNames.includes(col.name)) {
            await db.sql(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
            console.log(`Added column ${col.name} to ${table}`);
          }
        }
      } catch (err) {
        console.warn(`Failed to check/add columns for ${table}:`, err instanceof Error ? err.message : 'Unknown error');
      }
    };

    // Add missing columns to users table
    await addColumnsIfMissing('users', [
      { name: 'daily_goal', type: 'INTEGER DEFAULT 0' },
      { name: 'sector', type: 'TEXT' },
      { name: 'gemini_api_key', type: 'TEXT' },
      { name: 'sales_message_template', type: 'TEXT' }
    ]);

    // Add missing columns to sites table
    await addColumnsIfMissing('sites', [
      { name: 'full_data', type: 'TEXT' },
      { name: 'hosting_url', type: 'TEXT' }
    ]);

    // Insert default templates if none exist
    const templatesCount = await db.sql`SELECT COUNT(*) as count FROM templates`;
    
    if (templatesCount[0].count === 0) {
      const instagramCTA = `
<footer style="position:relative;background:#040d1a;width:100%;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px 24px 48px;overflow:hidden;font-family:'Segoe UI',Arial,sans-serif;">
  <canvas id="c" style="position:absolute;inset:0;pointer-events:none;"></canvas>
  <a href="https://www.instagram.com/dscompany1_/" target="_blank" style="position:relative;display:flex;align-items:center;gap:10px;color:#c8d6e8;text-decoration:none;font-size:15px;letter-spacing:0.01em;margin-bottom:4px;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8d6e8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
    Siga-nos no Instagram @dscompany1_
  </a>
  <p style="position:relative;color:#4a6080;font-size:11px;text-align:center;line-height:1.6;">
    © 2025 DS Company. Todos os direitos reservados.
    <span style="margin:0 10px;opacity:0.4;">|</span>
    Desenvolvido por Paulo Davi e João Layon – DS Company.
  </p>
  <div style="position:relative;margin-top:12px;">
    <img src="https://i.postimg.cc/Cxv0DTRX/image.png" alt="DS Company" style="height:80px;width:auto;opacity:0.85;" />
  </div>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];
    function init() {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
      particles = [];
      for(let i=0; i<30; i++) particles.push({
        x: Math.random()*w, y: Math.random()*h,
        vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
        s: Math.random()*2
      });
    }
    function draw() {
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = 'rgba(200,214,232,0.2)';
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if(p.x<0) p.x=w; if(p.x>w) p.x=0;
        if(p.y<0) p.y=h; if(p.y>h) p.y=0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    window.addEventListener('resize', init);
    init(); draw();
  </script>
</footer>`;

      const defaultPrompt = `Aja como um Arquiteto Front-end e Creative Developer sênior.

Desenvolva a melhor landing page do mundo para o "\${data.name}".

🚨 REQUISITO ABSOLUTO:
A experiência deve ser 100% responsiva seguindo estritamente a filosofia MOBILE FIRST.
Tudo deve funcionar perfeitamente em celular antes de desktop.

🎬 INTRO SEQUENCE (OBRIGATÓRIO):
Crie uma introdução animada de 5 segundos antes da página carregar:
- Tipografia cinética com o nome "\${data.name}"
- Animação estilo abertura rústica (como portas de madeira se abrindo)
- Partículas 3D simulando brasas de fogão a lenha
- Sons sutis de ambiente rural (opcional)
- Transição cinematográfica para o conteúdo

⚙️ REQUISITOS TÉCNICOS:
- Three.js para background 3D interativo
- GSAP para animações principais
- ScrollTrigger para animações no scroll
- HTML 100% standalone (CSS + JS internos)
- Alta performance
- Código limpo e organizado

🎯 OBJETIVO:
Criar uma landing page extremamente persuasiva focada em atrair clientes para o negócio.

📍 INFORMAÇÕES DO LOCAL:
- Nome: \${data.name}
- Endereço: \${data.address}
- Cidade: \${data.city}
- Google Maps: \${mapLink}

📱 CONTATO:
- WhatsApp: \${data.phone} (botão clicável)

🍽️ DESCRIÇÃO:
\${data.description}

🌿 EXPERIÊNCIA DO AMBIENTE:
- Ambiente rústico e aconchegante
- Espaço arborizado
- Clima familiar
- Música ao vivo
- Contato com a natureza

🔥 DIFERENCIAIS:
- Comida feita no fogão a lenha
- Mais de 20 anos de tradição
- Espaço Kids
- Estacionamento gratuito
- Ideal para famílias e eventos

🍴 SERVIÇOS (OBRIGATÓRIO DESTACAR EM CARDS ANIMADOS):
\${data.services}

🎬 ANIMAÇÕES (OBRIGATÓRIO):
- Efeito de fumaça leve subindo (fogão a lenha)
- Elementos de comida aparecendo com fade + scale
- Scroll com parallax suave
- Cards com hover 3D
- Seção de serviços com animação stagger
- Botões com efeito glow suave

🎨 DESIGN:
- Estilo rústico premium + moderno
- Cores: marrom, bege, verde, tons de madeira
- Efeito glassmorphism leve
- Tipografia elegante e acolhedora
- Texturas suaves de madeira

🧠 SEÇÕES DA LANDING PAGE:
1. Hero Section (com animação inicial + CTA)
2. Sobre o Restaurante
3. Experiência do Ambiente
4. Serviços (cards animados)
5. Diferenciais
6. Galeria (com animação)
7. Localização (mapa embutido)
8. CTA final

📲 CTA FINAL (OBRIGATÓRIO):
- Botão grande WhatsApp
- Texto forte: “Venha viver a verdadeira experiência da culinária mineira!”
- Destaque para família e tradição

💎 CRÉDITOS E INSTAGRAM (OBRIGATÓRIO NO RODAPÉ):
Adicione este código HTML exatamente como está no final da página, antes de fechar o body:
${instagramCTA}

⚠️ REGRAS DE OURO (PROIBIDO VIOLAR):
1. RETORNE APENAS O CÓDIGO HTML.
2. NÃO ESCREVA NADA ANTES DO HTML (NEM "AQUI ESTÁ O CÓDIGO", NEM "ESTE É O CÓDIGO").
3. NÃO USE BLOCOS DE CÓDIGO MARKDOWN (NÃO USE \`\`\`html OU \`\`\`).
4. O RESULTADO DEVE COMEÇAR DIRETAMENTE COM <!DOCTYPE html> E TERMINAR COM </html>.
5. QUALQUER TEXTO FORA DAS TAGS HTML QUEBRARÁ O SISTEMA.`;

      const defaultFlow = JSON.stringify({
        "nodes": [
          {
            "id": "node-start",
            "type": "custom",
            "data": { "label": "Início do Fluxo", "type": "start", "status": "SUCCESS", "config": {} }
          },
          {
            "id": "node-gemini-mobile-first",
            "type": "custom",
            "data": {
              "label": "Gerar Landing Page Mobile First",
              "type": "httpRequest",
              "status": "SUCCESS",
              "config": {
                "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key={YOUR_API_KEY}",
                "method": "POST",
                "body": {
                  "contents": [{ "parts": [{ "text": "{{prompt}}" }] }],
                  "systemInstruction": {
                    "parts": [{ "text": "Você é um gerador de código HTML puro. Retorne APENAS o código HTML completo, começando com <!DOCTYPE html> e terminando com </html>. NÃO use markdown. NÃO escreva nenhuma introdução, explicação ou comentário fora das tags HTML. Se houver qualquer texto fora do HTML, o sistema falhará." }]
                  }
                }
              }
            }
          },
          {
            "id": "node-deploy-mobile",
            "type": "custom",
            "data": {
              "label": "Deploy Mobile First Experience",
              "type": "httpRequest",
              "status": "SUCCESS",
              "config": {
                "url": "https://flowpost.onrender.com/api/upload",
                "method": "POST",
                "body": {
                  "name": "{{siteName}} - Mobile First Immersive",
                  "html": "{{input.text}}"
                }
              }
            }
          }
        ],
        "edges": [
          { "id": "e-start-gemini", "source": "node-start", "target": "node-gemini-mobile-first" },
          { "id": "e-gemini-deploy", "source": "node-gemini-mobile-first", "target": "node-deploy-mobile" }
        ]
      });

      const modernPrompt = `Aja como um Arquiteto Front-end e Creative Developer sênior.
Desenvolva uma landing page ultra-moderna e minimalista para "\${data.name}".
Foco em tecnologia, design limpo e alta conversão.
Use Dark Mode por padrão com acentos em Neon.
Placeholder: \${data.name}, \${data.address}, \${data.city}, \${data.phone}, \${data.description}, \${data.services}, \${mapLink}.

💎 CRÉDITOS E INSTAGRAM (OBRIGATÓRIO NO RODAPÉ):
Adicione este código HTML exatamente como está no final da página, antes de fechar o body:
${instagramCTA}

⚠️ REGRAS DE OURO (PROIBIDO VIOLAR):
1. RETORNE APENAS O CÓDIGO HTML.
2. NÃO ESCREVA NADA ANTES DO HTML (NEM "AQUI ESTÁ O CÓDIGO", NEM "ESTE É O CÓDIGO").
3. NÃO USE BLOCOS DE CÓDIGO MARKDOWN (NÃO USE \`\`\`html OU \`\`\`).
4. O RESULTADO DEVE COMEÇAR DIRETAMENTE COM <!DOCTYPE html> E TERMINAR COM </html>.
5. QUALQUER TEXTO FORA DAS TAGS HTML QUEBRARÁ O SISTEMA.`;

      const servicePrompt = `Aja como um Arquiteto Front-end e Creative Developer sênior.
Desenvolva uma landing page focada em serviços locais para "\${data.name}".
Design amigável, botões de agendamento claros e depoimentos.
Placeholder: \${data.name}, \${data.address}, \${data.city}, \${data.phone}, \${data.description}, \${data.services}, \${mapLink}.

💎 CRÉDITOS E INSTAGRAM (OBRIGATÓRIO NO RODAPÉ):
Adicione este código HTML exatamente como está no final da página, antes de fechar o body:
${instagramCTA}

⚠️ REGRAS DE OURO (PROIBIDO VIOLAR):
1. RETORNE APENAS O CÓDIGO HTML.
2. NÃO ESCREVA NADA ANTES DO HTML (NEM "AQUI ESTÁ O CÓDIGO", NEM "ESTE É O CÓDIGO").
3. NÃO USE BLOCOS DE CÓDIGO MARKDOWN (NÃO USE \`\`\`html OU \`\`\`).
4. O RESULTADO DEVE COMEÇAR DIRETAMENTE COM <!DOCTYPE html> E TERMINAR COM </html>.
5. QUALQUER TEXTO FORA DAS TAGS HTML QUEBRARÁ O SISTEMA.`;

      await db.sql`INSERT INTO templates (name, prompt_template, flow_structure) VALUES ('Modelo Rústico Padrão', ${defaultPrompt}, ${defaultFlow})`;
      await db.sql`INSERT INTO templates (name, prompt_template, flow_structure) VALUES ('Modelo Moderno Tech', ${modernPrompt}, ${defaultFlow})`;
      await db.sql`INSERT INTO templates (name, prompt_template, flow_structure) VALUES ('Modelo Serviços Locais', ${servicePrompt}, ${defaultFlow})`;
    }

    // Generate API keys for users that don't have one
    const usersWithoutApiKey = await db.sql`SELECT id FROM users WHERE api_key IS NULL`;
    for (const user of usersWithoutApiKey) {
      const apiKey = crypto.randomBytes(24).toString('hex');
      await db.sql`UPDATE users SET api_key = ${apiKey} WHERE id = ${user.id}`;
    }
    
    isInitialized = true;
    console.log('Local SQLite schema initialization complete.');
  } catch (error) {
    console.error('Error initializing local SQLite schema:', error);
  } finally {
    isInitializing = false;
  }
}

// Start initialization
initializeSchema();

export default db;
