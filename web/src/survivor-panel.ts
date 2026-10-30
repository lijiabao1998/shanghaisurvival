import './survivor-panel.css';

export type SurvivorPanelState = {
  supplies: Array<{ id: string; label: string; count: number; action: string; category?: string; disabled?: boolean }>;
  weapons: Array<{ id: string; label: string; twoHanded: boolean }>;
  primary: string;
  secondary: string | null;
  weight: number;
  capacity: number;
  hp: number;
  stamina: number;
  hydration: number;
  satiety: number;
  bleeding: number;
  pain: number;
};
export type SurvivorPanelOptions = {
  getState(): SurvivorPanelState;
  close(): void;
  use(id: string): void;
  equip(hand: 'primary' | 'secondary', id: string | null): void;
  canEquip?(hand: 'primary' | 'secondary', id: string | null): boolean;
};
type Tab = 'equipment' | 'inventory' | 'body';
const TABS: Array<[Tab, string, string]> = [['equipment', '裝備', '01'], ['inventory', '背包', '02'], ['body', '身體', '03']];
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
};
const decimal = (n: number) => Number.isFinite(n) ? n.toFixed(1) : '—';
const value = (n: number) => Number.isFinite(n) ? Math.round(Math.max(0, Math.min(100, n))) : 0;

