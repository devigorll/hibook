#!/usr/bin/env node
// Gera public/js/config/env.js a partir de variáveis de ambiente (Vercel) ou do arquivo .env (local).
//
// Por quê: o site é HTML/JS estáticos, sem bundler. O navegador não lê .env nem process.env,
// então este script (rodado em "npm run build") escreve os valores PÚBLICOS num módulo ES.
// É o mesmo princípio do prefixo VITE_ no Vite: o valor vai para o navegador.
//
// Segurança:
//  - só as variáveis da lista PUBLIC_VARS são copiadas (qualquer outra variável nunca é lida);
//  - chaves secretas (sb_secret_..., service_role) são recusadas e o build falha.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_FILE = resolve(ROOT, 'public/js/config/env.js');
const DOTENV_FILE = resolve(ROOT, '.env');

// nome exportado no env.js -> nomes aceitos no ambiente (o primeiro é o preferido)
const PUBLIC_VARS = {
  SUPABASE_URL: ['SUPABASE_URL'],
  SUPABASE_PUBLISHABLE_KEY: ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']
};

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

// --- Leitura do .env ---------------------------------------------------------

export function parseDotenv(text) {
  const values = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) continue;

    const name = match[1];
    let value = match[2].trim();

    const quoted = value.match(/^(["'])(.*)\1/);

    if (quoted) {
      value = quoted[2];
    } else {
      value = value.replace(/\s+#.*$/, ''); // comentário no fim da linha
    }

    values[name] = value;
  }

  return values;
}

// Variáveis do ambiente (Vercel, CI) têm prioridade sobre o .env.
export function resolveConfig(processEnv, dotenvText = '') {
  const fromFile = parseDotenv(dotenvText);
  const read = (source, name) => (source[name] ?? '').trim();
  const config = {};

  for (const [exportedName, acceptedNames] of Object.entries(PUBLIC_VARS)) {
    const fromEnv = acceptedNames.map((name) => read(processEnv, name)).find(Boolean);
    const fromDotenv = acceptedNames.map((name) => read(fromFile, name)).find(Boolean);

    config[exportedName] = fromEnv || fromDotenv || '';
  }

  return config;
}

// --- Validação ---------------------------------------------------------------

function decodeJwtPayload(token) {
  const parts = token.split('.');

  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function validateConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }) {
  const problems = [];

  if (!url) {
    problems.push('SUPABASE_URL não definida (ex.: https://SEU-PROJETO.supabase.co).');
  } else {
    try {
      const parsed = new URL(url);
      const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);

      if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
        problems.push('SUPABASE_URL precisa usar https://.');
      }

      if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username) {
        problems.push('SUPABASE_URL deve conter apenas o endereço do projeto, sem caminho (/rest/v1) nem parâmetros.');
      }
    } catch {
      problems.push('SUPABASE_URL não é um endereço válido.');
    }
  }

  if (!key) {
    problems.push('SUPABASE_PUBLISHABLE_KEY não definida (chave "publishable" do painel do Supabase).');
  } else if (/\s/.test(key)) {
    problems.push('SUPABASE_PUBLISHABLE_KEY contém espaços ou quebras de linha.');
  } else if (key.startsWith('sb_secret_')) {
    problems.push('A chave informada é SECRETA (sb_secret_...). Ela nunca pode ir para o navegador. Use a chave publishable.');
  } else if (!key.startsWith('sb_publishable_')) {
    const payload = decodeJwtPayload(key);

    if (!payload) {
      problems.push('SUPABASE_PUBLISHABLE_KEY em formato não reconhecido (esperado: sb_publishable_... ou a chave "anon" legada).');
    } else if (payload.role === 'service_role') {
      problems.push('A chave informada é a service_role (administrativa). Ela NUNCA pode ir para o navegador. Use a chave publishable/anon.');
    } else if (payload.role !== 'anon') {
      problems.push(`A chave JWT tem o papel "${payload.role}"; só a chave pública (papel "anon") é aceita.`);
    }
  }

  return problems;
}

// --- Geração do módulo -------------------------------------------------------

export function renderEnvModule(config) {
  return [
    '// ARQUIVO GERADO por scripts/generate-env.mjs (npm run build). Não edite e não envie ao Git.',
    '// Contém apenas valores públicos: a proteção dos dados vem das políticas RLS do Supabase.',
    ...Object.keys(PUBLIC_VARS).map((name) => `export const ${name} = ${JSON.stringify(config[name])};`),
    ''
  ].join('\n');
}

export function generate(processEnv, dotenvText = '') {
  const config = resolveConfig(processEnv, dotenvText);
  const problems = validateConfig(config);

  if (problems.length > 0) throw new ConfigError(problems);

  return { config, code: renderEnvModule(config) };
}

// Mostra só o começo e o fim da chave nos logs.
function maskKey(key) {
  return key.length > 24 ? `${key.slice(0, 16)}…${key.slice(-4)}` : '…';
}

// --- Execução pela linha de comando -----------------------------------------

function main() {
  const dotenvText = existsSync(DOTENV_FILE) ? readFileSync(DOTENV_FILE, 'utf8') : '';

  try {
    const { config, code } = generate(process.env, dotenvText);

    mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
    writeFileSync(OUTPUT_FILE, code, 'utf8');

    console.log('[env] public/js/config/env.js gerado.');
    console.log(`[env] URL:   ${config.SUPABASE_URL}`);
    console.log(`[env] Chave: ${maskKey(config.SUPABASE_PUBLISHABLE_KEY)}`);

    if (!new URL(config.SUPABASE_URL).hostname.endsWith('.supabase.co')) {
      console.warn('[env] Aviso: domínio fora de *.supabase.co. Ajuste connect-src e img-src no vercel.json.');
    }
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;

    console.error('[env] Configuração inválida:');
    error.problems.forEach((problem) => console.error(`  - ${problem}`));
    console.error('\nLocal: copie .env.example para .env e preencha.');
    console.error('Vercel: Project Settings > Environment Variables.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
