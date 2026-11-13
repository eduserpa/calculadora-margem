// Dados na nuvem (Supabase): login por link no e-mail, empresa ativa e o "guardado" que a camada de dados (dados.js) usa.
// As telas não mudam: continuam lendo `dados` e chamando `salvar()`. Aqui cada gravação vira só o que mudou.
//
// Para as telas de equipe, histórico e empresa (todas lançam Error com mensagem em pt-BR):
//   minhasEmpresas()            -> [{ id, nome, papel, foto }] (foto: endereço do logo ou null)
//   empresaAtual()              -> id da empresa em uso
//   trocarEmpresa(id)           -> guarda a escolha e recarrega a página
//   criarEmpresa(nome)          -> cria com você como dono e já troca para ela (recarrega)
//   renomearEmpresa(nome)       -> renomeia a empresa em uso (só o dono)
//   trocarFotoEmpresa(dataUrl)  -> endereço do logo novo da empresa em uso (só o dono; dataUrl já reduzida pela tela)
//   tirarFotoEmpresa()          -> tira o logo da empresa em uso (só o dono)
//   equipe()                    -> { membros: [{ usuarioId, email, papel, entrouEm }], convites: [{ email, papel, convidadoEm }], souDono }
//   convidar(email, papel), cancelarConvite(email), removerMembro(usuarioId)
//   mudarPapel(usuarioId, papel) -> 'dono' | 'membro'; só o dono; a empresa nunca fica sem dono
//   historico({ quem })         -> [{ quando, quem, acao, detalhe }], os últimos 200 (quem: e-mail, opcional)
//   previaCopia(origemId)       -> { itens: [{ id, nome, sku, foto, situacao }], novos, atualizados, repetidos } (estes [{ nome, sku }])
//                                  repetidos: SKU repetido numa das empresas; entram como novos, sem sobrescrever nada
//   copiarProdutos(origemId, ids) -> { novos, atualizados } (ids: só os escolhidos; null = todos. Novos inclui os repetidos)
//   anotarImportacao(detalhe)   -> uma linha "Importação" no histórico
//   souDono()                   -> se quem está logado é dono da empresa em uso
import { SUPABASE } from './config.js';
import { produtoVazio } from './produtos.js';
import { dados } from './dados.js';

const BIBLIOTECA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';
const CHAVE_EMPRESA = 'calculadora-margem.empresa';
let cliente = null;
let pessoa = null;
let empresaId = null;
let empresas = [];

async function supa() {
  if (!cliente) {
    const { createClient } = await import(BIBLIOTECA);
    cliente = createClient(SUPABASE.url, SUPABASE.chave);
  }
  return cliente;
}

const falhou = (texto) => ({ error }) => {
  if (error) throw new Error(texto);
};

// ---------- login ----------

// Pessoa logada (o link do e-mail é lido sozinho ao abrir a página) ou null.
export async function pessoaLogada() {
  const { data } = await (await supa()).auth.getSession();
  pessoa = data.session?.user ?? null;
  return pessoa;
}

// Manda o link de acesso. A conta só é criada para quem tem convite (o hook do banco recusa os outros).
export async function mandarLink(email) {
  const { error } = await (await supa()).auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
  });
  if (!error) return;
  throw new Error(/não foi convidado|signups? not allowed|not found|otp_disabled|hook/i.test(error.message)
    ? 'Este e-mail não tem acesso. Peça um convite a quem é admin da empresa no Calculéo.'
    : /rate|seconds|security purposes/i.test(error.message)
      ? 'Já mandamos um link há pouco. Espere 1 minuto e tente de novo.'
      : 'Não deu para mandar o link agora. Confira o e-mail e tente de novo.');
}

