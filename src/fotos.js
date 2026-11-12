// Fotos do produto: reduzidas no navegador (lado maior 800 px, WebP 0,8) para caber no localStorage.
import { icone } from './icones.js';
import { esc } from './formato.js';

export const MAX_FOTOS = 3;
const LADO = 800;

// Recebe um arquivo ou um endereço. Endereço que não deixa ler a imagem (CORS) fica como link.
export async function prepararFoto(origem) {
  try {
    const blob = typeof origem === 'string' ? await (await fetch(origem)).blob() : origem;
    const img = await createImageBitmap(blob);
    const escala = Math.min(1, LADO / Math.max(img.width, img.height));
    const tela = document.createElement('canvas');
    tela.width = Math.round(img.width * escala);
    tela.height = Math.round(img.height * escala);
    tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
    return tela.toDataURL('image/webp', 0.8);
  } catch {
    if (typeof origem === 'string' && /^https:\/\//i.test(origem)) return origem;
    throw new Error('Não deu para abrir essa imagem. Tente outro arquivo ou endereço.');
  }
}

// 1ª foto do produto, ou a caixinha quando não tem foto.
export const capa = (p) => (p?.fotos?.[0] ? `<img src="${esc(p.fotos[0])}" alt="" loading="lazy">` : icone('package'));
