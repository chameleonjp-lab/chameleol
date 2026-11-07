// 画面の部品。文言はすべて翻訳キーで持ち、表示中の文字列を処理の条件にしない。
import { h, isolatedText, clear } from './dom.js';
import { t, getLanguage } from '../i18n/i18n.js';
import { SUPPORTED_LANGUAGES } from '../i18n/languages.js';
import { NAME_RULES, normalizeName } from '../shared/name.js';

export function button(key, onClick, { primary = false, danger = false, disabled = false, className = '', params = null, id = null, testid = null } = {}) {
  const el = h(
    'button',
    {
      type: 'button',
      class: ['btn', primary ? 'btn-primary' : '', danger ? 'btn-danger' : '', className].filter(Boolean).join(' '),
      disabled,
      id,
      'data-testid': testid ?? key,
    },
    t(key, params),
  );
  el.addEventListener('click', (e) => {
    if (el.disabled) return;
    onClick?.(e);
  });
  return el;
}

/** 確認ダイアログ。actions: [{ key, onClick, primary, danger }]。閉じる関数を返す。 */
export function dialog(host, { titleKey, title, bodyKey, body, params, actions = [], className = '' }) {
  const content = [];
  if (titleKey || title) content.push(h('h2', { class: 'dialog-title' }, title ?? t(titleKey, params)));
  if (bodyKey) content.push(h('p', { class: 'dialog-body' }, t(bodyKey, params)));
  if (body) content.push(body instanceof Node ? body : h('p', { class: 'dialog-body' }, body));
  const actionRow = h('div', { class: 'dialog-actions' });
  const overlay = h('div', { class: `dialog-overlay ${className}`, role: 'dialog', 'aria-modal': 'true' }, [h('div', { class: 'dialog' }, [...content, actionRow])]);
  const close = () => overlay.remove();
  for (const a of actions) {
    actionRow.append(
      button(a.key, () => {
        close();
        a.onClick?.();
      }, { primary: a.primary, danger: a.danger, testid: a.testid }),
    );
  }
  host.append(overlay);
  return close;
}

/** 短いお知らせ。壁とパレットを隠さない位置に出す。 */
export function toast(host, text, { duration = 1800, kind = 'info' } = {}) {
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, text);
  host.append(el);
  setTimeout(() => el.classList.add('toast-out'), duration);
  setTimeout(() => el.remove(), duration + 400);
  return el;
}

const NAME_ERRORS = {
  newline: 'name.error.newline',
  control: 'name.error.control',
  bidi_control: 'name.error.control',
  unsupported_char: 'name.error.unsupported',
  too_large: 'name.error.tooLarge',
  too_long: 'name.error.tooLong',
  grapheme_too_large: 'name.error.grapheme',
  not_text: 'name.error.unsupported',
};

/** 名前の入力欄。整理後の保存予定名と文字数を見せ、変換を隠さない。 */
export function nameField({ value = '', onChange = () => {} } = {}) {
  const input = h('input', {
    type: 'text',
    class: 'name-input',
    id: 'name-input',
    autocomplete: 'nickname',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'aria-describedby': 'name-help',
  });
  input.value = value;
  const counter = h('span', { class: 'name-counter', 'aria-live': 'polite' });
  const preview = h('p', { class: 'name-preview' });
  const error = h('p', { class: 'name-error', role: 'alert' });
  const help = h('p', { class: 'name-help', id: 'name-help' }, t('name.help'));
  const sameName = h('p', { class: 'name-same' }, t('name.sameName'));
  const wrap = h('div', { class: 'name-field' }, [
    h('label', { for: 'name-input', class: 'name-label' }, [t('name.label'), ' ', counter]),
    input,
    preview,
    error,
    help,
    sameName,
  ]);

  function refresh() {
    const r = normalizeName(input.value);
    clear(preview);
    error.textContent = '';
    if (r.ok && r.empty) {
      counter.textContent = `0/${NAME_RULES.maxGraphemes}`;
      preview.textContent = t('name.anonymous');
    } else if (r.ok) {
      counter.textContent = `${r.graphemes}/${NAME_RULES.maxGraphemes}`;
      preview.append(t('name.willSave'), ' ', isolatedText(r.name, 'name-preview-value'));
    } else {
      counter.textContent = r.graphemes ? `${r.graphemes}/${NAME_RULES.maxGraphemes}` : '';
      error.textContent = t(NAME_ERRORS[r.error] ?? 'name.error.unsupported', { max: NAME_RULES.maxGraphemes });
    }
    wrap.classList.toggle('invalid', !r.ok);
    onChange(input.value, r);
  }
  // IMEの確定前（変換中）は検査だけ。開始は「はじめる」を押した時だけ。
  input.addEventListener('input', refresh);
  input.addEventListener('compositionend', refresh);
  refresh();
  return { el: wrap, input, refresh, get value() {
    return input.value;
  } };
}

export function languageSelect({ onChange }) {
  const select = h('select', { class: 'lang-select', id: 'lang-select', 'aria-label': t('settings.language') });
  for (const lang of SUPPORTED_LANGUAGES) {
    const opt = h('option', { value: lang.id }, lang.name);
    if (lang.id === getLanguage()) opt.selected = true;
    select.append(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  return h('label', { class: 'setting-row' }, [h('span', {}, t('settings.language')), select]);
}

export function audioSettings({ mixer, onChange }) {
  const s = mixer.settings;
  const rows = ['music', 'sfx', 'ambient'].map((k) => {
    const range = h('input', { type: 'range', min: '0', max: '100', step: '5', id: `vol-${k}`, 'aria-label': t(`settings.${k}`) });
    range.value = String(Math.round(s[k] * 100));
    const out = h('output', { for: `vol-${k}` }, `${range.value}`);
    range.addEventListener('input', () => {
      out.textContent = range.value;
      onChange({ [k]: Number(range.value) / 100 });
    });
    return h('label', { class: 'setting-row' }, [h('span', {}, t(`settings.${k}`)), range, out]);
  });
  const mute = h('input', { type: 'checkbox', id: 'vol-mute' });
  mute.checked = s.muted;
  mute.addEventListener('change', () => onChange({ muted: mute.checked }));
  rows.push(h('label', { class: 'setting-row' }, [h('span', {}, t('settings.mute')), mute]));
  if (!mixer.available) rows.push(h('p', { class: 'note' }, t('settings.audioUnavailable')));
  return h('div', { class: 'settings-audio' }, rows);
}

export function section(titleKey, children, { className = '' } = {}) {
  return h('section', { class: `panel ${className}` }, [h('h2', { class: 'panel-title' }, t(titleKey)), ...children]);
}

export function backButton(onClick) {
  return button('common.back', onClick, { className: 'btn-back' });
}