// Entrar com e-mail e senha. criar = primeiro acesso (cria a senha; o hook do banco recusa quem não tem convite).
export async function entrarComSenha(email, senha, criar = false) {
  if (String(senha).length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  const auth = (await supa()).auth;
  const dados = { email: email.trim().toLowerCase(), password: senha };
  const { data, error } = criar ? await auth.signUp(dados) : await auth.signInWithPassword(dados);
  if (!error && data.session) return;
  const m = error?.message ?? '';
  throw new Error(/não foi convidado|hook|signups? not allowed/i.test(m) ? 'Este e-mail não tem acesso. Peça um convite a quem é admin da empresa no Calculéo.'
    : /already registered|already exists/i.test(m) ? 'Este e-mail já tem conta. Entre com a sua senha ou peça o link por e-mail.'
      : /invalid login|invalid credentials/i.test(m) ? 'E-mail ou senha errados.'
        : /password/i.test(m) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
          : /rate|seconds/i.test(m) ? 'Muitas tentativas. Espere 1 minuto e tente de novo.'
            : !error ? 'A conta foi criada, mas precisa ser confirmada por e-mail. Avise o admin da empresa.'
              : 'Não deu para entrar agora. Confira a internet e tente de novo.');
}

// Esqueci a senha: manda o link para criar uma nova (precisa de SMTP próprio no Supabase; ver config.ESQUECI_SENHA).
export async function esqueciSenha(email) {
  const { error } = await (await supa()).auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + location.pathname });
  if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'Já mandamos um link há pouco. Espere 1 minuto e tente de novo.' : 'Não deu para mandar o link agora. Confira o e-mail e tente de novo.');
}

