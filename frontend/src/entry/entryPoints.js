// The three ways to start (spec section 6). All of them land in the same editor and data model.
export const ENTRY_POINTS = Object.freeze([
  Object.freeze({
    id: 'guided',
    icon: 'chat',
    title: 'הדריכו אותי',
    description: 'ספרו לבוב הבנאי מה צריך להיכנס לארון, והוא יציע סידור שתאשרו.',
    action: 'מתחילים בשיחה',
    composerHint: 'ספרו על החדר: כמה רחב וגבוה הארון צריך להיות?',
  }),
  Object.freeze({
    id: 'freeText',
    icon: 'edit',
    title: 'אני אתאר',
    description: 'כתבו במילים שלכם איזה ארון אתם רוצים. בוב הבנאי הופך את זה להצעה שתאשרו.',
    action: 'כתיבת תיאור',
    composerHint: 'למשל: רוחב 240, גובה 260, לבן, שלושה תאים',
  }),
  Object.freeze({
    id: 'basic',
    icon: 'wardrobe',
    title: 'מתחילים מארון בסיסי',
    description: 'ארון סטנדרטי של ‎200 × 240 × 60‎ ס״מ, ומשם עורכים ידנית או בשיחה.',
    action: 'פתיחת הארון',
    composerHint: '',
  }),
]);

export const getEntryPoint = (id) => ENTRY_POINTS.find((entry) => entry.id === id) ?? null;
