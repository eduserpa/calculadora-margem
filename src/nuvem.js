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
//   excluirEmpresa()            -> exclui a empresa em uso com tudo dela (só o dono) e passa para outra (recarrega)
//   concorrentes()              -> [{ id, produtoId, canal, vendedor, preco, link, criadoEm, criadoPor }] da empresa em uso
//   adicionarConcorrente({ produtoId, canal, vendedor, preco, link }) -> a linha nova; removerConcorrente(id)
//   buscarConcorrentesNoML({ produtoId, termo }) -> busca no ML pelo Apify e guarda: { termo, resultados, buscadoEm }
//   ultimaBusca(produtoId)      -> a última busca guardada do produto ({ termo, resultados, excluidos, buscadoEm }), ou null
//   buscasGuardadas()           -> as buscas guardadas da empresa; salvarExcluidos(produtoId, chaves) -> fora do cálculo
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
import { candidatosDoApify } from './concorrentes.js';

const BIBLIOTECA = '../vendor/supabase-js-2.115.0.js'; // 1 arquivo servido pelo próprio site (como atualizar: no topo dele)
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

// Lê tudo em blocos de 1000 (o máximo que o Supabase devolve por pedido) até acabar. consulta() monta o pedido de novo a
// cada bloco e precisa de ordem fixa (chave única), senão uma linha pode repetir ou faltar entre os blocos.
export const BLOCO = 1000;
export async function tudo(consulta) {
  const linhas = [];
  for (let de = 0; ; de += BLOCO) {
    const r = await consulta().range(de, de + BLOCO - 1);
    if (r.error) return r;
    linhas.push(...r.data);
    if (r.data.length < BLOCO) return { data: linhas, error: null };
  }
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

// Manda o link de acesso por e-mail (precisa de SMTP; ver config.ESQUECI_SENHA). Só para quem JÁ tem conta: conta nova só nasce pelo
// link do convite. A resposta é a mesma com e sem conta (a tela também), para não contar quem tem conta. (auth só nos testes)
export async function mandarLink(email, auth) {
  auth ??= (await supa()).auth;
  const { error } = await auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: VOLTA() } });
  if (!error || /signups? not allowed|not found|user not found|não foi convidado|hook/i.test(error.message)) return;
  throw new Error(/rate|seconds|security purposes/i.test(error.message) ? 'Espere 1 minuto para pedir outro e-mail.' : 'Não deu para mandar o link agora. Confira o e-mail e tente de novo.');
}

// Para onde os links de e-mail voltam (confirmação, senha nova, link de acesso): a página inicial deste site. Precisa estar nas
// Redirect URLs do Supabase. (globalThis: nos testes, em Node, não há location)
const VOLTA = () => `${globalThis.location?.origin ?? ''}/`;