// Quem voltou pelo link de "Esqueci a senha" já está logado e escolhe a senha nova.
export async function trocarSenha(senha) {
  if (String(senha).length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  const { error } = await (await supa()).auth.updateUser({ password: senha });
  if (error) throw new Error(/different|same/i.test(error.message) ? 'Use uma senha diferente da antiga.' : 'Não deu para salvar a senha nova. Peça outro link e tente de novo.');
}

export async function sair() {
  await (await supa()).auth.signOut();
  location.reload();
}

// ---------- empresas ----------

// Entra nas empresas que convidaram este e-mail e escolhe a empresa em uso. Devolve o id, ou null se não há nenhuma.
export async function prepararEmpresa() {
  const s = await supa();
  falhou('Não deu para falar com o banco. Confira a internet e recarregue a página.')(await s.rpc('aceitar_convites'));
  empresas = await minhasEmpresas();
  let guardada = null;
  try {
    guardada = localStorage.getItem(CHAVE_EMPRESA);
  } catch {
    // sem armazenamento: usa a primeira
  }
  empresaId = (empresas.find((e) => e.id === guardada) ?? empresas[0])?.id ?? null;
  return empresaId;
}

export async function minhasEmpresas() {
  const r = await (await supa()).from('membros').select('papel, empresa_id, empresas(*)').eq('usuario_id', pessoa.id);
  falhou('Não deu para ler suas empresas.')(r);
  return r.data.map((m) => ({ id: m.empresa_id, nome: m.empresas?.nome ?? '', papel: m.papel, foto: m.empresas?.foto ?? null })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const empresaAtual = () => empresaId;
export const souDono = () => empresas.find((e) => e.id === empresaId)?.papel === 'dono';
export const emailAtual = () => pessoa?.email ?? '';

// Cria uma empresa com quem está logado como dono e já passa a usar a nova.
export async function criarEmpresa(nome) {
  if (!String(nome).trim()) throw new Error('Dê um nome à empresa.');
  const r = await (await supa()).rpc('criar_empresa', { nome_empresa: String(nome).trim() });
  falhou('Não deu para criar a empresa agora.')(r);
  trocarEmpresa(r.data);
}

// Renomeia a empresa em uso (só o dono).
export async function renomearEmpresa(nome) {
  if (!String(nome).trim()) throw new Error('Dê um nome à empresa.');
  const r = await (await supa()).from('empresas').update({ nome: String(nome).trim() }).eq('id', empresaId).select();
  falhou('Não deu para renomear agora.')(r);
  if (!r.data.length) throw new Error('Só o admin pode renomear a empresa.');
  const e = empresas.find((x) => x.id === empresaId);
  if (e) e.nome = r.data[0].nome;
}

// Logo da empresa em uso: sobe para fotos/<empresa>/empresa/<hash>, grava empresas.foto (só o dono, pela RLS) e apaga o
// anterior se ninguém mais usa (foto_em_uso olha também empresas.foto, correcao-09).
async function gravarFotoEmpresa(s, foto) {
  const r = await s.from('empresas').update({ foto }).eq('id', empresaId).select();
  falhou('Não deu para gravar a foto agora.')(r);
  if (!r.data.length) {
    if (foto) await apagarFotosOrfas(s, [foto], empresaId);
    throw new Error('Só o admin pode trocar a foto da empresa.');
  }
  const e = empresas.find((x) => x.id === empresaId);
  const antes = e?.foto;
  if (e) e.foto = foto;
  if (antes && antes !== foto) await apagarFotosOrfas(s, [antes], empresaId);
}

export async function trocarFotoEmpresa(dataUrl) {
  const s = await supa();
  const url = await subirFoto(s, 'empresa', dataUrl).catch((erro) => {
    console.warn(erro);
    throw new Error('Não deu para subir a foto agora. Confira a internet e tente de novo.');
  });
  await gravarFotoEmpresa(s, url);
  return url;
}

export const tirarFotoEmpresa = async () => gravarFotoEmpresa(await supa(), null);

export function trocarEmpresa(id) {
  try {
    localStorage.setItem(CHAVE_EMPRESA, id);
  } catch {
    // sem armazenamento: vale só agora
  }
  location.reload();
}

// ---------- equipe ----------

export async function equipe() {
  const s = await supa();
  const [m, c] = await Promise.all([
    s.from('membros').select('usuario_id, email, papel, entrou_em').eq('empresa_id', empresaId).order('email'),
    s.from('convites').select('email, papel, convidado_em').eq('empresa_id', empresaId).order('email'),
  ]);
  falhou('Não deu para ler a equipe.')(m);
  falhou('Não deu para ler os convites.')(c);
  return {
    membros: m.data.map((x) => ({ usuarioId: x.usuario_id, email: x.email, papel: x.papel, entrouEm: x.entrou_em })),
    convites: c.data.map((x) => ({ email: x.email, papel: x.papel, convidadoEm: x.convidado_em })),
    souDono: empresas.find((e) => e.id === empresaId)?.papel === 'dono',
  };
}

export async function convidar(email, papel = 'membro') {
  const limpo = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)) throw new Error('Digite um e-mail válido.');
  const { error } = await (await supa()).from('convites').insert({ empresa_id: empresaId, email: limpo, papel });
  if (!error) return;
  throw new Error(error.code === '23505' ? 'Este e-mail já foi convidado.' : /row-level security/i.test(error.message) ? 'Só o admin da empresa pode convidar.' : 'Não deu para convidar agora.');
}

export async function cancelarConvite(email) {
  const r = await (await supa()).from('convites').delete().match({ empresa_id: empresaId, email }).select();
  falhou('Não deu para cancelar o convite.')(r);
  if (!r.data.length) throw new Error('Só o admin da empresa pode cancelar convites.');
}

// Dono muda o papel de quem já está na empresa ('dono' ou 'membro'). O banco não deixa a empresa sem dono.
export async function mudarPapel(usuarioId, papel) {
  const { error } = await (await supa()).rpc('mudar_papel', { empresa: empresaId, usuario: usuarioId, novo_papel: papel });
  if (error) {
    throw new Error(/pelo menos um dono/.test(error.message) ? 'A empresa precisa ter pelo menos um admin.'
      : /só o dono/.test(error.message) ? 'Só o admin pode mudar papéis.'
        : /não está na empresa/.test(error.message) ? 'Essa pessoa não está mais na empresa.'
          : 'Não deu para mudar o papel agora.');
  }
  if (usuarioId === pessoa?.id) {
    const e = empresas.find((x) => x.id === empresaId);
    if (e) e.papel = papel; // quem se rebaixou deixa de ver os botões de dono
  }
}

export async function removerMembro(usuarioId) {
  const r = await (await supa()).from('membros').delete().match({ empresa_id: empresaId, usuario_id: usuarioId }).select();
  falhou('Não deu para remover agora.')(r);
  if (!r.data.length) throw new Error('Só o admin pode remover pessoas (e não a si mesmo).');
}

// ---------- histórico ----------

export async function historico({ quem } = {}) {
  // '*': funciona antes e depois de a coluna mudancas existir (correcao-08)
  let q = (await supa()).from('historico').select('*').eq('empresa_id', empresaId).order('quando', { ascending: false }).limit(200);
  if (quem) q = q.eq('quem', quem);
  const r = await q;
  falhou('Não deu para ler o histórico.')(r);
  return r.data;
}

export async function anotarImportacao(detalhe) {
  await esperarEnvio(); // depois que os dados chegaram
  falhou('Não deu para anotar a importação no histórico.')(await (await supa()).rpc('anotar_importacao', { empresa: empresaId, detalhe }));
}

// ---------- copiar produtos de outra empresa ----------

export async function previaCopia(origemId) {
  const r = await (await supa()).rpc('previa_copia', { origem: origemId, destino: empresaId });
  falhou('Não deu para ver os produtos da outra empresa.')(r);
  const pega = (s) => r.data.filter((x) => x.situacao === s).map(({ nome, sku }) => ({ nome, sku }));
  return { itens: r.data, novos: pega('novo'), atualizados: pega('atualizado'), repetidos: pega('repetido') };
}

export async function copiarProdutos(origemId, ids = null) {
  await esperarEnvio();
  const r = await (await supa()).rpc('copiar_produtos', { origem: origemId, destino: empresaId, ids });
  falhou('Não deu para copiar. Você precisa estar nas duas empresas.')(r);
  return r.data;
}

// ---------- linhas das tabelas <-> dados das telas (sem rede; testado em tests/nuvem.test.js) ----------

const num = (v) => Number(v) || 0;
const CANAL_EMPRESA = 'empresa'; // linha de config_canais com o imposto da empresa

export function paraLinhas(d, empresa) {
  const produtos = d.produtos.map((p) => ({
    id: p.id,
    empresa_id: empresa,
    nome: p.nome,
    sku: p.sku || null,
    tipo_custo: p.tipoCusto,
    custo: { revenda: p.revenda, fabricacao: p.fabricacao },
    peso_g: num(p.pesoG),
    comprimento_cm: num(p.comprimento),
    largura_cm: num(p.largura),
    altura_cm: num(p.altura),
    fotos: p.fotos ?? [],
    atualizado_em: p.atualizadoEm ?? new Date().toISOString(),
  }));
  const itens_kit = d.produtos.flatMap((p) =>
    p.tipoCusto === 'kit'
      ? (p.kit ?? []).filter((i) => i.produtoId && i.quantidade > 0).map((i) => ({ empresa_id: empresa, kit_id: p.id, produto_id: i.produtoId, quantidade: num(i.quantidade) }))
      : [],
  );
  const precificacoes = Object.entries(d.precificacoes ?? {}).flatMap(([produtoId, porCanal]) =>
    Object.entries(porCanal)
      .filter(([, s]) => s.de > 0)
      .map(([canal, s]) => ({ empresa_id: empresa, produto_id: produtoId, canal, preco_de: num(s.de), desconto: num(s.desconto), salvo_em: s.salvoEm ?? new Date().toISOString() })),
  );
  const config_canais = Object.entries(d.canais ?? {}).map(([canal, config]) => ({ empresa_id: empresa, canal, config }));
  if (d.empresa) config_canais.push({ empresa_id: empresa, canal: CANAL_EMPRESA, config: d.empresa });
  return { produtos, itens_kit, precificacoes, config_canais };
}

export function deLinhas(t) {
  const vazio = produtoVazio();
  const produtos = t.produtos.map((r) => ({
    ...vazio,
    id: r.id,
    nome: r.nome,
    sku: r.sku ?? '',
    tipoCusto: r.tipo_custo,
    revenda: { ...vazio.revenda, ...r.custo?.revenda },
    fabricacao: { ...vazio.fabricacao, ...r.custo?.fabricacao },
    kit: t.itens_kit.filter((i) => i.kit_id === r.id).map((i) => ({ produtoId: i.produto_id, quantidade: num(i.quantidade) })),
    pesoG: num(r.peso_g),
    comprimento: num(r.comprimento_cm),
    largura: num(r.largura_cm),
    altura: num(r.altura_cm),
    fotos: r.fotos ?? [],
    atualizadoEm: r.atualizado_em,
  }));
  const precificacoes = {};
  for (const r of t.precificacoes) (precificacoes[r.produto_id] ??= {})[r.canal] = { de: num(r.preco_de), desconto: num(r.desconto), salvoEm: r.salvo_em };
  const linhasCanais = t.config_canais.filter((r) => r.canal !== CANAL_EMPRESA);
  const canais = linhasCanais.length ? Object.fromEntries(linhasCanais.map((r) => [r.canal, r.config])) : null;
  const empresa = t.config_canais.find((r) => r.canal === CANAL_EMPRESA)?.config ?? null;
  return { produtos, precificacoes, canais, empresa };
}

// Chave de cada linha, para saber o que mudou ou saiu.
export const CHAVES = {
  produtos: (r) => r.id,
  itens_kit: (r) => `${r.kit_id}|${r.produto_id}`,
  precificacoes: (r) => `${r.produto_id}|${r.canal}`,
  config_canais: (r) => r.canal,
};

// O que mandar e o que apagar, comparando com o que já está na nuvem.
export function diferenca(enviadas, linhas) {
  const r = {};
  for (const [tabela, chave] of Object.entries(CHAVES)) {
    const antes = enviadas[tabela] ?? new Map();
    const agora = new Map(linhas[tabela].map((l) => [chave(l), l]));
    r[tabela] = {
      mandar: [...agora].filter(([k, l]) => antes.get(k) !== JSON.stringify(l)).map(([, l]) => l),
      apagar: [...antes.keys()].filter((k) => !agora.has(k)),
    };
  }
  return r;
}

// ---------- o guardado ----------

let enviadas = null; // tabela -> Map(chave -> JSON da linha que está na nuvem)
let fila = Promise.resolve();
let aoFalhar = () => {};
export const quandoFalhar = (fn) => (aoFalhar = fn);
export const esperarEnvio = () => fila;
export const pendentesDeEnvio = (d, empresa = empresaId) => diferenca(enviadas, paraLinhas(d, empresa)); // para os testes e para conferir

const lembrar = (linhas) => {
  enviadas = Object.fromEntries(Object.entries(CHAVES).map(([t, chave]) => [t, new Map(linhas[t].map((l) => [chave(l), JSON.stringify(l)]))]));
};

// Depois de ler, guarda a versão que o próprio app gera desses dados (e não a linha crua do banco): o Postgres reordena as
// chaves do jsonb (custo), e a comparação crua acharia "mudou" em tudo, reenviando todos os produtos no 1º salvar e
// enchendo o histórico de "Produto alterado".
export function lembrarDoBanco(t, empresa = empresaId) {
  const d = deLinhas(t);
  lembrar(paraLinhas(d, empresa));
  return d;
}

async function ler() {
  const s = await supa();
  // ponytail: lê até 1000 linhas por tabela (limite padrão do Supabase); paginar quando passar disso
  const tabelas = Object.keys(CHAVES);
  const respostas = await Promise.all(tabelas.map((t) => s.from(t).select('*').eq('empresa_id', empresaId)));
  if (respostas.some((r) => r.error)) throw new Error('Não deu para ler os dados da nuvem. Confira a internet e recarregue a página.');
  const t = Object.fromEntries(tabelas.map((nome, i) => [nome, respostas[i].data]));
  return lembrarDoBanco(t);
}

// ---------- fotos no Storage ----------
// Foto nova (data URL) sobe para fotos/<empresa>/<produto>/<hash>.<ext> e o produto guarda só o endereço público.
// O nome é o próprio conteúdo (hash): o endereço nunca muda, então o navegador guarda em cache por 1 ano.
// Só troca depois de subir: se falhar, a foto fica como estava e o próximo envio tenta de novo.
const ehDataUrl = (f) => typeof f === 'string' && f.startsWith('data:');
let aoAvancarFotos = null;
let adiarFotos = false;

// Importação: grava produtos e preços primeiro, com as fotos como vieram; quem chama sobe as fotos depois (migrarFotos).
// Assim nada se perde se a aba fechar ou uma foto falhar no meio.
export async function gravarImportacao(gravar) {
  adiarFotos = true;
  try {
    if (!gravar()) return false;
    await esperarEnvio();
  } finally {
    adiarFotos = false;
  }
  return true;
}

async function subirFoto(s, produtoId, dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  const caminho = `${empresaId}/${produtoId}/${hash}.${(blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg')}`;
  const { error } = await s.storage.from('fotos').upload(caminho, blob, { upsert: true, contentType: blob.type, cacheControl: '31536000' });
  if (error) throw new Error(`foto não subiu (${error.message})`);
  const url = s.storage.from('fotos').getPublicUrl(caminho).data.publicUrl;
  // Só troca se o endereço abre de verdade (bucket público: correcao-04). Senão a foto ficaria quebrada.
  const teste = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!teste?.ok) throw new Error('foto subiu, mas o endereço público não abre (rode supabase/correcao-04-fotos.sql)');
  return url;
}

