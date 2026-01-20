
(function(){
  const btn = document.querySelector('.btn_hamburger');
  const nav = document.getElementById('menuCategorias');
  const overlay = document.querySelector('.menu_overlay');
  const btnClose = document.querySelector('.btn_close_menu');

  if(!btn || !nav || !overlay || !btnClose) return;

  const open = () => {
    nav.classList.add('is-open');
    overlay.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // foco en el primer link
    const firstLink = nav.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
    firstLink && firstLink.focus({preventScroll:true});
    // bloquear scroll del body
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    nav.classList.remove('is-open');
    overlay.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus({preventScroll:true});
    document.body.style.overflow = '';
  };

  btn.addEventListener('click', open);
  btnClose.addEventListener('click', close);
  overlay.addEventListener('click', close);

  // Cerrar con Escape y con links
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && nav.classList.contains('is-open')) close();
  });
  nav.addEventListener('click', (e) => {
    const el = e.target.closest('a');
    if(el) close();
  });
})();

// === Badge del carrito (JWT por header) ===
function getCartBadgeEl() {
  return document.querySelector('#cartBadge') || document.querySelector('.icon_btn .badge');
}

async function updateCartBadge() {
  try {
    const r = await apiFetchPublic('/api/cart', { auth: true });
    const cart  = r?.data || {};
    const items = Array.isArray(cart.items) ? cart.items : [];

    // ✅ cuenta líneas, no cantidades
    const count = items.length;

    const el = getCartBadgeEl();
    if (el) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.visibility = count > 0 ? 'visible' : 'hidden';
    }
  } catch {
    const el = getCartBadgeEl();
    if (el) { el.textContent = '0'; el.style.visibility = 'hidden'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
});
