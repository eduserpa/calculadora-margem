// Mascote do Calculéo (o leão vendedor): sempre decorativo (alt vazio) e pequeno; o texto ao lado diz o que importa.
// A entrada leve (.mascote-entra) só anima sem reduced motion (estilo.css).
const TAMANHO = { calculando: [393, 420], copiar: [377, 420], equipe: [420, 390], historico: [371, 420], erro: [367, 420], salvo: [300, 282], sucesso: [387, 420], prejuizo: [385, 420] };

export const imgMascote = (pose, largura = 120, entra = true) => {
  const [w, h] = TAMANHO[pose];
  return `<img src="assets/mascote/${pose}.webp" alt="" width="${largura}" height="${Math.round((largura * h) / w)}" class="mascote-img${entra ? ' mascote-entra' : ''}" decoding="async">`;
};

// Estado vazio: o leão, uma frase e (opcional) o que fazer.
export const htmlVazio = (pose, frase, dica = '') => `
  <div class="estado-mascote">${imgMascote(pose)}<div><p class="estado-frase">${frase}</p>${dica ? `<p class="dica">${dica}</p>` : ''}</div></div>`;

// Carregando ou salvando na nuvem: o leão fazendo as contas.
export const htmlCarregando = (frase = 'Fazendo as contas…') => `
  <div class="estado-mascote" role="status">${imgMascote('calculando', 96)}<p class="estado-frase">${frase}</p></div>`;