export async function fotosParaStorage(s, linhasProdutos) {
  const comFoto = linhasProdutos.filter((l) => l.fotos.some(ehDataUrl));
  for (const [i, l] of comFoto.entries()) {
    l.fotos = await Promise.all(l.fotos.map((f) => (ehDataUrl(f) ? subirFoto(s, l.id, f) : f)));
    const p = dados.produtos.find((x) => x.id === l.id);
    if (p) p.fotos = [...l.fotos]; // a tela e o próximo envio já usam o endereço
    aoAvancarFotos?.(i + 1, comFoto.length);
  }
}

// Leva para o Storage as fotos que ainda estão dentro do banco. Devolve quantos produtos ficaram com foto pendente.
export async function migrarFotos(aoAvancar) {
  const ids = dados.produtos.filter((p) => (p.fotos ?? []).some(ehDataUrl)).map((p) => p.id);
  if (!ids.length || !enviadas) return 0;
  ids.forEach((id) => enviadas.produtos.delete(id)); // força reenviar estes produtos (o upsert troca a linha)
  aoAvancarFotos = aoAvancar;
  guardadoNaNuvem.gravar(dados);
  await esperarEnvio();
  aoAvancarFotos = null;
  return dados.produtos.filter((p) => (p.fotos ?? []).some(ehDataUrl)).length;
}

