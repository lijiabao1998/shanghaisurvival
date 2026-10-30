/** Three-step title flow, inspired by Defend Taipei's role / preferences / departure flow.
 * Presentation only: never reads/writes saves, never starts before explicit departure.
 */
export const CHARACTER_GROUPS = [
  {id:'neighbours', label:['街坊生活','街坊生活','Neighbours'], ids:['teacher','barber','student','stall']},
  {id:'workers', label:['城市工作','城市工作','City workers'], ids:['guard','rider','driver','sparky']},
  {id:'supplies', label:['照護與補給','照护与补给','Care & supplies'], ids:['nurse','hardware','pharmacy','chef']},
] as const;
export type SelectionStep = 0 | 1 | 2;
export function selectionAdvance(step:SelectionStep,selected:boolean):SelectionStep {
  return selected ? Math.min(2,step+1) as SelectionStep : step;
}
export function selectionBack(step:SelectionStep):SelectionStep {return Math.max(0,step-1) as SelectionStep;}
export function canDepart(step:SelectionStep,selected:boolean,acknowledged:boolean,overwrite:boolean):boolean {
  return step===2 && selected && (!overwrite || acknowledged);
}
type Translation = (hant:string,hans:string,en:string)=>string;
export type StagedMenuOptions = {
  roster:HTMLElement; pick:HTMLElement; next:HTMLButtonElement;
  modes:HTMLElement; note:HTMLElement; characterIds:readonly string[]; resume?:HTMLButtonElement;
  hasSave:()=>boolean; isSandbox:()=>boolean;
  translate?:Translation;
};
export function installStagedCharacterMenu(o:StagedMenuOptions) {
  const t:Translation=o.translate??((hant)=>hant);
  let step:SelectionStep=0,group=0,selected=false,acknowledged=false,disposed=false;
  const start=o.next.onclick;
  const cards=Array.from(o.roster.querySelectorAll<HTMLButtonElement>('.who'));
  const originalClicks=cards.map(c=>c.onclick);
  const chrome=document.createElement('section');chrome.id='shanghai-selection';
  const progress=document.createElement('p');progress.className='selection-progress';progress.setAttribute('aria-live','polite');
  const heading=document.createElement('h2');heading.tabIndex=-1;
  const categories=document.createElement('nav');categories.className='selection-categories';
  const summary=document.createElement('div');summary.className='selection-summary';
  const warning=document.createElement('label');warning.className='selection-overwrite';
  const checkbox=document.createElement('input');checkbox.type='checkbox';
  const warningText=document.createElement('span');warning.append(checkbox,warningText);
  const back=document.createElement('button');back.type='button';back.className='selection-back';
  chrome.append(progress,heading,categories,summary,warning,back);
  o.roster.before(chrome);
  if(o.resume){o.resume.classList.add("selection-resume");chrome.prepend(o.resume);}
  const style=document.createElement('style');style.id='shanghai-selection-style';style.textContent=`
  #shanghai-selection{margin:12px 0}#shanghai-selection [hidden]{display:none!important}
  #shanghai-selection .selection-resume{width:100%;margin-bottom:12px;background:#365447}#shanghai-selection h2{font-size:20px;margin:8px 0}#shanghai-selection .selection-progress{font-size:11px;letter-spacing:.06em;color:#b8c7ba;margin:0}
  .selection-categories{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  #shanghai-selection button{font:inherit;color:#eceddb;background:#233630;border:1px solid #678777;border-radius:7px;min-height:44px;padding:7px 9px;cursor:pointer}
  #shanghai-selection button[aria-pressed=true]{background:#4b6650;border-color:#e2ca88}
  .selection-back{margin-top:10px}.selection-summary{background:#182a26;padding:14px;border:1px solid #587267;border-radius:8px;line-height:1.6;white-space:pre-line}
  .selection-overwrite{display:flex;align-items:flex-start;gap:10px;margin-top:12px;line-height:1.5;color:#f3cf8a;font-size:13px}.selection-overwrite input{width:22px;height:22px;flex:none;margin:1px 0}
  #overlay[data-selection-step] #roster{grid-template-columns:repeat(2,minmax(0,1fr))}#overlay[data-selection-step] #roster .who[hidden]{display:none!important}
  #overlay[data-selection-step] .card{max-width:640px}#overlay[data-selection-step] #pick{min-height:0;margin:10px 0}
  #overlay[data-selection-step="0"] #campaign-mode,#overlay[data-selection-step="0"] #campaign-note,
  #overlay[data-selection-step="1"] #roster,#overlay[data-selection-step="1"] #pick,
  #overlay[data-selection-step="2"] #roster,#overlay[data-selection-step="2"] #pick,#overlay[data-selection-step="2"] #campaign-mode,#overlay[data-selection-step="2"] #campaign-note{display:none!important}
  @media(max-width:540px){#overlay[data-selection-step] .card{padding:18px 14px}#overlay[data-selection-step] .sub{font-size:12px;line-height:1.5;margin:8px 0}#overlay[data-selection-step] h1{font-size:28px}#overlay[data-selection-step] .who{padding:9px;min-height:76px}#shanghai-selection .selection-categories button{font-size:12px}#overlay[data-selection-step] #ov-btn{min-height:48px}}
  `;
  document.head.append(style);
  const overlay=o.roster.closest<HTMLElement>('#overlay');
  const categoryButtons=CHARACTER_GROUPS.map((g,i)=>{const b=document.createElement('button');b.type='button';b.onclick=()=>{group=i;render();};categories.append(b);return b;});
  cards.forEach((card,i)=>{card.onclick=e=>{originalClicks[i]?.call(card,e);selected=true;acknowledged=false;checkbox.checked=false;render();};});
  checkbox.onchange=()=>{acknowledged=checkbox.checked;updateNext();};
  function overwrite(){return o.hasSave()&&o.isSandbox();}
  function updateNext(){o.next.disabled=step===2?!canDepart(step,selected,acknowledged,overwrite()):!selected;}
  function render(focus=false){
    if(disposed)return;
    const labels=[t('選擇角色','选择角色','Choose survivor'),t('開局設定','开局设置','Game mode'),t('確認出發','确认出发','Ready to depart')];
    overlay?.setAttribute('data-selection-step',String(step));
    progress.textContent=`${step+1} / 3 · ${labels.join(' › ')}`;
    heading.textContent=labels[step];categories.hidden=step!==0;summary.hidden=step!==2;
    back.hidden=step===0;back.textContent=t('← 上一步','← 上一步','← Back');
    categories.setAttribute('aria-label',t('角色分類','角色分类','Survivor groups'));
    categoryButtons.forEach((b,i)=>{const label=CHARACTER_GROUPS[i].label;b.textContent=t(label[0],label[1],label[2]);b.setAttribute('aria-pressed',String(i===group));});
    cards.forEach((c,i)=>c.hidden=!(CHARACTER_GROUPS[group].ids as readonly string[]).includes(o.characterIds[i]));
    warning.hidden=step!==2||!overwrite();
    warningText.textContent=t('我確認：建立新沙盒將覆寫目前瀏覽器的上海沙盒存檔。','我确认：建立新沙盒将覆盖当前浏览器的上海沙盒存档。','I confirm: a new sandbox replaces this browser’s Shanghai sandbox save.');
    summary.textContent=`${o.pick.textContent??''}\n\n${o.isSandbox()?t('模式：生存沙盒','模式：生存沙盒','Mode: persistent sandbox'):t('模式：8分鐘快速撤離（不覆寫沙盒）','模式：8分钟快速撤离（不覆盖沙盒）','Mode: 8-minute evacuation (keeps sandbox save)')}\n${t('按出發才會開始；返回上一步不會改動存檔。','点击出发才会开始；返回上一步不会改动存档。','Only Depart starts a new game. Going back does not change saves.')}`;
    o.next.textContent=step===2?t('出發 ▶','出发 ▶','Depart ▶'):t('下一步 →','下一步 →','Next →');
    updateNext();if(focus){heading.focus({preventScroll:true});if(overlay)overlay.scrollTop=0;}
  }
  back.onclick=()=>{step=selectionBack(step);acknowledged=false;checkbox.checked=false;render(true);};
  o.next.onclick=e=>{if(step<2){step=selectionAdvance(step,selected);render(true);}else if(canDepart(step,selected,acknowledged,overwrite()))start?.call(o.next,e);};
  const onMode=()=>{acknowledged=false;checkbox.checked=false;render();};o.modes.addEventListener('click',onMode);
  const onLanguage=()=>render();window.addEventListener('shanghai-language-change',onLanguage);
  render();
  return {refreshLanguage:onLanguage,dispose(){if(disposed)return;disposed=true;window.removeEventListener('shanghai-language-change',onLanguage);o.modes.removeEventListener('click',onMode);if(o.resume){o.resume.classList.remove("selection-resume");o.modes.append(o.resume);}chrome.remove();style.remove();overlay?.removeAttribute('data-selection-step');cards.forEach((c,i)=>{c.hidden=false;c.onclick=originalClicks[i];});o.next.onclick=start;}};
}
