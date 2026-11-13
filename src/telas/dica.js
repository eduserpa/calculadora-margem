// Dica própria dos (i) (Eduardo 13/11): o title demora e não abre no toque. Todo elemento com data-dica mostra um balão
// pequeno: no hover (mouse), no foco pelo teclado e no toque/clique (liga e desliga); some no Esc, ao tocar fora, ao rolar.
// Texto: data-dica (se tiver valor) ou o aria-label. Um balão só, em popover: fica por cima até de janela aberta.
const balao = document.createElement('div');
balao.className = 'dica-balao';
balao.setAttribute('role', 'tooltip');
balao.setAttribute('popover', 'manual');
balao.hidden = true;
let dono = null, fixo = false;
const pronto = () => balao.isConnected || document.body.append(balao);

function mostrar(el, fixar = false) {
  pronto();
  dono = el; fixo = fixar;
  balao.textContent = el.dataset.dica || el.getAttribute('aria-label') || '';
  balao.hidden = false;
  if (balao.showPopover && !balao.matches(':popover-open')) balao.showPopover();
  // acima e centrado; se não couber em cima, embaixo; nunca para fora da tela (a seta segue o (i))
  const r = el.getBoundingClientRect(), b = balao.getBoundingClientRect(), m = 8;
  const embaixo = r.top - b.height - 10 < m;
  const x = Math.min(Math.max(r.left + r.width / 2 - b.width / 2, m), innerWidth - b.width - m);
  balao.classList.toggle('embaixo', embaixo);
  balao.style.left = `${x}px`;
  balao.style.top = `${embaixo ? r.bottom + 10 : r.top - b.height - 10}px`;
  balao.style.setProperty('--seta-x', `${r.left + r.width / 2 - x}px`);
}
function esconder() {
  if (!dono) return;
  dono = null; fixo = false;
  if (balao.matches?.(':popover-open')) balao.hidePopover();
  balao.hidden = true;
}

const alvo = (e) => e.target.closest?.('[data-dica]');
document.addEventListener('pointerover', (e) => { const el = alvo(e); if (el && e.pointerType === 'mouse' && !fixo) mostrar(el); });
document.addEventListener('pointerout', (e) => { const el = alvo(e); if (el && el === dono && !fixo && !el.contains(e.relatedTarget)) esconder(); });
document.addEventListener('focusin', (e) => { const el = alvo(e); if (el && el.matches(':focus-visible')) mostrar(el); });
document.addEventListener('focusout', (e) => { if (alvo(e) === dono && !fixo) esconder(); });
document.addEventListener('click', (e) => {
  const el = alvo(e);
  if (!el) return esconder();
  e.preventDefault(); // dentro de <label>, não passa o clique para o campo
  if (el === dono && fixo) esconder();
  else mostrar(el, true);
});
// Esc fecha só o balão (na janela aberta, não fecha a janela junto)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dono) { e.preventDefault(); e.stopPropagation(); esconder(); }
}, true);
addEventListener('scroll', esconder, true);
addEventListener('resize', esconder);