const em = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

async function enviar(linhas) {
  const s = await supa();
  const d = diferenca(enviadas, linhas);
  const fotosAntes = new Set([...enviadas.produtos.values()].flatMap((j) => JSON.parse(j).fotos ?? []));
  const conferir = ({ error }) => {
    if (error) throw new Error(error.message);
  };
  const mandar = async (tabela) => {
    for (const lote of em(d[tabela].mandar, 20)) {
      conferir(await s.from(tabela).upsert(lote));
      lote.forEach((l) => enviadas[tabela].set(CHAVES[tabela](l), JSON.stringify(l)));
    }
  };
  const apagar = async (tabela, campos) => {
    for (const k of d[tabela].apagar) {
      const valores = k.split('|');
      conferir(await s.from(tabela).delete().match({ empresa_id: empresaId, ...Object.fromEntries(campos.map((c, i) => [c, valores[i]])) }));
      enviadas[tabela].delete(k);
    }
  };
  if (!adiarFotos) await fotosParaStorage(s, d.produtos.mandar);
  // Ordem: produto antes do que aponta para ele; ao apagar, o contrário.
  await mandar('produtos');
  await mandar('itens_kit');
  await mandar('precificacoes');
  await mandar('config_canais');
  await apagar('itens_kit', ['kit_id', 'produto_id']);
  await apagar('precificacoes', ['produto_id', 'canal']);
  await apagar('produtos', ['id']);
  await apagar('config_canais', ['canal']);
  // Fotos que saíram (produto excluído, foto trocada ou tirada): apaga o arquivo se ninguém mais usa. Falha aqui só é ignorada.
  const fotosAgora = new Set(linhas.produtos.flatMap((l) => l.fotos));
  await apagarFotosOrfas(s, [...fotosAntes].filter((f) => !fotosAgora.has(f)), empresaId);
}

