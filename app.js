const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const arrow = (id = 'arrow-up') => `<svg class="icon" aria-hidden="true"><use href="#${id}"/></svg>`;

const menuButton = $('.menu-toggle');
const navigation = $('#navigation');
function closeMenu() { menuButton.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); menuButton.setAttribute('aria-label', 'Открыть меню'); }
menuButton.addEventListener('click', () => { const isOpen = menuButton.getAttribute('aria-expanded') !== 'true'; menuButton.setAttribute('aria-expanded', String(isOpen)); menuButton.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню'); navigation.classList.toggle('is-open', isOpen); });
$$('a', navigation).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!event.target.closest('.header')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus({ preventScroll: true }); } });
window.matchMedia('(min-width: 901px)').addEventListener('change', () => { if (window.innerWidth >= 901) closeMenu(); });

const projects = [
  { title: 'Частный дом', image: 'project-modern-house', text: 'Современный двухэтажный дом с контурной подсветкой кровли, световыми акцентами на фасаде и освещением входной зоны. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Загородный дом', image: 'project-country-house', text: 'Тёплые гирлянды подчёркивают линии скатной кровли и объединяют дом, навес и входную группу в одну вечернюю композицию. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Терраса', image: 'project-terrace', text: 'Декоративное освещение крытой террасы: тёплая световая бахрома вдоль кровли и мягкое свечение над зоной отдыха. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Фасад', image: 'project-contour', text: 'Лаконичная контурная подсветка одноэтажного дома. Тонкая световая линия выделяет силуэт кровли на фоне вечернего неба. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Дом и сад', image: 'project-house-garden', text: 'Архитектурная подсветка фасада в сочетании с тёплым декоративным светом на дереве. Дом и прилегающий сад получают единое вечернее настроение. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Праздничный свет', image: 'project-festive-house', text: 'Тёплое декоративное оформление двухэтажного дома: световая бахрома по периметру кровли и гирлянды вдоль фасада. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Входная группа', image: 'project-entrance', text: 'Световые акценты вдоль кровли и над входом в кирпичный загородный дом. Декоративное оформление продолжает линии существующей архитектуры. Фото из портфолио «Жизнь — Свет».' },
  { title: 'Световой декор', image: 'project-light-decor', text: 'Декоративные гирлянды подчёркивают сложную геометрию кровли, башни и балкона. Тёплый свет выделяется на фоне синего вечернего неба. Фото из портфолио «Жизнь — Свет».' }
];
const services = [
  { title: 'Визуализация', image: 'sketch', text: 'Начинаем с фотографии вашего объекта и обсуждения задачи. Готовим варианты светового оформления, чтобы ещё до начала работ вы могли оценить будущий результат. Вместе с визуализацией предоставляем предварительную смету.' },
  { title: 'Подбор оборудования', image: 'spotlight', text: 'Подбираем светильники, гирлянды, оптику, профили и системы управления под конкретный объект. Для уличных решений используем профессиональное оборудование с защитой IP65 и выше. Учитываем стиль, условия эксплуатации и ваш бюджет.' },
  { title: 'Монтаж', image: 'installation', text: 'Установку выполняют специалисты по электромонтажу с допусками к высотным работам. Подбираем крепления с учётом материала фасада, аккуратно прокладываем кабель и настраиваем управление. До начала работ фиксируем стоимость в договоре.' },
  { title: 'Гарантия', image: 'groundlight', text: 'Предоставляем гарантию 36 месяцев на оборудование и монтаж. Все условия прописываем в договоре. После запуска остаёмся на связи по вопросам эксплуатации и сервисного обслуживания.' }
];
const dialog = $('#detail-dialog');
const dialogContent = $('#dialog-content');
let currentProject = 0;
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
  dialogContent.innerHTML = `<img class="dialog-hero dialog-hero--project" src="/assets/${project.image}.webp" alt="${project.title}"><div class="dialog-copy"><span class="eyebrow">Реализованный проект</span><h2 id="dialog-title">${project.title}</h2><p>${project.text}</p><a class="button button--dark" href="#contact" data-close-dialog>Обсудить похожий проект ${arrow()}</a><div class="dialog-image-nav"><button data-gallery-prev>${arrow('chevron-left')} Назад</button><span>${String(currentProject + 1).padStart(2, '0')} / ${String(gallery.length).padStart(2, '0')}</span><button data-gallery-next>Далее ${arrow('chevron-right')}</button></div></div>`;
  $('[data-gallery-prev]', dialog).addEventListener('click', () => renderProject(currentProject - 1, trigger, gallery));
  $('[data-gallery-next]', dialog).addEventListener('click', () => renderProject(currentProject + 1, trigger, gallery));
  $('[data-close-dialog]', dialog).addEventListener('click', closeDialog);
  openDialog(trigger);
}
$$('[data-project]').forEach(button => button.addEventListener('click', () => renderProject(Number(button.dataset.project), button)));
$$('[data-service]').forEach(button => button.addEventListener('click', () => { const service = services[Number(button.dataset.service)]; galleryMode = false; dialogContent.innerHTML = `<img class="dialog-hero" src="/assets/${service.image}.webp" alt="${service.title}"><div class="dialog-copy"><span class="eyebrow">Что входит в работу</span><h2 id="dialog-title">${service.title}</h2><p>${service.text}</p><a class="button button--dark" href="#contact" data-close-dialog>Обсудить проект ${arrow()}</a></div>`; $('[data-close-dialog]', dialog).addEventListener('click', closeDialog); openDialog(button); }));
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