/** DOM-only panel. The host owns simulation pause and held-input cancellation. */
export function installSurvivorPanel(options: SurvivorPanelOptions) {
  let tab: Tab = 'equipment';
  let previousFocus: HTMLElement | null = null;
  let lastState = '';
  const overlay = node('div', 'survivor-kit'); overlay.hidden = true;
  const dialog = node('section', 'survivor-kit__dialog');
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'survivor-kit-title');
  const header = node('header', 'survivor-kit__header');
  const heading = node('div'); heading.append(node('p', 'survivor-kit__eyebrow', 'SURVIVOR FIELD RECORD / 上海'));
  const title = node('h2', '', '倖存者裝備'); title.id = 'survivor-kit-title'; heading.append(title);
  const closeButton = node('button', 'survivor-kit__close', '關閉 ×'); closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '關閉背包，返回遊戲');
  closeButton.onclick = () => { close(); options.close(); };
  header.append(heading, closeButton);
  const tabs = node('div', 'survivor-kit__tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '倖存者資料');
  const buttons = new Map<Tab, HTMLButtonElement>();
  const content = node('div', 'survivor-kit__content'); content.setAttribute('role', 'tabpanel'); content.tabIndex = 0;
  content.id = 'survivor-kit-content';
  for (const [id, label, index] of TABS) {
    const button = node('button', '', `${index}  ${label}`); button.type = 'button'; button.id = `survivor-kit-tab-${id}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', content.id);
    button.onclick = () => { tab = id; content.scrollTop = 0; render(true); button.focus(); };
    button.onkeydown = event => {
      const current = TABS.findIndex(t => t[0] === id);
      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % TABS.length;
      else if (event.key === 'ArrowLeft') next = (current + TABS.length - 1) % TABS.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TABS.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation(); tab = TABS[next][0]; content.scrollTop = 0; render(true); buttons.get(tab)?.focus();
    };
    buttons.set(id, button); tabs.append(button);
  }
  const footer = node('footer', 'survivor-kit__footer', '整理裝備時已暫停 · ESC 返回街區');
  dialog.append(header, tabs, content, footer); overlay.append(dialog); document.body.append(overlay);
  overlay.addEventListener('pointerdown', event => event.stopPropagation());
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); options.close(); return; }
    if (event.key !== 'Tab') { event.stopPropagation(); return; }
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter(el => !el.hidden);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    event.stopPropagation();
  });

  function action(label: string, key: string, run: () => void, disabled = false) {
    const button = node('button', 'survivor-kit__action', label); button.type = 'button'; button.disabled = disabled; button.dataset.focusKey = key;
    button.onclick = () => { run(); render(true); }; return button;
  }
  function meter(label: string, n: number, danger = false) {
    const row = node('div', `survivor-kit__meter${danger ? ' is-danger' : ''}`);
    const line = node('div'); line.append(node('span', '', label), node('strong', '', `${value(n)} / 100`));
    const track = node('div', 'survivor-kit__track'); track.setAttribute('role', 'meter'); track.setAttribute('aria-label', label);
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(value(n)));
    const fill = node('span'); fill.style.width = `${value(n)}%`; track.append(fill); row.append(line, track); return row;
  }
  function load(state: SurvivorPanelState) {
    const overweight = state.weight > state.capacity;
    const card = node('div', `survivor-kit__load${overweight ? ' is-heavy' : ''}`);
    card.append(node('span', 'survivor-kit__eyebrow', 'CARRY WEIGHT / 隨身負重'), node('strong', '', `${decimal(state.weight)} / ${decimal(state.capacity)} kg`));
    card.append(node('p', '', overweight ? '負重偏高：移動速度降低、奔跑體力消耗增加。可回安全屋存放物資。' : '物資、武器與散彈均計入負重。安全屋庫存不計。'));
    return card;
  }
  function equipment(state: SurvivorPanelState) {
    content.append(load(state));
    const slots = node('div', 'survivor-kit__slots');
    for (const hand of ['primary', 'secondary'] as const) {
      const id = state[hand]; const weapon = state.weapons.find(w => w.id === id);
      const card = node('section', 'survivor-kit__slot');
      card.append(node('p', 'survivor-kit__eyebrow', hand === 'primary' ? 'PRIMARY / 主手' : 'SECONDARY / 副手'));
      card.append(node('h3', '', weapon?.label ?? (id === 'pipe' ? '鐵管' : id ?? '空手')));
      card.append(node('p', '', weapon?.twoHanded ? '雙手武器 · 副手不可使用' : id ? '單手裝備' : '未裝備副手'));
      if (hand === 'secondary' && id !== null) card.append(action('卸下副手', 'unequip-secondary', () => options.equip(hand, null), options.canEquip ? !options.canEquip(hand, null) : false));
      slots.append(card);
    }
    content.append(slots, node('h3', 'survivor-kit__section-title', '選擇裝備'));
    const list = node('div', 'survivor-kit__weapon-list');
    for (const weapon of state.weapons) {
      const row = node('div', 'survivor-kit__weapon'); const label = node('div');
      label.append(node('strong', '', weapon.label), node('small', '', weapon.twoHanded ? '雙手' : '單手')); row.append(label);
      for (const hand of ['primary', 'secondary'] as const) {
        const current = state[hand] === weapon.id;
        const primaryIsTwoHanded = state.weapons.some(w => w.id === state.primary && w.twoHanded);
        const opposite = hand === 'primary' ? state.secondary : state.primary;
        const invalid = opposite === weapon.id || (hand === 'secondary' && (weapon.twoHanded || primaryIsTwoHanded));
        const disabled = current || invalid || (options.canEquip ? !options.canEquip(hand, weapon.id) : false);
        row.append(action(current ? (hand === 'primary' ? '主手使用中' : '副手使用中') : (hand === 'primary' ? '裝備主手' : '裝備副手'), `${hand}-${weapon.id}`, () => options.equip(hand, weapon.id), disabled));
      }
      list.append(row);
    }
    content.append(list, node('p', 'survivor-kit__note', '同一件裝備不能同時占兩手。雙手步槍會占用副手；切換裝備不補充彈藥。'));
  }
  function inventory(state: SurvivorPanelState) {
    content.append(load(state));
    const categories = [...new Set(state.supplies.map(s => s.category ?? '隨身補給'))];
    for (const category of categories) {
      content.append(node('h3', 'survivor-kit__section-title', category));
      const list = node('div', 'survivor-kit__supply-list');
      for (const supply of state.supplies.filter(s => (s.category ?? '隨身補給') === category)) {
        const row = node('div', `survivor-kit__supply${supply.count <= 0 ? ' is-empty' : ''}`);
        row.append(node('strong', '', supply.label), node('span', 'survivor-kit__count', `× ${supply.count}`), action(supply.action, `use-${supply.id}`, () => options.use(supply.id), supply.count <= 0 || !!supply.disabled)); list.append(row);
      }
      content.append(list);
    }
    if (state.supplies.every(s => s.count <= 0)) content.append(node('p', 'survivor-kit__note', '背包沒有補給。探索街區物資箱，或回安全屋取用庫存。'));
  }
  function body(state: SurvivorPanelState) {
    const grid = node('div', 'survivor-kit__body');
    const figure = node('div', 'survivor-kit__figure'); figure.setAttribute('aria-hidden', 'true');
    for (const part of ['head', 'torso', 'arm-left', 'arm-right', 'leg-left', 'leg-right']) figure.append(node('span', `survivor-kit__human-${part}`));
    figure.append(node('span', 'survivor-kit__figure-caption', '全身狀態'));
    const stats = node('div', 'survivor-kit__meters'); stats.append(meter('健康', state.hp, state.hp < 30), meter('體力', state.stamina), meter('水分', state.hydration), meter('飽足', state.satiety));
    grid.append(figure, stats); content.append(grid);
    const wounded = state.bleeding > 0 || state.pain > 0;
    const condition = node('section', `survivor-kit__condition${wounded ? ' is-wounded' : ''}`);
    condition.append(node('h3', '', wounded ? '需要處置' : '狀態穩定'), node('p', '', `流血 ${value(state.bleeding)} / 100 · 疼痛 ${value(state.pain)} / 100`));
    condition.append(node('p', '', state.bleeding > 0 ? '仍有流血：返回街區後會持續損失健康。使用醫療包處置。' : '目前沒有持續流血。留意體力與補給，避免勉強奔跑。'));
    const medkit = state.supplies.find(s => s.id === 'medkit');
    condition.append(action(`醫療包處置（${medkit?.count ?? 0}）`, 'treat-medkit', () => options.use('medkit'), !medkit || medkit.count <= 0 || !!medkit.disabled));
    content.append(condition, node('p', 'survivor-kit__note', '虛構生存遊戲機制，不代表醫療診斷。第一階段追蹤全身傷勢，不宣稱部位受傷模擬。'));
  }
  function render(force = false) {
    if (overlay.hidden && !force) return;
    const state = options.getState(); const signature = JSON.stringify([tab, state]); if (!force && signature === lastState) return; lastState = signature;
    const focusKey = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.focusKey : undefined;
    const oldScroll = content.scrollTop;
    for (const [id, button] of buttons) { button.setAttribute('aria-selected', String(id === tab)); button.tabIndex = id === tab ? 0 : -1; }
    content.setAttribute('aria-labelledby', `survivor-kit-tab-${tab}`); content.replaceChildren();
    if (tab === 'equipment') equipment(state); else if (tab === 'inventory') inventory(state); else body(state);
    content.scrollTop = oldScroll;
    if (focusKey) {
      const nextFocus = [...content.querySelectorAll<HTMLButtonElement>('button[data-focus-key]')].find(b => b.dataset.focusKey === focusKey && !b.disabled);
      (nextFocus ?? content).focus({ preventScroll: true });
    }
  }
  function open() {
    if (overlay.hidden) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false; render(true); closeButton.focus({ preventScroll: true });
  }
  function close() { overlay.hidden = true; previousFocus?.focus({ preventScroll: true }); previousFocus = null; }
  return { open, close, render, isOpen: () => !overlay.hidden, destroy: () => { close(); overlay.remove(); } };
}