// Caminho dentro do bucket "fotos" de um endereço público do Storage (ou null, se a foto não é de lá).
export const caminhoDaFoto = (url) => (String(url).match(/\/storage\/v1\/object\/public\/fotos\/([^?#]+)/)?.[1] ?? null);

// Apaga do Storage as fotos da pasta da empresa que nenhum produto (de nenhuma empresa) usa mais. Um "Clonar" copia o
// endereço, então a mesma foto pode estar em produto de outra empresa: o banco confere em todas (foto_em_uso).
// Nunca lança erro: no pior caso, fica um arquivo sobrando.
export async function apagarFotosOrfas(s, urls, empresa) {
  try {
    const caminhos = [];
    for (const url of new Set(urls)) {
      const caminho = caminhoDaFoto(url);
      if (!caminho || !caminho.startsWith(`${empresa}/`)) continue;
      const { data: emUso, error } = await s.rpc('foto_em_uso', { url }); // confere em todas as empresas (correcao-07)
      if (!error && emUso === false) caminhos.push(caminho); // na dúvida (erro), não apaga
    }
    if (caminhos.length) await s.storage.from('fotos').remove(caminhos);
    return caminhos;
  } catch (erro) {
    console.warn('fotos órfãs ficaram no Storage', erro);
    return [];
  }
}

export const guardadoNaNuvem = {
  ler,
  // Chamado por salvar(): agenda o envio e volta na hora; erro de rede chega por quandoFalhar().
  gravar(d) {
    if (!enviadas || !empresaId) throw new Error('nuvem não carregada');
    const linhas = paraLinhas(structuredClone(d), empresaId);
    fila = fila.then(() => enviar(linhas)).catch((e) => aoFalhar(e));
  },
};
