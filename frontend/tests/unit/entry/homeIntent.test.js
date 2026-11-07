import { describe, expect, it } from 'vitest';
import { promptIntent } from '../../../src/entry/homeIntent.js';
import { MAX_MESSAGE_LENGTH } from '../../../src/chat/chatModel.js';

describe('promptIntent (the homepage AI field)', () => {
  it('sends written text, trimmed, as the first chat message', () => {
    expect(promptIntent('  ארון ברוחב 240  ')).toEqual({ kind: 'message', text: 'ארון ברוחב 240' });
  });

  it('an empty or blank field starts the guided conversation instead', () => {
    expect(promptIntent('')).toEqual({ kind: 'guided' });
    expect(promptIntent('   \n ')).toEqual({ kind: 'guided' });
    expect(promptIntent(undefined)).toEqual({ kind: 'guided' });
  });

  it('caps the text at the chat message limit', () => {
    expect(promptIntent('א'.repeat(MAX_MESSAGE_LENGTH + 50)).text).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});
