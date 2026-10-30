/** Preferences deliberately live outside campaign snapshots. Never migrate or clear saves here. */
export type GameLanguage = 'zh-Hant' | 'zh-Hans' | 'en';
export type GameSettings = { version:1; volume:number; muted:boolean; language:GameLanguage };
export const SETTINGS_KEY='shanghai-survivors-preferences-v1';
export function parseSettings(value:unknown):GameSettings {
  const v=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return {version:1,volume:typeof v.volume==='number'&&Number.isFinite(v.volume)?Math.max(0,Math.min(1,v.volume)):.45,
    muted:typeof v.muted==='boolean'?v.muted:false,language:v.language==='zh-Hans'||v.language==='en'?v.language:'zh-Hant'};
}
function readSettings():GameSettings {try{return parseSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)??'null'));}catch{return parseSettings(null);}}
export const gameSettings=readSettings();
export function t(hant:string,hans:string,en:string):string{return gameSettings.language==='en'?en:gameSettings.language==='zh-Hans'?hans:hant;}
export function updateSettings(patch:Partial<GameSettings>):boolean {
  Object.assign(gameSettings,parseSettings({...gameSettings,...patch}));
  let stored=true;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(gameSettings));}catch{stored=false;}
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('shanghai-settings-change',{detail:{...gameSettings}}));
  return stored;
}
export function installGameSettings(callbacks:{open:()=>void;resume:()=>void;saveReturn:()=>boolean;canOpen:()=>boolean;audioPreview:()=>void}) {
  const style=document.createElement('style');style.textContent=`
  #game-settings-button{position:fixed;z-index:38;right:calc(16px + env(safe-area-inset-right));top:calc(14px + env(safe-area-inset-top));min-height:44px;padding:9px 16px;border:1px solid #bbc5b0;background:#182822e8;color:#f2e8d0;border-radius:8px;cursor:pointer}
  #game-settings-button[hidden],#game-settings-dialog[hidden]{display:none!important}
  #game-settings-dialog{position:fixed;inset:0;z-index:100;background:#07110de6;display:grid;place-items:center;padding:calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));box-sizing:border-box;color:#eee8d8;font:15px system-ui}
  #game-settings-dialog .settings-card{width:min(400px,100%);max-height:100%;overflow:auto;box-sizing:border-box;padding:22px;border:1px solid #82977f;border-radius:12px;background:#172920;box-shadow:0 12px 60px #0009}
  #game-settings-dialog h2{margin:0 0 16px;font-size:24px}#game-settings-dialog label{display:block;margin:16px 0 8px}#game-settings-dialog button,#game-settings-dialog select{min-height:44px;border:1px solid #7d9784;border-radius:7px;background:#2c4435;color:#fff;padding:9px 12px;font:inherit;cursor:pointer}
  #game-settings-dialog select,#settings-resume,#settings-return{width:100%;margin-top:9px}#game-settings-dialog input[type=range]{width:100%;min-height:36px;accent-color:#d0b06d}#settings-mute{width:22px;height:22px;vertical-align:middle;margin-right:10px}#game-settings-dialog .settings-note{font-size:12px;color:#c1c8b8;line-height:1.5}#settings-feedback{color:#eac16e;min-height:1.2em}#game-settings-dialog :focus-visible{outline:3px solid #f4d28b;outline-offset:3px}
  @media(any-pointer:coarse){#game-settings-button{display:none}}`;
  document.head.append(style);
  const button=document.createElement('button');button.id='game-settings-button';button.type='button';button.hidden=true;document.body.append(button);
  const root=document.createElement('section');root.id='game-settings-dialog';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','settings-title');
  root.innerHTML=`<div class="settings-card"><h2 id="settings-title"></h2><label id="settings-volume-label" for="settings-volume"></label><input id="settings-volume" type="range" min="0" max="100" step="1"><label><input id="settings-mute" type="checkbox"><span id="settings-mute-label"></span></label><button id="settings-preview" type="button"></button><label id="settings-language-label" for="settings-language"></label><select id="settings-language"><option value="zh-Hant">繁體中文</option><option value="zh-Hans">简体中文</option><option value="en">English</option></select><p id="settings-scope" class="settings-note"></p><p id="settings-feedback" role="status"></p><button id="settings-resume" type="button"></button><button id="settings-return" type="button"></button><p id="settings-save-note" class="settings-note"></p></div>`;
  document.body.append(root);
  const q=<T extends HTMLElement>(id:string)=>root.querySelector<T>('#'+id)!;
  const volume=q<HTMLInputElement>('settings-volume'),mute=q<HTMLInputElement>('settings-mute'),language=q<HTMLSelectElement>('settings-language');
  let previousFocus:HTMLElement|null=null;
  function render(){button.textContent=t('☰ 選單','☰ 菜单','☰ Menu');q('settings-title').textContent=t('遊戲選單 · 已暫停','游戏菜单 · 已暂停','Game menu · Paused');q('settings-volume-label').textContent=t('音效音量','音效音量','Effects volume')+` · ${Math.round(gameSettings.volume*100)}%`;q('settings-mute-label').textContent=t('靜音','静音','Mute');q('settings-preview').textContent=t('試聽音效','试听音效','Preview sound');q('settings-language-label').textContent=t('介面語言','界面语言','Interface language');q('settings-scope').textContent=t('語言套用於選單及主要操作提示；人物故事與上海招牌保留原文。音量控制新增的簡短遊戲提示音，目前沒有背景音樂。','语言用于菜单及主要操作提示；人物故事与上海招牌保留原文。音量控制新增的简短游戏提示音，目前没有背景音乐。','Language covers menus and key controls; character stories and Shanghai signs retain their original text. Volume controls short game cues; there is no background music.');q('settings-resume').textContent=t('繼續遊戲','继续游戏','Resume game');q('settings-return').textContent=t('保存並回到開始選單','保存并回到开始菜单','Save & return to start');q('settings-save-note').textContent=t('沙盒保留現有存檔；快速挑戰不寫入沙盒。','沙盒保留现有存档；快速挑战不写入沙盒。','Sandbox keeps its save. Quick challenges never overwrite sandbox progress.');volume.value=String(Math.round(gameSettings.volume*100));mute.checked=gameSettings.muted;language.value=gameSettings.language;}
  function save(patch:Partial<GameSettings>){const ok=updateSettings(patch);render();q('settings-feedback').textContent=ok?'':t('無法記住設定，本次仍可使用。','无法记住设置，本次仍可使用。','Preferences cannot be stored; they still apply this session.');}
  volume.oninput=()=>save({volume:Number(volume.value)/100});mute.onchange=()=>save({muted:mute.checked});language.onchange=()=>{save({language:language.value as GameLanguage});window.dispatchEvent(new CustomEvent('shanghai-language-change'));};
  q('settings-preview').onclick=callbacks.audioPreview;
  function open(){if(!root.hidden||!callbacks.canOpen())return;previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;callbacks.open();window.dispatchEvent(new CustomEvent('shanghai-menu-open'));root.hidden=false;render();q('settings-resume').focus();}
  function close(){if(root.hidden)return;root.hidden=true;callbacks.resume();previousFocus?.focus();}
  button.onclick=open;q('settings-resume').onclick=close;
  q('settings-return').onclick=()=>{if(!callbacks.saveReturn())q('settings-feedback').textContent=t('存檔失敗，仍留在遊戲；請勿清除網站資料。','存档失败，仍留在游戏；请勿清除网站数据。','Save failed. You are still in the game; do not clear site data.');};
  root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const list=Array.from(root.querySelectorAll<HTMLElement>('button,select,input')).filter(x=>!x.hasAttribute('disabled'));const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  render();return {open,close,isOpen:()=>!root.hidden,setPlaying:(playing:boolean)=>{button.hidden=!playing;},refresh:render};
}
