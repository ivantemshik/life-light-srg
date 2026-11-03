const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const arrow = (id = 'arrow-up') => `<svg class="icon" aria-hidden="true"><use href="#${id}"/></svg>`;
const cfg = window.LL_CONFIG || {};
const goal = (name, params) => { try { if (window.llGoal) window.llGoal(name, params); } catch { /* аналитика не должна ломать сайт */ } };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(key, area = localStorage) { try { return area.getItem(key); } catch { return null; } },
  set(key, value, area = localStorage) { try { area.setItem(key, value); } catch { /* приватный режим */ } }
};

const menuButton = $('.menu-toggle');
const navigation = $('#navigation');
function closeMenu() { menuButton.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); menuButton.setAttribute('aria-label', 'Открыть меню'); }
menuButton.addEventListener('click', () => { const isOpen = menuButton.getAttribute('aria-expanded') !== 'true'; menuButton.setAttribute('aria-expanded', String(isOpen)); menuButton.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню'); navigation.classList.toggle('is-open', isOpen); });
$$('a', navigation).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus({ preventScroll: true }); } });
window.matchMedia('(min-width: 901px)').addEventListener('change', () => { if (window.innerWidth >= 901) closeMenu(); });

// Светлая и тёмная тема. Выбор посетителя запоминается; пока он не выбрал, тема следует настройке системы.
// Начальную тему ставит скрипт в <head>, чтобы страница не мигала при загрузке.
const themeButtons = $$('.theme-toggle');
const themeColor = $('meta[name="theme-color"]');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (themeColor) themeColor.content = dark ? '#0d0d0d' : '#f3f3f3';
  themeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  });
}
applyTheme(document.documentElement.dataset.theme);
themeButtons.forEach((button) => button.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  store.set('ll-theme', next);
}));
systemDark.addEventListener('change', (event) => {
  const saved = store.get('ll-theme');
  if (saved !== 'dark' && saved !== 'light') applyTheme(event.matches ? 'dark' : 'light');
});

// Звёзды на первом экране тёмной темы: одинаковая раскладка при каждой загрузке, мерцают в разном ритме
const sky = $('.hero-sky');
if (sky) {
  let seed = 20261103;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stars = document.createDocumentFragment();
  for (let i = 0; i < 44; i++) {
    const star = document.createElement('i');
    const bright = i % 11 === 0;
    const size = bright ? 2.4 : 1 + random() * 1.1;
    star.style.cssText = `--x:${(random() * 100).toFixed(2)}%;--y:${(random() * 62).toFixed(2)}%;--s:${size.toFixed(2)}px;--o:${(bright ? 0.95 : 0.3 + random() * 0.5).toFixed(2)};--d:${(2.6 + random() * 4).toFixed(2)}s;--delay:-${(random() * 6).toFixed(2)}s`;
    if (bright) star.className = 'is-bright';
    stars.append(star);
  }
  sky.append(stars);
}

