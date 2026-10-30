/** Real milestone loader; never invents byte counts or timed percentages. */
const panel = document.querySelector<HTMLElement>('#entry-loading')!;
const status = document.querySelector<HTMLElement>('#entry-status')!;
const retry = document.querySelector<HTMLButtonElement>('#entry-retry')!;
export const paintOpportunity = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
export function loadingStage(message: string) {
  panel.hidden = false; panel.classList.remove('failed'); panel.setAttribute('aria-busy', 'true');
  status.textContent = message; retry.hidden = true;
}
export function loadingDone() { panel.hidden = true; panel.setAttribute('aria-busy', 'false'); }
export function loadingFailed(error: unknown) {
  panel.hidden = false; panel.classList.add('failed'); panel.setAttribute('aria-busy', 'false');
  status.textContent = `無法進入街區：${error instanceof Error ? error.message : String(error)}。存檔不會因重新載入而刪除。`;
  retry.hidden = false; retry.onclick = () => location.reload(); retry.focus();
}
