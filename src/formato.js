// Ler e mostrar números no jeito brasileiro.

// Aceita "1.234,56", "12,5", "12.5" e "R$ 10". Vazio vira 0.
export function lerNumero(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : 0;
  let s = String(texto ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const reais = (v) => real.format(Math.abs(v) < 0.005 ? 0 : v);

export const numero = (v, casas = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Para preencher campos: 0 vira vazio, sem zeros sobrando no fim.
export const campo = (v) => (v ? v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '');

export const porcento = (v, casas = 1) => `${numero(v, casas)}%`;

export const gramas = (g) => `${Math.round(g).toLocaleString('pt-BR')} g`;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
