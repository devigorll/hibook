import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDotenv, resolveConfig, validateConfig, generate, renderEnvModule, ConfigError } from './generate-env.mjs';

const URL_OK = 'https://abcdefghij.supabase.co';
const KEY_OK = 'sb_publishable_AbCdEfGhIjKlMnOp_123456';
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.assinatura`;

test('parseDotenv: comentários, aspas, export e comentário no fim da linha', () => {
  const values = parseDotenv('# c\nA=1\nexport B="dois"\nC=\'tres\'\nD=quatro # nota\n\nlixo sem igual\n');
  assert.deepEqual(values, { A: '1', B: 'dois', C: 'tres', D: 'quatro' });
});

test('parseDotenv: aceita fim de linha do Windows (CRLF)', () => {
  assert.deepEqual(parseDotenv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('resolveConfig: variável de ambiente vence o .env', () => {
  const config = resolveConfig({ SUPABASE_URL: URL_OK }, `SUPABASE_URL=https://outro.supabase.co\nSUPABASE_PUBLISHABLE_KEY=${KEY_OK}`);
  assert.equal(config.SUPABASE_URL, URL_OK);
  assert.equal(config.SUPABASE_PUBLISHABLE_KEY, KEY_OK);
});

test('resolveConfig: aceita o nome legado SUPABASE_ANON_KEY', () => {
  assert.equal(resolveConfig({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: KEY_OK }).SUPABASE_PUBLISHABLE_KEY, KEY_OK);
});

test('resolveConfig: ignora variáveis fora da lista (nenhum segredo vaza)', () => {
  const config = resolveConfig({
    SUPABASE_URL: URL_OK,
    SUPABASE_PUBLISHABLE_KEY: KEY_OK,
    SUPABASE_SERVICE_ROLE_KEY: 'segredo',
    DATABASE_URL: 'postgres://x'
  });
  assert.deepEqual(Object.keys(config).sort(), ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL']);
});

test('validateConfig: configuração correta não tem problemas', () => {
  assert.deepEqual(validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: KEY_OK }), []);
});

test('validateConfig: variáveis ausentes são apontadas', () => {
  assert.equal(validateConfig({ SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' }).length, 2);
});

test('validateConfig: chave secreta sb_secret_ é recusada', () => {
  const [problem] = validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop' });
  assert.match(problem, /SECRETA/);
});

test('validateConfig: JWT service_role é recusado', () => {
  const [problem] = validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }) });
  assert.match(problem, /service_role/);
});

test('validateConfig: JWT anon legado é aceito; outros papéis não', () => {
  assert.deepEqual(validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }) }), []);
  assert.equal(validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'authenticated' }) }).length, 1);
});

test('validateConfig: chave em formato desconhecido é recusada', () => {
  assert.equal(validateConfig({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: 'qualquercoisa' }).length, 1);
});

test('validateConfig: URL precisa ser https e sem caminho (localhost pode ser http)', () => {
  assert.equal(validateConfig({ SUPABASE_URL: 'http://abc.supabase.co', SUPABASE_PUBLISHABLE_KEY: KEY_OK }).length, 1);
  assert.equal(validateConfig({ SUPABASE_URL: `${URL_OK}/rest/v1`, SUPABASE_PUBLISHABLE_KEY: KEY_OK }).length, 1);
  assert.equal(validateConfig({ SUPABASE_URL: 'não é url', SUPABASE_PUBLISHABLE_KEY: KEY_OK }).length, 1);
  assert.deepEqual(validateConfig({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY: KEY_OK }), []);
});

test('renderEnvModule: gera módulo ES e escapa aspas', () => {
  const code = renderEnvModule({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: 'a"b' });
  assert.match(code, /export const SUPABASE_URL = "https:\/\/abcdefghij\.supabase\.co";/);
  assert.match(code, /export const SUPABASE_PUBLISHABLE_KEY = "a\\"b";/);
});

test('generate: sucesso produz o código; configuração inválida lança ConfigError', () => {
  assert.match(generate({ SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: KEY_OK }).code, /SUPABASE_URL/);
  assert.throws(() => generate({}), ConfigError);
});
