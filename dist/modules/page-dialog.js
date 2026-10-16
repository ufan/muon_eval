// In-page dialogs replacing window.prompt / confirm / alert, which the artifact viewer and other embeds block,
// plus a text view for exports where downloads are blocked. One shared <dialog>, created on first use; calls wait
// for each other, so two dialogs never overlap. normalizeName is pure.
const MAX_NAME = 200;

// A name typed by the user: null when cancelled, trimmed and cut to maxLength, the fallback when left empty.
export function normalizeName(raw, fallback, maxLength = MAX_NAME) {
  if (raw === null || raw === undefined) return null;
  return String(raw).trim().slice(0, maxLength) || fallback;
}

let dialog = null, queue = Promise.resolve();

function element() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'pageDialog'; dialog.className = 'page-dialog'; dialog.setAttribute('aria-labelledby', 'pageDialogText');
  dialog.innerHTML = '<form method="dialog"><p id="pageDialogText"></p><div class="page-dialog-body"></div>'
    + '<footer><span class="page-dialog-status" role="status"></span><button type="button" value="cancel" id="pageDialogCancel">取消</button>'
    + '<button type="submit" value="ok" id="pageDialogOk" class="primary">确定</button></footer></form>';
  dialog.querySelector('#pageDialogCancel').onclick = () => dialog.close('cancel');
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close('cancel'); });
  document.body.append(dialog);
  return dialog;
}

// Shows the dialog set up by fill() and resolves with read(returnValue) once it closes.
function show(fill, read) {
  const run = () => new Promise(resolve => {
    const d = element(), body = d.querySelector('.page-dialog-body');
    body.replaceChildren(); d.querySelector('.page-dialog-status').textContent = '';
    d.classList.remove('danger', 'wide');
    fill(d, body);
    d.returnValue = '';
    d.addEventListener('close', () => resolve(read(d.returnValue, body)), { once: true });
    d.showModal();
    (body.querySelector('input,[data-action]') ?? d.querySelector('#pageDialogOk')).focus({ preventScroll: true });
  });
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

function setButtons(d, { message, ok = '确定', cancel = '取消', danger = false }) {
  d.querySelector('#pageDialogText').textContent = message;
  d.querySelector('#pageDialogOk').textContent = ok;
  const cancelButton = d.querySelector('#pageDialogCancel');
  cancelButton.hidden = cancel === null; cancelButton.textContent = cancel ?? '';
  d.classList.toggle('danger', danger);
}

export const pageConfirm = (message, { ok = '继续', danger = false } = {}) =>
  show(d => setButtons(d, { message, ok, danger }), value => value === 'ok');

export const pageAlert = message => show(d => setButtons(d, { message, ok: '知道了', cancel: null }), () => undefined);

export const pagePrompt = (message, value = '', { maxLength = MAX_NAME } = {}) => show((d, body) => {
  setButtons(d, { message });
  const input = document.createElement('input');
  input.type = 'text'; input.value = value; input.maxLength = maxLength; input.setAttribute('aria-label', message);
  body.append(input); queueMicrotask(() => input.select());
}, (result, body) => normalizeName(result === 'ok' ? body.querySelector('input').value : null, value, maxLength));

// A read-only text with 复制 and 下载: the fallback when the viewer blocks file downloads.
export const pageText = (message, text, { filename = 'export.json', type = 'application/json' } = {}) => show((d, body) => {
  setButtons(d, { message, ok: '关闭', cancel: null }); d.classList.add('wide');
  const area = document.createElement('textarea'), actions = document.createElement('div'), status = d.querySelector('.page-dialog-status');
  area.readOnly = true; area.value = text; area.rows = 14; area.spellcheck = false; area.setAttribute('aria-label', message);
  actions.className = 'page-dialog-actions';
  actions.innerHTML = '<button type="button" data-action="copy">复制全部</button><button type="button" data-action="download">下载文件</button>';
  actions.querySelector('[data-action="copy"]').onclick = async () => {
    area.focus(); area.select();
    try { await navigator.clipboard.writeText(text); status.textContent = '已复制'; return; } catch {}
    try { if (document.execCommand('copy')) { status.textContent = '已复制'; return; } } catch {}
    status.textContent = '已选中全部文本，请按 Ctrl+C（⌘C）复制';
  };
  actions.querySelector('[data-action="download"]').onclick = () => downloadText(text, filename, type);
  body.append(area, actions); queueMicrotask(() => { area.scrollTop = 0; area.setSelectionRange(0, 0); });
}, () => undefined);

export function downloadText(text, filename, type = 'application/json') {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type })); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
