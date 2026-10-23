// "Printed image" for a selected door: upload a picture or pick a built-in sample. A browser-only
// preview (see viewer/prints.js): the note under the controls says what it is and is not.
import { button, el } from './fields.js';
import { PRINT_TYPES, SAMPLE_PRINTS } from '../viewer/prints.js';

export const PRINT_NOTE = 'Preview only: the image stays in your browser. It is not saved and not included in the carpenter PDF.';

/** `actions`: { upload(doorId, file) -> Promise<{ok, message?}>, sample(doorId, key), remove(doorId), applyToAll(doorId) } */
export function printControls({ doorId, print, actions }) {
  const status = el('p', { className: 'field__message print__status', attrs: { role: 'alert' } });
  const show = (message) => { status.textContent = message ?? ''; };

  const input = el('input', { className: 'print__file', attrs: { type: 'file', id: `print-file-${doorId}`, accept: PRINT_TYPES.join(',') } });
  input.dataset.testid = 'print-upload';
  input.addEventListener('change', async () => {
    const [file] = input.files;
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    show('Loading image…');
    const result = await actions.upload(doorId, file);
    show(result.ok ? '' : result.message);
  });
  const uploadLabel = el('label', { className: 'btn btn--secondary print__upload', text: 'Upload image', attrs: { for: input.id } });

  const samples = el('div', { className: 'button-row' }, SAMPLE_PRINTS.map((sample) =>
    button(sample.name, () => actions.sample(doorId, sample.key), { testId: `print-sample-${sample.key}` })));

  const current = print
    ? [
      el('p', { className: 'print__current', text: `On this door: ${print.name}` }),
      el('div', { className: 'button-row' }, [
        button('Apply to all doors', () => actions.applyToAll(doorId), { testId: 'print-apply-all' }),
        button('Remove print', () => actions.remove(doorId), { variant: 'ghost', testId: 'print-remove' }),
      ]),
    ]
    : [];

  const block = el('div', { className: 'print' }, [
    el('h4', { className: 'print__title', text: 'Printed image' }),
    el('div', { className: 'button-row' }, [input, uploadLabel]), // input first: its focus ring styles the label
    el('p', { className: 'field__label', text: 'Or choose a sample' }),
    samples,
    ...current,
    status,
    el('p', { className: 'panel__note print__note', text: PRINT_NOTE }),
  ]);
  block.dataset.testid = 'print-controls';
  return block;
}