const projects = [
  { title: 'Дом с панорамными окнами', images: ['case-panorama-house-1', 'case-panorama-house-2', 'case-panorama-house-3', 'case-panorama-house-4', 'case-panorama-house-5', 'case-panorama-house-6', 'case-panorama-house-7', 'case-panorama-house-8'], alt: 'двухэтажный дом с террасой и тёплой бахромой по кровле', text: 'Большой двухэтажный дом с террасой и деревянными опорами: световая бахрома идёт по свесам кровли, балконам и навесу, а на участке горит наряжённая ель. Дом читается целиком и с дороги, и вблизи.', facts: [['Зоны', 'Свесы кровли, балконы, терраса, ель на участке'], ['Установили', 'Светодиодная бахрома, гирлянды на дереве'], ['Свет', 'Тёплый белый']] },
  { title: 'Дом и сад', images: ['case-house-garden-1', 'case-house-garden-2', 'case-house-garden-3'], alt: 'освещённый фасад и ель с тёплыми гирляндами', text: 'Архитектурная подсветка фасада и тёплые гирлянды на высокой ели. Дом и сад получают единое вечернее настроение, а настенные светильники подчёркивают лепнину и входную группу.', facts: [['Зоны', 'Фасад, кровля, ель у дома'], ['Установили', 'Контурная и настенная подсветка, гирлянды на дереве'], ['Свет', 'Белый на фасаде, тёплый на ели']] },
  { title: 'Загородный дом', images: ['case-country-house-1'], alt: 'кирпичный дом с бахромой по скатной кровле', text: 'Тёплая бахрома по всем свесам скатной кровли объединяет дом, навес и входную группу в одну вечернюю композицию.', facts: [['Зоны', 'Кровля дома и навеса, входная группа'], ['Установили', 'Светодиодная бахрома по всем свесам'], ['Свет', 'Тёплый белый']] },
  { title: 'Праздничный свет', images: ['case-festive-house-1'], alt: 'праздничное оформление двухэтажного дома', text: 'Новогоднее оформление двухэтажного дома: световая бахрома по всему периметру кровли и гирлянды вдоль фасада.', facts: [['Зоны', 'Периметр кровли, фасад'], ['Установили', 'Световая бахрома и гирлянды'], ['Формат', 'Новогоднее оформление']] },
  { title: 'Световой декор', images: ['case-light-decor-1', 'case-light-decor-2'], alt: 'гирлянды на доме с башней и балконом', text: 'Гирлянды повторяют сложную геометрию кровли, башни и балкона. Тёплый свет держится на синем вечернем небе и в темноте.', facts: [['Зоны', 'Кровля, башня, балкон, входная группа'], ['Установили', 'Гирлянды по контуру сложной кровли'], ['Свет', 'Тёплый белый']] },
  { title: 'Частный дом', images: ['case-modern-house-1'], alt: 'современный двухэтажный дом с контурной подсветкой', text: 'Современный двухэтажный дом: линейная подсветка обводит кровлю и карнизы, настенные светильники подчёркивают фасад, у входа и в саду мягкий свет. Постоянная архитектурная подсветка на каждый вечер.', facts: [['Зоны', 'Контур кровли и карнизов, фасад, вход, сад'], ['Установили', 'Контурная подсветка, настенные и садовые светильники'], ['Формат', 'Постоянная подсветка на каждый вечер']] },
  { title: 'Контур кровли', images: ['case-contour-houses-1', 'case-contour-houses-2'], alt: 'кремовый дом с тонкой контурной подсветкой', text: 'Тонкая контурная линия повторяет силуэт кровли и эркера, а подсветка под карнизом и на террасе добавляет глубины фасаду из светлого кирпича.', facts: [['Зоны', 'Контур кровли, эркер, терраса, входная группа'], ['Установили', 'Линейная светодиодная подсветка'], ['Формат', 'Постоянная подсветка']] },
  { title: 'Торговый центр', images: ['case-sport-store-1', 'case-sport-store-2', 'case-sport-store-3', 'case-sport-store-4'], alt: 'контурная подсветка фасада торгового здания', text: 'Коммерческий объект: линейная подсветка по контуру фасада и под карнизом выделяет изогнутое здание и вход, а вывески остаются главным акцентом вечером.', facts: [['Зоны', 'Фасад, карниз, входная группа'], ['Установили', 'Линейная светодиодная подсветка по контуру'], ['Формат', 'Постоянная подсветка']] },
  { title: 'Деревянный дом', images: ['case-timber-house-1'], alt: 'деревянный дом с контурной подсветкой фронтона', text: 'Яркая контурная линия обводит фронтон и остекление деревянного дома, и он заметен издалека даже в тёмное время.', facts: [['Зоны', 'Фронтон, остекление'], ['Установили', 'Контурная светодиодная подсветка'], ['Формат', 'Постоянная подсветка']] },
  { title: 'Дом с садом', images: ['case-brick-house-1'], alt: 'дом из кирпича с остеклённой террасой и садом', text: 'Кирпичный дом с остеклённой террасой и ухоженным садом. Дневной кадр объекта.', facts: [['Зоны', 'Фасад, терраса, сад'], ['Формат', 'Архитектурная подсветка']] },
  { title: 'Фасад', images: ['project-contour'], alt: 'тонкая контурная подсветка одноэтажного дома', text: 'Лаконичная контурная подсветка одноэтажного дома: одна тонкая световая линия выделяет силуэт кровли на фоне ночного неба.', facts: [['Зоны', 'Силуэт кровли по всему периметру'], ['Установили', 'Тонкая контурная световая линия'], ['Формат', 'Постоянная подсветка']] },
  { title: 'Терраса', images: ['project-terrace'], alt: 'световая бахрома по периметру кровли и террасы', text: 'Световая бахрома по периметру кровли и над крытой террасой. Зона отдыха остаётся светлой и уютной до поздней ночи.', facts: [['Зоны', 'Кровля дома, крытая терраса'], ['Установили', 'Световая бахрома по периметру кровли и навеса'], ['Свет', 'Тёплый белый']] },
  { title: 'Входная группа', images: ['project-entrance'], alt: 'декоративное освещение входной группы кирпичного дома', text: 'Световые акценты вдоль кровли и над входом в кирпичный загородный дом. Оформление продолжает линии существующей архитектуры.', facts: [['Зоны', 'Кровля и входная группа'], ['Установили', 'Гирлянды вдоль кровли и над входом'], ['Формат', 'Новогоднее оформление']] }
];
const services = [
  { title: 'Визуализация', image: 'sketch', text: 'Начинаем с фотографии вашего дома и обсуждения задачи. В день обращения бесплатно готовим несколько вариантов светового оформления и предварительную смету, чтобы вы заранее увидели результат и понимали бюджет. Для новогоднего оформления предлагаем три варианта дизайна.' },
  { title: 'Подбор оборудования', image: 'spotlight', text: 'Подбираем светильники, гирлянды, гибкий неон, профили и системы управления под объект. Для улицы используем профессиональное оборудование с защитой IP65 и выше, каучуковый провод вместо ПВХ и анодированный алюминиевый профиль. Учитываем стиль, условия эксплуатации и ваш бюджет.' },
  { title: 'Монтаж', image: 'installation', text: 'Установку выполняют электрики с допусками к высотным работам и опытом от трёх лет. Крепёж и тросовую систему подбираем с учётом материала фасада, отделку не повреждаем. Восемь монтажей из десяти выполняем за один день, есть приоритетный монтаж за 24 часа. Стоимость фиксируем в договоре до начала работ, оплата по факту.' },
  { title: 'Гарантия', image: 'groundlight', text: 'Гарантия 36 месяцев на оборудование и монтаж. Все условия прописываем в договоре. После запуска остаёмся на связи по вопросам эксплуатации и сервисного обслуживания; новогодний декор в аренду демонтируем сами.' }
];
const dialog = $('#detail-dialog');
const dialogContent = $('#dialog-content');
let currentProject = 0;
/* Просмотр фото на весь экран: щипок и колесо для масштаба, перетаскивание, двойной тап, свайп для смены фото */
const lightbox = document.createElement('dialog');
lightbox.className = 'lightbox';
lightbox.setAttribute('aria-label', 'Просмотр фото');
lightbox.innerHTML = `<div class="lightbox-stage"><img class="lightbox-img" alt="" draggable="false"></div><button class="lightbox-close round-button" type="button" aria-label="Закрыть фото">${arrow('close')}</button><button class="lightbox-nav lightbox-nav--prev round-button" type="button" aria-label="Предыдущее фото">${arrow('chevron-left')}</button><button class="lightbox-nav lightbox-nav--next round-button" type="button" aria-label="Следующее фото">${arrow('chevron-right')}</button><span class="lightbox-count"></span>`;
document.body.append(lightbox);
{
  const stage = $('.lightbox-stage', lightbox);
  const img = $('.lightbox-img', lightbox);
  const count = $('.lightbox-count', lightbox);
  const MAX_SCALE = 5;
  let list = [], index = 0, scale = 1, tx = 0, ty = 0;
  const pointers = new Map();
  let pinch = null, drag = null, lastTap = 0;
  const clampPan = () => {
    const limitX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2);
    const limitY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2);
    tx = Math.min(limitX, Math.max(-limitX, tx)); ty = Math.min(limitY, Math.max(-limitY, ty));
  };
  const apply = () => { clampPan(); img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; lightbox.classList.toggle('is-zoomed', scale > 1.01); };
  const zoomAt = (next, px, py) => {
    next = Math.min(MAX_SCALE, Math.max(1, next));
    const rect = stage.getBoundingClientRect();
    const cx = px - rect.left - rect.width / 2, cy = py - rect.top - rect.height / 2;
    tx = cx - (cx - tx) * (next / scale); ty = cy - (cy - ty) * (next / scale); scale = next;
    if (scale <= 1) { tx = 0; ty = 0; }
    apply();
  };
  const show = (i) => {
    index = (i + list.length) % list.length; scale = 1; tx = 0; ty = 0;
    img.src = `/assets/${list[index]}.webp`; img.style.transform = '';
    lightbox.classList.toggle('is-single', list.length < 2);
    count.textContent = list.length > 1 ? `${index + 1} / ${list.length}` : '';
    lightbox.classList.remove('is-zoomed');
  };
  window.openLightbox = (images, start, title) => { list = images; img.alt = title || ''; show(start || 0); if (!lightbox.open) lightbox.showModal(); };
  $('.lightbox-close', lightbox).addEventListener('click', () => lightbox.close());
  $('.lightbox-nav--prev', lightbox).addEventListener('click', () => show(index - 1));
  $('.lightbox-nav--next', lightbox).addEventListener('click', () => show(index + 1));
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' && list.length > 1) { event.preventDefault(); show(index + 1); }
    if (event.key === 'ArrowLeft' && list.length > 1) { event.preventDefault(); show(index - 1); }
    if (event.key === '+' || event.key === '=') zoomAt(scale * 1.4, innerWidth / 2, innerHeight / 2);
    if (event.key === '-') zoomAt(scale / 1.4, innerWidth / 2, innerHeight / 2);
  });
  stage.addEventListener('wheel', (event) => { event.preventDefault(); zoomAt(scale * Math.exp(-event.deltaY * 0.0022), event.clientX, event.clientY); }, { passive: false });
  stage.addEventListener('pointerdown', (event) => {
    try { stage.setPointerCapture(event.pointerId); } catch { /* синтетические события без активного указателя */ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale }; drag = null;
    } else if (pointers.size === 1) {
      drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
    }
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      zoomAt(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (drag) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (scale > 1) { tx = drag.tx + dx; ty = drag.ty + dy; apply(); }
    }
  });
  const release = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; if (pointers.size === 1) { const [p] = [...pointers.values()]; drag = { x: p.x, y: p.y, tx, ty, moved: true }; } return; }
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const moved = drag.moved; drag = null;
    if (event.type !== 'pointerup') return;
    if (moved && scale <= 1.01 && list.length > 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { show(index + (dx < 0 ? 1 : -1)); return; }
    if (moved) return;
    const now = Date.now();
    if (now - lastTap < 300) { lastTap = 0; zoomAt(scale > 1.01 ? 1 : 2.5, event.clientX, event.clientY); }
    else { lastTap = now; if (event.target === stage && scale <= 1.01) setTimeout(() => { if (lastTap && Date.now() - lastTap >= 280) lightbox.close(); }, 300); }
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  lightbox.addEventListener('close', () => { pointers.clear(); pinch = null; drag = null; });
}
let lastTrigger;
let galleryMode = false;
let activeGallery = projects;
function openDialog(trigger) { if (!dialog.open) { lastTrigger = trigger; dialog.showModal(); } dialog.scrollTop = 0; dialogContent.scrollTop = 0; $('.dialog-close').focus(); }
function closeDialog() { dialog.close(); lastTrigger?.focus({ preventScroll: true }); }
$('.dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
dialog.addEventListener('close', () => { galleryMode = false; });
function renderProject(index, trigger, gallery = projects) {
  activeGallery = gallery; currentProject = (index + gallery.length) % gallery.length;
  const project = gallery[currentProject]; galleryMode = true;
  dialogContent.innerHTML = `<img class="dialog-hero dialog-hero--project" id="dialog-hero" src="/assets/${project.images[0]}.webp" alt="${project.title}">${project.images.length > 1 ? `<div class="dialog-thumbs" role="group" aria-label="Фото объекта">${project.images.map((src, i) => `<button type="button" class="dialog-thumb${i ? '' : ' is-active'}" data-photo="${i}" aria-label="Фото ${i + 1} из ${project.images.length}"><img src="/assets/${src}.webp" alt="" loading="lazy"></button>`).join('')}</div>` : ''}<div class="dialog-copy"><h2 id="dialog-title">${project.title}</h2><p>${project.text}</p>${project.facts ? `<dl class="dialog-facts">${project.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}<a class="button button--dark" href="#request" data-close-dialog data-goal="cta_project">Рассчитать мой проект</a><div class="dialog-image-nav"><button type="button" data-gallery-prev>${arrow('chevron-left')} Назад</button><span>${String(currentProject + 1).padStart(2, '0')} / ${String(gallery.length).padStart(2, '0')}</span><button type="button" data-gallery-next>Далее ${arrow('chevron-right')}</button></div></div>`;
  $('[data-gallery-prev]', dialog).addEventListener('click', () => renderProject(currentProject - 1, trigger, gallery));
  $('[data-gallery-next]', dialog).addEventListener('click', () => renderProject(currentProject + 1, trigger, gallery));
  let heroIndex = 0;
  $('#dialog-hero').addEventListener('click', () => openLightbox(project.images, heroIndex, project.title));
  $$('.dialog-thumb', dialog).forEach(btn => btn.addEventListener('click', () => { heroIndex = Number(btn.dataset.photo); $('#dialog-hero').src = `/assets/${project.images[heroIndex]}.webp`; $$('.dialog-thumb', dialog).forEach(b => b.classList.toggle('is-active', b === btn)); }));
  $('[data-close-dialog]', dialog).addEventListener('click', closeDialog);
  if (!dialog.open) goal('open_project', { project: project.title });
  openDialog(trigger);
}
$$('[data-project]').forEach(button => button.addEventListener('click', () => renderProject(Number(button.dataset.project), button)));
$$('[data-service]').forEach(button => button.addEventListener('click', () => { const service = services[Number(button.dataset.service)]; galleryMode = false; dialogContent.innerHTML = `<img class="dialog-hero" src="/assets/${service.image}.webp" alt="${service.title}"><div class="dialog-copy"><span class="eyebrow">Что входит в работу</span><h2 id="dialog-title">${service.title}</h2><p>${service.text}</p><a class="button button--dark" href="#request" data-close-dialog data-goal="cta_service">Рассчитать по фото</a></div>`; $('[data-close-dialog]', dialog).addEventListener('click', closeDialog); openDialog(button); }));
dialog.addEventListener('keydown', event => { if (!galleryMode) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); renderProject(currentProject + (event.key === 'ArrowRight' ? 1 : -1), lastTrigger, activeGallery); } });

const track = $('#project-track');
function moveTrack(direction) {
  const max = track.scrollWidth - track.clientWidth;
  if (max > 1) { const gap = parseFloat(getComputedStyle(track).columnGap) || 0; const next = track.scrollLeft + direction * (track.firstElementChild.getBoundingClientRect().width + gap); track.scrollTo({ left: next < -1 ? max : next > max + 1 ? 0 : next, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
  else { const cards = $$('.project-card', track); if (direction > 0) track.append(cards[0]); else track.prepend(cards[cards.length - 1]); }
}
$('#project-prev').addEventListener('click', () => moveTrack(-1));
$('#project-next').addEventListener('click', () => moveTrack(1));
track.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveTrack(event.key === 'ArrowLeft' ? -1 : 1); } });

const portfolioToggle = $('#portfolio-toggle');
portfolioToggle.addEventListener('click', () => renderProject(0, portfolioToggle));
$('#year').textContent = new Date().getFullYear();

/* Цели Метрики по кликам */
document.addEventListener('click', (event) => {
  const el = event.target.closest('a, button');
  if (!el) return;
  if (el.dataset.goal) goal(el.dataset.goal);
  const href = el.getAttribute('href') || '';
  const place = el.closest('footer') ? 'footer' : (el.closest('section, dialog')?.id || '');
  if (href.startsWith('https://t.me/')) goal('click_telegram', { place });
  else if (href.startsWith('mailto:')) goal('click_email', { place });
  else if (href.startsWith('tel:')) goal('click_phone', { place });
});

/* Вкладки «Частным домам / Бизнесу и ТЦ» */
$$('[role="tablist"]').forEach((list) => {
  const tabs = $$('[role="tab"]', list);
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
  panels.forEach((panel) => { if (panel.hasAttribute('data-start-hidden')) panel.hidden = true; });
  const select = (index, moveFocus) => {
    tabs.forEach((tab, i) => { const on = i === index; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; panels[i].hidden = !on; });
    if (moveFocus) tabs[index].focus();
    list.dispatchEvent(new CustomEvent('tabchange', { detail: { panel: panels[index] } }));
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { select(index); goal('segment_tab', { tab: tab.textContent.trim() }); });
    tab.addEventListener('keydown', (event) => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in keys)) return;
      event.preventDefault();
      select((keys[event.key] + tabs.length) % tabs.length, true);
    });
  });
});

/* Сравнение без подсветки и с ней */
$$('[data-compare]').forEach((box) => {
  const range = $('.compare-range', box);
  let used = false;
  range.addEventListener('input', () => {
    box.style.setProperty('--pos', `${range.value}%`);
    if (!used) { used = true; goal('compare_slider'); }
  });
});


/* UTM и источник визита: запоминаем первый заход в сессии */
(() => {
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid'].forEach((key) => { if (params.get(key)) utm[key] = params.get(key).slice(0, 200); });
  if (Object.keys(utm).length && !store.get('ll_utm', sessionStorage)) store.set('ll_utm', JSON.stringify(utm), sessionStorage);
  if (!store.get('ll_ref', sessionStorage)) store.set('ll_ref', document.referrer.slice(0, 500), sessionStorage);
})();

/* Форма заявки */
const form = $('#lead-form');
const nameInput = $('#f-name');
const contactInput = $('#f-contact');
const consentInput = $('#f-consent');
const photosInput = $('#f-photos');
const thumbs = $('#f-thumbs');
const drop = $('.drop', form);
const photosHelp = $('#f-photos-help');
const photosHelpText = photosHelp.textContent;
const status = $('#f-status');
const submit = $('#f-submit');
const submitLabel = submit.textContent;
const MAX_PHOTOS = 5;
const MAX_SIDE = 1600;
const telegramLink = `<a href="${esc(cfg.telegram || 'https://t.me/LifeLight_ru')}" target="_blank" rel="noopener noreferrer">напишите нам в Telegram</a>`;
let photos = [];
let formStarted = false;
let sending = false;

// Кнопки «Рассчитать для дома» и «Получить 3 варианта дизайна» заранее отмечают ответы в форме
$$('[data-preset-segment]').forEach((link) => link.addEventListener('click', () => {
  const seg = link.dataset.presetSegment;
  if (seg) { const input = form.querySelector(`input[name="segment"][value="${seg}"]`); if (input) input.checked = true; }
}));

const rules = [
  { input: nameInput, help: $('#f-name-help'), check: (v) => v.trim().length >= 2, message: 'Напишите, как к вам обращаться.' },
  { input: contactInput, help: $('#f-contact-help'), check: (v) => isContact(v), message: 'Нужен телефон, например +7 900 000-00-00, или ник в Telegram, например @lifelight.' },
  { input: consentInput, help: $('#f-consent-help'), check: () => consentInput.checked, message: 'Без согласия на обработку данных мы не сможем принять заявку.' }
];
function isContact(value) {
  const v = value.trim();
  const digits = v.replace(/\D/g, '');
  if (/^[+\d\s()-]+$/.test(v) && digits.length >= 10 && digits.length <= 15) return true;
  return /^(@|https?:\/\/t\.me\/)?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v);
}
function setFieldError(rule, show) {
  const ok = rule.check(rule.input.value);
  rule.input.setAttribute('aria-invalid', String(show && !ok));
  if (show && !ok) { rule.input.setAttribute('aria-describedby', rule.help.id); rule.help.textContent = rule.message; rule.help.classList.add('is-error'); }
  else { rule.help.textContent = ''; rule.help.classList.remove('is-error'); }
  return ok;
}
rules.forEach((rule) => {
  const evt = rule.input.type === 'checkbox' ? 'change' : 'input';
  if (rule.input.type !== 'checkbox') rule.input.addEventListener('blur', () => { if (rule.input.value || rule.touched) { rule.touched = true; setFieldError(rule, true); } });
  rule.input.addEventListener(evt, () => { if (rule.touched) setFieldError(rule, true); });
});
form.addEventListener('focusin', () => { if (!formStarted) { formStarted = true; goal('form_start'); } });

function setStatus(html, kind) { status.innerHTML = html; status.className = `form-status${kind ? ` is-${kind}` : ''}`; }
function setPhotosHelp(text, isError) { photosHelp.textContent = text || photosHelpText; photosHelp.classList.toggle('is-error', Boolean(isError)); }

async function compress(file) {
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try { source = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; }); }
    finally { URL.revokeObjectURL(url); }
  }
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
function renderThumbs() {
  thumbs.innerHTML = photos.map((p, i) => `<li><img src="${p.dataUrl}" alt="${esc(p.name)}"><button type="button" data-remove="${i}" aria-label="Убрать фото ${esc(p.name)}">${arrow('close')}</button></li>`).join('');
}
thumbs.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-remove]');
  if (!btn) return;
  photos.splice(Number(btn.dataset.remove), 1);
  renderThumbs(); setPhotosHelp();
  photosInput.focus();
});
async function addFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const room = MAX_PHOTOS - photos.length;
  if (room <= 0) { setPhotosHelp(`Можно приложить до ${MAX_PHOTOS} фото. Уберите лишнее, чтобы добавить новое.`, true); return; }
  const failed = [];
  setPhotosHelp('Готовим фото…');
  for (const file of files.slice(0, room)) {
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) { failed.push(file.name); continue; }
    try { photos.push({ name: file.name, dataUrl: await compress(file) }); }
    catch { failed.push(file.name); }
  }
  renderThumbs();
  if (failed.length) setPhotosHelp(`Не получилось открыть: ${failed.join(', ')}. Пришлите JPG или PNG либо отправьте фото в Telegram.`, true);
  else if (files.length > room) setPhotosHelp(`Добавили ${room} из ${files.length}: больше ${MAX_PHOTOS} фото приложить нельзя.`, true);
  else setPhotosHelp(`Фото: ${photos.length} из ${MAX_PHOTOS}.`);
  if (photos.length) goal('photo_attached', { count: photos.length });
}
photosInput.addEventListener('change', () => { addFiles(photosInput.files).finally(() => { photosInput.value = ''; }); });
['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (event) => { event.preventDefault(); if (event.dataTransfer?.files) addFiles(event.dataTransfer.files); });

function clientId() { return new Promise((resolve) => { if (window.llClientId) window.llClientId(resolve); else resolve(''); }); }

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;
  rules.forEach((rule) => { rule.touched = true; });
  const results = rules.map((rule) => setFieldError(rule, true));
  const firstBad = results.indexOf(false);
  if (firstBad !== -1) { rules[firstBad].input.focus(); setStatus('Проверьте поля, отмеченные выше.', 'error'); goal('form_invalid'); return; }

  const endpoint = String(cfg.apiEndpoint || '').trim();
  if (!endpoint) { setStatus(`Форма пока не подключена, заявка не отправлена. Пожалуйста, ${telegramLink}.`, 'error'); return; }

  let utm = {};
  try { utm = JSON.parse(store.get('ll_utm', sessionStorage) || '{}'); } catch { utm = {}; }
  const payload = {
    name: nameInput.value.trim(),
    contact: contactInput.value.trim(),
    segment: form.elements.segment.value || 'other',
    comment: $('#f-comment').value.trim(),
    consent: consentInput.checked,
    website: $('#f-website').value,
    photos: photos.map((p) => p.dataUrl),
    page: window.location.href.slice(0, 500),
    referrer: store.get('ll_ref', sessionStorage) || document.referrer.slice(0, 500),
    utm,
    ymClientId: await clientId()
  };

  sending = true;
  submit.style.minWidth = `${submit.offsetWidth}px`;
  submit.disabled = true; submit.setAttribute('aria-busy', 'true'); submit.textContent = 'Отправляем…';
  setStatus('');
  goal('form_submit', { segment: payload.segment, photos: payload.photos.length });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    let data = {};
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || !data.ok) throw new Error(data.error || 'request failed');
    setStatus(`Заявка №${esc(data.id)} принята. Ответим в течение часа по контакту ${esc(payload.contact)}.`, 'done');
    goal('lead_sent', { segment: payload.segment, photos: payload.photos.length });
    form.reset(); photos = []; renderThumbs(); setPhotosHelp();
    rules.forEach((rule) => { rule.touched = false; setFieldError(rule, false); });
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Сервер долго не отвечает.' : (error.message && error.message !== 'request failed' && !/fetch/i.test(error.message) ? esc(error.message) : 'Заявка не отправлена.');
    setStatus(`${reason} Попробуйте ещё раз через минуту или ${telegramLink}.`, 'error');
    goal('lead_error');
  } finally {
    clearTimeout(timer);
    sending = false;
    submit.disabled = false; submit.removeAttribute('aria-busy'); submit.textContent = submitLabel; submit.style.minWidth = '';
  }
});

/* Уведомление о cookie: только когда первый экран прокручен, чтобы не закрывать заголовок */
const cookie = $('#cookie');
let cookieOk = Boolean(store.get('ll_cookie_ok'));
new IntersectionObserver(([entry]) => { cookie.hidden = cookieOk || entry.intersectionRatio > 0.35; }, { threshold: [0, 0.35, 0.6, 1] }).observe($('.hero'));
$('#cookie-ok').addEventListener('click', () => { cookieOk = true; store.set('ll_cookie_ok', '1'); cookie.hidden = true; });