// Entrar com e-mail e senha. No 1º acesso a pessoa ainda não tem conta, então o login falha e tentamos criar a conta com o
// mesmo e-mail e senha: o hook do banco só deixa quem tem convite. Se a conta já existe, é senha errada; a mensagem é a
// mesma do login, para não contar quem tem conta. (auth só nos testes.)
// Com "Confirm email" ligado no Supabase, a conta nasce sem sessão e o Supabase manda o link: devolve { confirmar: email }
// (a tela diz "Enviamos um link"); quem volta antes de confirmar recebe { confirmar, jaPode } (pode pedir outro na hora).
// Sem a confirmação ligada, entra direto (devolve null).
export async function entrarComSenha(email, senha, auth) {
  if (String(senha).length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  auth ??= (await supa()).auth;
  const dados = { email: email.trim().toLowerCase(), password: senha };
  let { data, error } = await auth.signInWithPassword(dados);
  if (/email not confirmed/i.test(error?.message ?? '')) return { confirmar: dados.email, jaPode: true };
  if (/invalid login|invalid credentials/i.test(error?.message ?? '')) ({ data, error } = await auth.signUp({ ...dados, options: { emailRedirectTo: VOLTA() } }));
  if (!error && data.session) return null;
  // conta que já existe: com a confirmação ligada, o Supabase não dá erro (para não contar quem tem conta) e devolve um usuário
  // sem identidades. É senha errada, com a mesma frase do login.
  if (!error && data.user && !data.user.identities?.length) throw new Error('E-mail ou senha incorretos.');
  if (!error && data.user) return { confirmar: dados.email };
  const m = error?.message ?? '';
  // cadastro aberto desligado (conta nova só pelo link do convite): e-mail sem conta tem a mesma frase da senha errada
  throw new Error(/signups? not allowed|signup is disabled/i.test(m) ? 'E-mail ou senha incorretos.'
    : /não foi convidado|hook/i.test(m) ? 'Este e-mail não tem acesso. Peça um convite ao admin.'
    : /already registered|already exists|invalid login|invalid credentials/i.test(m) ? 'E-mail ou senha incorretos.'
      : /password/i.test(m) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
          : /rate|seconds/i.test(m) ? 'Muitas tentativas. Espere 1 minuto e tente de novo.'
              : 'Não deu para entrar agora. Confira a internet e tente de novo.');
}

// "Reenviar" da tela de confirmação: manda de novo o link de confirmar o cadastro. (auth só nos testes.)
export async function reenviarConfirmacao(email, auth) {
  auth ??= (await supa()).auth;
  const { error } = await auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: VOLTA() } });
  if (error) throw new Error(/rate|seconds|security purposes/i.test(error.message) ? 'Espere 1 minuto para pedir outro e-mail.' : 'Não deu para reenviar agora. Tente de novo em instantes.');
}

// Esqueci a senha: manda o link para criar uma nova (precisa de SMTP próprio no Supabase; ver config.ESQUECI_SENHA). O Supabase
// responde igual para e-mail com e sem conta; a tela também não conta. (auth só nos testes.)
export async function esqueciSenha(email, auth) {
  auth ??= (await supa()).auth;
  const { error } = await auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: VOLTA() });
  if (error) throw new Error(/rate|seconds|security purposes/i.test(error.message) ? 'Espere 1 minuto para pedir outro e-mail.' : 'Não deu para mandar o link agora. Confira o e-mail e tente de novo.');
}

