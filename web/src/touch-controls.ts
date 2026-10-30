/**
 * Coarse-pointer controls. Joystick emits synthetic WASD / ShiftLeft key events.
 * `window` receives CustomEvent('survivor-action', { detail: { phase: 'start'|'end' } }).
 * The game chooses the contextual action on start and must release it on end.
 * Cancellation/blur/hidden UI always emit end; no attack repeats are generated here.
 * IDs: survivor-touch-controls, survivor-joystick, survivor-stick,
 * survivor-touch-action, survivor-touch-crouch, survivor-touch-menu, survivor-touch-bag.
 */
export function installTouchControls(): void {
  if (document.getElementById('survivor-touch-controls')) return;
  const style = document.createElement('style');
  style.textContent = `
    #survivor-touch-controls { display:none; pointer-events:none; position:fixed; inset:0; z-index:35; }
    @media (any-pointer:coarse) {
      #survivor-touch-controls:not([hidden]) { display:block; }
      #survivor-touch-controls button, #survivor-joystick {
        pointer-events:auto; touch-action:none; -webkit-user-select:none; user-select:none;
        -webkit-tap-highlight-color:transparent; border:1px solid #b7d5c45c;
        color:#eff6e9; background:#101d20de; box-shadow:0 4px 15px #0006;
        font:700 15px system-ui,sans-serif;
      }
      #survivor-touch-controls button { position:absolute; border-radius:50%; padding:0; min-width:48px; min-height:48px; }
      #survivor-touch-controls button:active { background:#53715a; }
      #survivor-joystick { position:absolute; width:116px; height:116px; border-radius:50%;
        left:max(18px,env(safe-area-inset-left)); bottom:calc(24px + env(safe-area-inset-bottom));
        background:radial-gradient(circle,#243831bd 0 24%,#11201eaa 25% 68%,#536b5744 69%); }
      #survivor-stick { position:absolute; left:37px; top:37px; width:40px; height:40px;
        border-radius:50%; background:#b4ccafa6; border:1px solid #e4f1d9aa; pointer-events:none; }
      #survivor-joystick::after { content:'移動 · 推到底奔跑'; position:absolute; bottom:-20px; left:-12px;
        width:140px; text-align:center; color:#c4d2c3; font:10px system-ui,sans-serif; }
      #survivor-touch-action { right:max(20px,env(safe-area-inset-right)); bottom:calc(29px + env(safe-area-inset-bottom));
        width:72px; height:72px; border-color:#edc87b!important; color:#ffe4a4!important; }
      #survivor-touch-secondary[hidden]{display:none}
      #survivor-touch-secondary { right:110px; bottom:calc(37px + env(safe-area-inset-bottom)); width:56px;height:56px;font-size:12px!important; }
      #survivor-touch-crouch { right:max(30px,env(safe-area-inset-right)); bottom:calc(115px + env(safe-area-inset-bottom)); width:52px; height:52px; }
      #survivor-touch-menu { left:calc(50% - 52px); top:calc(8px + env(safe-area-inset-top)); width:46px; height:46px; }
      #survivor-touch-bag { left:calc(50% + 4px); top:calc(8px + env(safe-area-inset-top)); width:46px; height:46px; font-size:12px!important; }
      @media (orientation:landscape) and (max-height:500px) {
        #survivor-joystick { bottom:18px; width:100px; height:100px; }
        #survivor-stick { left:29px; top:29px; }
        #survivor-touch-action { bottom:20px; }
        #survivor-touch-crouch { bottom:103px; }
      }
    }
  `;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'survivor-touch-controls';
  root.setAttribute('aria-label', '觸控操作');
  root.innerHTML = `<div id="survivor-joystick" role="group" aria-label="移動搖桿，推到底奔跑"><i id="survivor-stick"></i></div>
    <button id="survivor-touch-action" type="button" aria-label="情境互動，按住持續">互動</button>
    <button id="survivor-touch-secondary" type="button" aria-label="副手攻擊" hidden>副手</button>
    <button id="survivor-touch-crouch" type="button" aria-label="切換潛行">蹲</button>
    <button id="survivor-touch-menu" type="button" aria-label="暫停選單">☰</button>
    <button id="survivor-touch-bag" type="button" aria-label="背包">背包</button>`;
  document.body.appendChild(root);
  const joystick = root.querySelector<HTMLElement>('#survivor-joystick')!;
  const stick = root.querySelector<HTMLElement>('#survivor-stick')!;
  const action = root.querySelector<HTMLButtonElement>('#survivor-touch-action')!;
  const held = new Set<string>();
  let joystickPointer: number | null = null;
  let actionPointer: number | null = null;

  function key(code: string, down: boolean) {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
      code, key: code === 'ShiftLeft' ? 'Shift' : code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
      bubbles: true, cancelable: true,
    }));
  }
  function setHeld(next: Set<string>) {
    for (const code of held) if (!next.has(code)) { key(code, false); held.delete(code); }
    for (const code of next) if (!held.has(code)) { held.add(code); key(code, true); }
  }
  function releaseJoystick() {
    joystickPointer = null;
    setHeld(new Set());
    stick.style.transform = '';
  }
  function actionEvent(phase: 'start' | 'end') {
    window.dispatchEvent(new CustomEvent('survivor-action', { detail: { phase } }));
  }
  function releaseAction() {
    if (actionPointer === null) return;
    actionPointer = null;
    actionEvent('end');
  }
  function releaseAll() { releaseJoystick(); releaseAction(); }
  function move(e: PointerEvent) {
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * 0.36;
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    stick.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
    const next = new Set<string>();
    if (length > radius * 0.16) {
      if (dx / length > 0.35) next.add('KeyD');
      if (dx / length < -0.35) next.add('KeyA');
      if (dy / length > 0.35) next.add('KeyS');
      if (dy / length < -0.35) next.add('KeyW');
      if (length >= radius * 0.85) next.add('ShiftLeft');
    }
    setHeld(next);
  }
  joystick.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (joystickPointer !== null) return;
    joystickPointer = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    move(e);
  });
  joystick.addEventListener('pointermove', e => {
    if (e.pointerId !== joystickPointer) return;
    e.preventDefault(); move(e);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    joystick.addEventListener(name, e => { if (e.pointerId === joystickPointer) releaseJoystick(); });
    action.addEventListener(name, e => { if (e.pointerId === actionPointer) releaseAction(); });
  }
  action.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (actionPointer !== null) return;
    actionPointer = e.pointerId;
    action.setPointerCapture(e.pointerId);
    actionEvent('start');
  });
  for (const [id, code] of [
    ['survivor-touch-secondary','KeyR'], ['survivor-touch-crouch', 'KeyC'], ['survivor-touch-menu', 'Escape'], ['survivor-touch-bag', 'Tab'],
  ]) {
    root.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); releaseAll(); key(code, true); key(code, false);
    });
  }
  root.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  const overlay = document.getElementById('overlay');
  function syncOverlay() {
    const shelter=document.getElementById('shelter-panel');
    const helper=document.getElementById('helper-panel');
    root.hidden = !!overlay?.classList.contains('on') || (!!shelter && !shelter.hidden) || (!!helper && !helper.hidden);
    if (root.hidden) releaseAll();
  }
  if (overlay) new MutationObserver(syncOverlay).observe(overlay, { attributes: true, attributeFilter: ['class'] });
  syncOverlay();
}
