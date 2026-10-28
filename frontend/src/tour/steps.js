// The first-visit tour: which part of the page each step points at, and its text per UI language.
// Hebrew is the default (and RTL); English follows the language switch. A step with `tryIt` asks the
// customer to try the area; the tour moves on by itself once they do (Next always works too).

export const TOUR_STEPS = Object.freeze([
  { id: 'chat', target: '#chat-panel', tryIt: 'chat' },
  { id: 'manual', target: '#properties-panel', tryIt: 'manual' },
  { id: 'rotate', target: '#viewer', gesture: true, tryIt: 'rotate' },
  { id: 'examples', target: '#open-presets', tryIt: 'examples' },
  { id: 'help', target: '#open-tour' },
]);

export const TOUR_STRINGS = Object.freeze({
  he: Object.freeze({
    label: 'סיור מודרך',
    next: 'הבא',
    back: 'הקודם',
    skip: 'דלג',
    done: 'סיום',
    progress: (step, total) => `${step} מתוך ${total}`,
    steps: Object.freeze({
      chat: ['כאן מדברים עם המעצב', 'כתבו או אמרו מה אתם רוצים, והמעצב יציע שינוי. שום דבר לא משתנה עד שתאשרו.'],
      manual: ['כאן עורכים ידנית', 'מידות, דלתות, חומרים וצבעים. בחרו חלק בתצוגה או ברשימה, ושנו אותו כאן.'],
      rotate: ['כאן מסובבים את הארון', 'גררו כדי לסובב, גלגלו כדי להתקרב, ולחצו על חלק כדי לבחור אותו.'],
      examples: ['רוצים ארון מוכן?', 'בדוגמאות המוכנות יש ארונות לילדים, זוגי, מינימליסטי ועוד. בוחרים אחד וממשיכים לערוך.'],
      help: ['רוצים לראות שוב?', 'הכפתור הזה מפעיל את הסיור מחדש בכל רגע.'],
    }),
    tries: Object.freeze({
      chat: ['נסו עכשיו: לחצו על אחת ההצעות או כתבו משהו. שום דבר לא יישלח.', 'מעולה! ככה מתחילים שיחה עם המעצב.'],
      manual: ['נסו עכשיו: בחרו חלק בארון או שנו מידה.', 'מעולה! ככה עורכים ידנית.'],
      rotate: ['נסו עכשיו: גררו את הארון כדי לסובב אותו.', 'מעולה! ככה מסובבים.'],
      examples: ['נסו עכשיו: לחצו על "דוגמאות מוכנות" ובחרו ארון.', 'מעולה! הארון נטען, ואפשר להמשיך לערוך אותו.'],
    }),
  }),
  en: Object.freeze({
    label: 'Guided tour',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    done: 'Done',
    progress: (step, total) => `${step} of ${total}`,
    steps: Object.freeze({
      chat: ['Talk to the designer here', 'Type or say what you want and the designer proposes a change. Nothing changes until you confirm.'],
      manual: ['Edit by hand here', 'Dimensions, doors, materials and colours. Pick a part in the view or the list, then change it here.'],
      rotate: ['Turn the wardrobe here', 'Drag to rotate, scroll to zoom, and click a part to select it.'],
      examples: ['Want a ready-made wardrobe?', "The ready-made examples include kids', double, minimalist and more. Pick one and keep editing."],
      help: ['Want to see this again?', 'This button replays the tour at any time.'],
    }),
    tries: Object.freeze({
      chat: ['Try it: click a suggestion or type something. Nothing is sent.', "Great! That's how you start a conversation."],
      manual: ['Try it: pick a part of the wardrobe or change a size.', "Great! That's how you edit by hand."],
      rotate: ['Try it: drag the wardrobe to turn it.', "Great! That's how you turn it."],
      examples: ['Try it: click "Ready-made examples" and pick a wardrobe.', 'Great! It is loaded and ready to edit.'],
    }),
  }),
});

export const tourStrings = (language) => TOUR_STRINGS[language] ?? TOUR_STRINGS.he;