// Quem voltou pelo link de "Esqueci a senha" (ou do de confirmar o cadastro) já está logado e escolhe a senha.
// mesmaVale: na confirmação do cadastro a pessoa costuma repetir a senha que acabou de escolher; ali isso não é erro.
export async function trocarSenha(senha, { mesmaVale = false } = {}, auth) {
  if (String(senha).length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  auth ??= (await supa()).auth;
  const { error } = await auth.updateUser({ password: senha });
  if (!error || (mesmaVale && /different|same/i.test(error.message))) {
    // senha definida por quem tem o e-mail: derruba as outras sessões (a de quem tenha criado a conta com a senha dele, por exemplo)
    await auth.signOut({ scope: 'others' }).catch(() => {});
    return;
  }
  throw new Error(/different|same/i.test(error.message) ? 'Use uma senha diferente da antiga.' : /weak|password/i.test(error.message) ? 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.' : 'Não deu para salvar a senha. Peça outro link e tente de novo.');
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

// Nomes das empresas SUSPENSAS em que a própria pessoa é membro (correção 17), para dizer por que ela ficou sem empresa.
// Banco sem a função (ou sem internet): lista vazia, e vale o "sem empresa" de sempre.
export async function empresasSuspensas() {
  const { data, error } = await (await supa()).rpc('minhas_empresas_suspensas');
  return error ? [] : (data ?? []).map(String);
}

export async function minhasEmpresas() {
  const r = await (await supa()).from('membros').select('papel, empresa_id, empresas(*)').eq('usuario_id', pessoa.id);
  falhou('Não deu para ler suas empresas.')(r);
  return r.data.map((m) => ({ id: m.empresa_id, nome: m.empresas?.nome ?? '', papel: m.papel, foto: m.empresas?.foto ?? null, codigo: m.empresas?.codigo ?? '' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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

// Exclui a empresa em uso (só o admin). As fotos da pasta fotos/<empresa>/ saem ANTES (depois a pessoa já não é da empresa
// e a regra do Storage não deixa mais apagar), menos as que produto de outra empresa usa (o Clonar copia o endereço).
// Se a exclusão falhar depois das fotos, a empresa fica sem elas: quem pediu queria apagar tudo; é só tentar de novo.
export async function excluirEmpresa() {
  if (!souDono()) throw new Error('Só o admin pode excluir a empresa.');
  const s = await supa();
  const id = empresaId;
  try {
    const pasta = s.storage.from('fotos');
    const listar = async (prefixo) => {
      const itens = [];
      for (let de = 0; ; de += BLOCO) {
        const { data, error } = await pasta.list(prefixo, { limit: BLOCO, offset: de, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        itens.push(...data);
        if (data.length < BLOCO) return itens;
      }
    };
    const { data: fora, error } = await tudo(() => s.rpc('fotos_usadas_fora', { empresa: id }));
    if (error) throw error;
    const caminhos = [];
    for (const item of await listar(id)) {
      // pasta (id null): um nível abaixo, fotos/<empresa>/<produto ou empresa>/<hash>
      if (item.id) caminhos.push(`${id}/${item.name}`);
      else for (const f of await listar(`${id}/${item.name}`)) caminhos.push(`${id}/${item.name}/${f.name}`);
    }
    for (const lote of em(caminhos.filter((c) => !fora.includes(c)), 100)) await pasta.remove(lote);
  } catch (erro) {
    console.warn('fotos da empresa excluída ficaram no Storage', erro);
  }
  falhou('Não deu para excluir a empresa agora. Confira a internet e tente de novo.')(await s.rpc('excluir_empresa', { empresa: id }));
  const outra = empresas.find((e) => e.id !== id);
  if (outra) return trocarEmpresa(outra.id);
  try {
    localStorage.removeItem(CHAVE_EMPRESA);
  } catch {
    // sem armazenamento: nada guardado
  }
  location.reload(); // sem empresa: o login oferece criar uma
}

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
  const limpo = emailLimpo(email);
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

// ---------- convite e senha nova por LINK SECRETO (sem e-mail; Eduardo 17/11) ----------
// A Edge Function gerar-link confere no banco quem pode (admin da plataforma, ou admin da própria empresa), grava o convite e
// devolve o link (vale 24 h e uma vez; gerar outro cancela o anterior). pedido: { tipo: 'convite', empresa, email, papel } ou
// { tipo: 'senha', empresa, usuario }. O link é deste site (<origem>/#link=<token>&tipo=…), não o do Supabase: a prévia do WhatsApp
// abre o link e gastaria a única vez; quem gasta é o app, ao abrir (entrarPeloLink). null = a pessoa já tem conta com senha (o convite
// ficou salvo e ela entra com o e-mail e a senha dela). Sem a função publicada no Supabase, o erro vem com semFuncao. (functions só nos testes)
export async function gerarLink(pedido, functions) {
  functions ??= (await supa()).functions;
  const corpo = { ...pedido };
  if (corpo.tipo === 'convite') corpo.email = emailLimpo(corpo.email);
  const { data, error } = await functions.invoke('gerar-link', { body: corpo });
  if (error) {
    const status = error.context?.status; // sem status: não chegou na função (internet)
    const resposta = await error.context?.json?.().catch(() => null); // a função explica em { erro }
    const x = new Error(resposta?.erro ?? (status === 404 ? 'O convite por link ainda não foi ligado no Supabase.'
      : status ? `Não deu para gerar o link agora (erro ${status}). Tente de novo; se continuar, avise o suporte.`
        : 'Não deu para gerar o link agora. Confira a internet e tente de novo.'));
    x.semFuncao = status === 404; // só a função que não existe vira o convite de antes; 401, 5xx e rede aparecem na janela
    throw x;
  }
  if (!data) throw new Error('Não deu para gerar o link agora. Tente de novo.');
  return data.link ?? null;
}

// Volta do link secreto (#link=<token>&tipo=<invite|magiclink|recovery>): troca o token por uma sessão. Vencido, já usado ou mexido: erro.
export async function entrarPeloLink(token, tipo, auth) {
  if (!['invite', 'magiclink', 'recovery'].includes(tipo) || !token) throw new Error('link inválido');
  auth ??= (await supa()).auth;
  const { error } = await auth.verifyOtp({ token_hash: token, type: tipo });
  if (!error) return;
  // sem internet ou servidor fora: o link continua valendo (a pessoa abre de novo); só 4xx é link vencido, usado ou mexido
  const x = new Error('link vencido');
  x.rede = !error.status || error.status >= 500 || /fetch|network|retryable/i.test(`${error.name} ${error.message}`);
  throw x;
}

// ---------- plataforma (donos da plataforma; correção 17) ----------
// Quem decide é o banco: toda função plataforma_* começa com sou_admin_plataforma() (lista + login com código, aal2).
// Aqui só se chama e se traduz o erro. meu_acesso_plataforma() é a única que não lança: 'nao' | 'precisa_mfa' | 'sim'.

export async function acessoPlataforma() {
  const { data, error } = await (await supa()).rpc('meu_acesso_plataforma');
  if (!error) return data;
  // banco sem a correção 17 (função não existe): como 'nao'; sem internet ou falha: 'erro' (a tela oferece "Tentar de novo")
  return /PGRST202|42883/.test(error.code ?? '') || /could not find the function/i.test(error.message ?? '') ? 'nao' : 'erro';
}

// 2 etapas (TOTP do Supabase): com fator já confirmado, só o id (o código vai no desafio); sem, cadastra um novo e devolve o QR.
// anterior = o que esta função devolveu antes, nesta página: se ainda está pendente, volta o mesmo QR (o que a pessoa já leu continua valendo).
export async function fatorDoAutenticador(anterior = null) {
  const s = await supa();
  const { data, error } = await s.auth.mfa.listFactors();
  if (error) throw new Error('Não deu para falar com o login. Recarregue a página.');
  const pronto = (data.totp ?? []).find((f) => f.status === 'verified');
  if (pronto) return { id: pronto.id };
  if (anterior?.qr && (data.all ?? []).some((f) => f.id === anterior.id && f.status !== 'verified')) return anterior;
  // sobra de um cadastro que não terminou (QR lido e código nunca digitado): sai, senão o nome repetido barra o novo
  for (const f of (data.all ?? []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) await s.auth.mfa.unenroll({ factorId: f.id });
  const r = await s.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Calculéo' });
  if (r.error) throw new Error('Não deu para gerar o QR agora. Tente de novo em instantes.');
  // a biblioteca devolve 'data:image/svg+xml;utf-8,<svg …>' cru: um '#' (cor) cortaria a imagem; vai codificado
  const svg = String(r.data.totp.qr_code).replace(/^data:image\/svg\+xml;[^,]*,/, '');
  return { id: r.data.id, qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, chave: r.data.totp.secret };
}

export async function confirmarCodigo(fatorId, codigo) {
  const c = String(codigo).replace(/\D/g, '');
  if (c.length !== 6) throw new Error('Digite os 6 números do código.');
  const { error } = await (await supa()).auth.mfa.challengeAndVerify({ factorId: fatorId, code: c });
  if (error) throw new Error(/invalid|expired|code/i.test(error.message) ? 'Código errado ou vencido. Digite o código que está aparecendo agora no app.' : 'Não deu para confirmar agora. Tente de novo.');
}

// textos exatos das exceções do banco (correcao-17, Ellie) -> frase da tela
const ERROS_PLATAFORMA = [
  [/sem permissão/, 'Sem permissão. Abra a Plataforma de novo e confirme o código do autenticador.'],
  [/e-mail inválido/, 'Digite um e-mail válido, por exemplo nome@empresa.com.br.'],
  [/dê um nome/, 'Dê um nome à empresa.'],
  [/papel inválido/, 'Escolha Membro ou Admin.'],
  [/não pode ser negativo/, 'O limite de buscas não pode ser negativo.'],
  [/empresa não encontrada/, 'Essa empresa não existe mais. Recarregue a lista.'],
  [/já está na empresa/, 'Essa pessoa já está na empresa.'],
  [/convite não encontrado/, 'Esse convite já não existe. Recarregue a lista.'],
  [/não está na empresa/, 'Essa pessoa não está mais na empresa.'],
  [/pelo menos um dono/, 'A empresa precisa ter pelo menos um admin.'],
  [/suspenda a empresa/, 'Suspenda a empresa antes de excluir.'],
  [/código não confere/, 'O código não confere. Digite o código da empresa, como aparece ao lado do nome.'],
];
async function plataforma(funcao, args, padrao) {
  const { data, error } = await (await supa()).rpc(funcao, args);
  if (error) throw new Error(ERROS_PLATAFORMA.find(([re]) => re.test(error.message))?.[1] ?? padrao);
  return data;
}
// e-mail de convite: sem espaço, minúsculo, com cara de e-mail (equipe e plataforma)
function emailLimpo(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Digite um e-mail válido, por exemplo nome@empresa.com.br.');
  return e;
}

export const plataformaEmpresas = async () => (await plataforma('plataforma_empresas', {}, 'Não deu para ler as empresas.')).map((r) => ({
  id: r.id, nome: r.nome, codigo: r.codigo ?? '', criadaEm: r.criado_em, suspensa: r.suspensa, limite: r.limite_buscas_mes, buscasMes: r.buscas_mes ?? 0,
  pessoas: r.pessoas ?? 0, convites: r.convites ?? 0, produtos: r.produtos ?? 0, ultimoAcesso: r.ultimo_acesso,
}));
export const plataformaPessoas = async (empresa) => (await plataforma('plataforma_pessoas', { empresa }, 'Não deu para ler as pessoas desta empresa.')).map((r) => ({
  tipo: r.tipo, usuarioId: r.usuario_id, email: r.email, papel: r.papel, desde: r.desde, ultimoAcesso: r.ultimo_acesso,
}));
export const plataformaCriarEmpresa = async ({ nome, email, limite }) =>
  plataforma('plataforma_criar_empresa', { nome: String(nome ?? '').trim(), email_dono: emailLimpo(email), limite_buscas: limite }, 'Não deu para criar a empresa agora.');
export const plataformaConvidar = async (empresa, email, papel = 'membro') => plataforma('plataforma_convidar', { empresa, email: emailLimpo(email), papel }, 'Não deu para convidar agora.');
export const plataformaCancelarConvite = (empresa, email) => plataforma('plataforma_cancelar_convite', { empresa, email }, 'Não deu para cancelar o convite.');
export const plataformaRemoverPessoa = (empresa, usuario) => plataforma('plataforma_remover_pessoa', { empresa, usuario }, 'Não deu para remover agora.');
export const plataformaSuspender = (empresa, suspender) => plataforma('plataforma_suspender', { empresa, suspender }, suspender ? 'Não deu para suspender agora.' : 'Não deu para reativar agora.');
export const plataformaLimiteBuscas = (empresa, limite) => plataforma('plataforma_limite_buscas', { empresa, limite }, 'Não deu para mudar o limite agora.');
// Exclui uma empresa SUSPENSA (correção 18), sem volta: o banco confere o código, apaga tudo dela e devolve as fotos que só ela
// usava, que saem do Storage aqui (o admin da plataforma só pode apagar foto órfã). Falhar a limpeza das fotos não desfaz a exclusão.
export async function plataformaExcluirEmpresa(empresa, codigo) {
  const fotos = (await plataforma('plataforma_excluir_empresa', { empresa, confirmacao: String(codigo ?? '').trim().toUpperCase() }, 'Não deu para excluir a empresa agora.')) ?? [];
  // a empresa JÁ saiu (não chamar de novo): foto que não sair fica no armazenamento, e a tela avisa
  const pasta = (await supa()).storage.from('fotos');
  let ficaram = 0;
  for (const lote of em(fotos, 100)) {
    const r = await pasta.remove(lote).catch((error) => ({ error }));
    if (r?.error) ficaram += lote.length;
  }
  return { fotos: fotos.length, ficaram };
}
export const plataformaRegistro = (qtd = 100) => plataforma('plataforma_auditoria', { qtd }, 'Não deu para ler o registro.');

// ---------- concorrentes (anotados à mão; correção 12) ----------

const doBanco = (r) => ({ id: r.id, produtoId: r.produto_id, canal: r.canal, vendedor: r.vendedor, preco: Number(r.preco), link: r.link, criadoEm: r.criado_em, criadoPor: r.criado_por });

export async function concorrentes() {
  const s = await supa();
  const r = await tudo(() => s.from('concorrentes').select('*').eq('empresa_id', empresaId).order('preco').order('id'));
  falhou('Não deu para ler os concorrentes.')(r);
  return r.data.map(doBanco);
}

export async function adicionarConcorrente({ produtoId, canal, vendedor, preco, link }) {
  vendedor = String(vendedor ?? '').trim();
  link = String(link ?? '').trim() || null;
  if (!vendedor) throw new Error('Escreva o nome do vendedor.');
  if (!(preco > 0)) throw new Error('Digite o preço do concorrente.');
  if (link && !/^https?:\/\//i.test(link)) throw new Error('O link precisa ser o endereço do anúncio, começando com https://');
  const r = await (await supa()).from('concorrentes')
    .insert({ empresa_id: empresaId, produto_id: produtoId, canal, vendedor, preco, link }).select().single();
  falhou('Não deu para guardar o concorrente agora.')(r);
  return doBanco(r.data);
}

export async function removerConcorrente(id) {
  falhou('Não deu para excluir o concorrente agora.')(await (await supa()).from('concorrentes').delete().eq('id', id));
}

// Busca de concorrentes no ML pelo Apify (quem lê o ML são os servidores do Apify; o token nunca vem para o navegador), pela Edge
// Function buscar-concorrentes (APIFY_TOKEN nos Secrets; confere login, empresa e o limite de buscas, e registra a busca). Também no
// servidor local (127.0.0.1:8090): o teste passa pela mesma trava de produção (Maestro 17/11; o atalho direto no Apify pulava o limite).
// Devolve { itens } do Apify; candidatosDoApify tira os nossos e monta os candidatos. A busca fica guardada por produto (correção 13),
// substituindo a anterior.
// -> { termo, resultados: [{ produtoCatalogo, itemId, titulo, foto, vendedor, preco, full, freteGratis, link, vendidos }], buscadoEm, naoGuardou? }
// Cota de buscas do mês da empresa em uso (correção 19): { limite, usadas }; limite null = sem limite. Sem a função no banco: null.
export async function cotaBuscas() {
  const { data, error } = await (await supa()).rpc('minha_cota_buscas', { empresa: empresaId });
  if (error || !data?.length) return null;
  return { limite: data[0].limite ?? null, usadas: data[0].usadas_mes ?? 0 };
}

export async function buscarConcorrentesNoML({ produtoId, termo }) {
  let itens;
  const { data, error } = await (await supa()).functions.invoke('buscar-concorrentes', { body: { empresa: empresaId, produto: produtoId, termo } });
  if (error) {
    const corpo = await error.context?.json?.().catch(() => null); // a função explica o erro em { erro }
    throw new Error(corpo?.erro ?? 'A busca de concorrentes ainda não está disponível. Use "Adicionar à mão" por enquanto.');
  }
  itens = data.itens;
  const busca = { termo, resultados: candidatosDoApify(itens), buscadoEm: new Date().toISOString() };
  // sem "excluidos" no envio: os anúncios que a pessoa tirou do cálculo continuam fora depois do Atualizar
  const r = await (await supa()).from('buscas_concorrentes').upsert({
    empresa_id: empresaId, produto_id: produtoId, termo, resultados: busca.resultados, buscado_em: busca.buscadoEm,
  }).select('excluidos').single();
  // a busca já foi paga: mostra mesmo sem guardar (ex.: correção 13 ainda não rodada)
  return r.error ? { ...busca, excluidos: [], naoGuardou: true } : { ...busca, excluidos: r.data.excluidos ?? [] };
}

const daBusca = (r) => ({ produtoId: r.produto_id, termo: r.termo, resultados: r.resultados ?? [], excluidos: r.excluidos ?? [], buscadoEm: r.buscado_em });

// A última busca guardada do produto (sem gastar crédito), ou null
export async function ultimaBusca(produtoId) {
  const r = await (await supa()).from('buscas_concorrentes').select('*')
    .eq('empresa_id', empresaId).eq('produto_id', produtoId).maybeSingle();
  return r.error || !r.data ? null : daBusca(r.data);
}

// Todas as buscas guardadas da empresa (a Início compara com elas); [] se ainda não houver a correção 13
export async function buscasGuardadas() {
  const s = await supa();
  const r = await tudo(() => s.from('buscas_concorrentes').select('*').eq('empresa_id', empresaId).order('produto_id'));
  return r.error ? [] : r.data.map(daBusca);
}

// Os anúncios da busca que a pessoa desmarcou (chaves de chaveDoCandidato): saem do cálculo, ficam na lista
export async function salvarExcluidos(produtoId, excluidos) {
  falhou('Não deu para guardar a escolha agora.')(await (await supa()).from('buscas_concorrentes')
    .update({ excluidos }).eq('empresa_id', empresaId).eq('produto_id', produtoId));
}

// ---------- histórico ----------

// Os mais recentes (a tela mostra até 200 e diz isso; a Início, 5).
export async function historico({ quem, limite = 200 } = {}) {
  // '*': funciona antes e depois de a coluna mudancas existir (correcao-08)
  let q = (await supa()).from('historico').select('*').eq('empresa_id', empresaId).order('quando', { ascending: false }).limit(limite);
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
  const s = await supa();
  const r = await tudo(() => s.rpc('previa_copia', { origem: origemId, destino: empresaId }).order('nome').order('id'));
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
    impostos_canal: p.impostosCanal ?? {}, // imposto só deste produto, por canal (correção 14)
    categoria_ml: p.categoriaMl || null, // categoria do ML só deste produto; null = a do canal (correção 20)
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
    impostosCanal: r.impostos_canal ?? {},
    categoriaMl: r.categoria_ml ?? null,
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

// Ordem fixa (a chave de cada tabela) para ler em blocos sem repetir nem pular linha.
const ORDEM = { produtos: ['id'], itens_kit: ['kit_id', 'produto_id'], precificacoes: ['produto_id', 'canal'], config_canais: ['canal'] };

async function ler(s) {
  s ??= await supa(); // (s só nos testes)
  const tabelas = Object.keys(CHAVES);
  const respostas = await Promise.all(tabelas.map((t) => tudo(() => ORDEM[t].reduce((q, c) => q.order(c), s.from(t).select('*').eq('empresa_id', empresaId)))));
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
