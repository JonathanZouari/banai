// What the homepage's main button does with the text in the AI field. Pure, so it is unit-tested.
import { MAX_MESSAGE_LENGTH } from '../chat/chatModel.js';

/**
 * - text  -> { kind: 'message', text }: sent to the AI designer as the first chat message.
 * - empty -> { kind: 'guided' }: the designer opens and the AI asks the questions instead.
 * Text is trimmed and capped like a chat message (the chat model enforces the same limit).
 */
export function promptIntent(raw) {
  const text = String(raw ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
  return text ? { kind: 'message', text } : { kind: 'guided' };
}
