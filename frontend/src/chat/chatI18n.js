// The conversation's language (ADR-029): Hebrew, English, Russian or Arabic, picked by the customer for the
// session. It drives the chat column (its texts and direction), the agent's replies, transcription and the
// spoken voice; the rest of the workspace stays Hebrew. Like the dossier on the server, Hebrew is the source:
// modules keep their Hebrew texts and pass them through ct(), which returns them in the session language.
// A text without a translation stays Hebrew (a unit test fails on that).

export const CHAT_LANGUAGES = Object.freeze(['he', 'en', 'ru', 'ar']);
export const LANGUAGE_NAMES = Object.freeze({ he: 'עברית', en: 'English', ru: 'Русский', ar: 'العربية' });
const STORAGE_KEY = 'banai.language';

let current = 'he';
const listeners = new Set();

export const getChatLanguage = () => current;
export const isRtl = (lang = current) => lang === 'he' || lang === 'ar';

/** Change the session language; listeners re-render their texts. Unknown values are ignored. */
export function setChatLanguage(lang) {
  if (!CHAT_LANGUAGES.includes(lang) || lang === current) return false;
  current = lang;
  listeners.forEach((listener) => listener(lang));
  return true;
}

export function onChatLanguage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The session language kept in this browser (storage may be blocked or tampered with). */
export function loadChatLanguage(storage = globalThis.localStorage) {
  let stored = null;
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }
  return CHAT_LANGUAGES.includes(stored) ? stored : 'he';
}

export function saveChatLanguage(lang, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, lang);
  } catch {
    // the choice then lasts until the page closes
  }
}

/** `source` (Hebrew) in the session language, with {name} placeholders filled from `params`. */
export function ct(source, params = null, lang = current) {
  const entry = lang === 'he' || !Object.hasOwn(TEXTS, source) ? null : TEXTS[source]; // never the prototype
  const text = entry ? (entry[lang] ?? source) : source;
  return params ? text.replace(/\{(\w+)\}/g, (match, key) => (Object.hasOwn(params, key) ? String(params[key]) : match)) : text;
}

/** The Hebrew sources with a translation in every language (for the completeness test). */
export const translatedSources = () => Object.keys(TEXTS);

const TEXTS = {
  // The agent and the chat header
  'בוב הבנאי': { en: 'Bob the Builder', ru: 'Боб-строитель', ar: 'بوب البنّاء' },
  'רואה את התכנון · מציע, ואתם מאשרים': { en: 'Sees your design · suggests, you approve', ru: 'Видит ваш проект · предлагает, вы утверждаете', ar: 'يرى تصميمك · يقترح، وأنت توافق' },
  'הגדרות AI': { en: 'AI settings', ru: 'Настройки ИИ', ar: 'إعدادات الذكاء الاصطناعي' },
  'חיבור מפתח OpenAI': { en: 'Connect an OpenAI key', ru: 'Подключить ключ OpenAI', ar: 'ربط مفتاح OpenAI' },
  'שפת השיחה': { en: 'Conversation language', ru: 'Язык общения', ar: 'لغة المحادثة' },
  'קול שנוצר ב-AI': { en: 'AI-generated voice', ru: 'голос, созданный ИИ', ar: 'صوت مولَّد بالذكاء الاصطناعي' },
  'תשובות לשאלות בקול מוקראות ({ai}). לחצו להשתקה': { en: 'Answers to spoken questions are read aloud ({ai}). Click to mute', ru: 'Ответы на устные вопросы зачитываются ({ai}). Нажмите, чтобы выключить звук', ar: 'تُقرأ الإجابات على الأسئلة الصوتية بصوت عالٍ ({ai}). انقر لكتم الصوت' },
  'הקראת תשובות כבויה. לחצו להפעלה': { en: 'Reading answers aloud is off. Click to turn it on', ru: 'Озвучивание ответов выключено. Нажмите, чтобы включить', ar: 'قراءة الإجابات متوقفة. انقر للتشغيل' },
  'בוב מכין תשובה קולית · {ai}': { en: 'Bob is preparing a spoken answer · {ai}', ru: 'Боб готовит голосовой ответ · {ai}', ar: 'بوب يجهّز إجابة صوتية · {ai}' },
  'בוב מדבר · {ai} · עצירה': { en: 'Bob is speaking · {ai} · stop', ru: 'Боб говорит · {ai} · стоп', ar: 'بوب يتحدث · {ai} · إيقاف' },
  // Composer and welcome
  'כתבו לבוב…': { en: 'Write to Bob…', ru: 'Напишите Бобу…', ar: 'اكتب إلى بوب…' },
  'הודעה לבוב הבנאי': { en: 'Message to Bob the Builder', ru: 'Сообщение Бобу-строителю', ar: 'رسالة إلى بوب البنّاء' },
  'שליחה': { en: 'Send', ru: 'Отправить', ar: 'إرسال' },
  'החזיקו כדי לדבר': { en: 'Hold to talk', ru: 'Удерживайте, чтобы говорить', ar: 'اضغط مطولًا للتحدث' },
  'החזיקו כדי לדבר · שחררו לשליחה': { en: 'Hold to talk · release to send', ru: 'Удерживайте, чтобы говорить · отпустите, чтобы отправить', ar: 'اضغط مطولًا للتحدث · اترك للإرسال' },
  'Enter לשליחה · Shift+Enter לשורה חדשה': { en: 'Enter to send · Shift+Enter for a new line', ru: 'Enter — отправить · Shift+Enter — новая строка', ar: 'Enter للإرسال · Shift+Enter لسطر جديد' },
  'פתיחה': { en: 'Welcome', ru: 'Начало', ar: 'البداية' },
  'מה מתכננים היום?': { en: 'What are we designing today?', ru: 'Что проектируем сегодня?', ar: 'ماذا نصمّم اليوم؟' },
  'ספרו במילים שלכם מה חשוב לכם בארון, מה צריך להיכנס אליו או מה מפריע לכם בתכנון. כל שינוי מגיע כהצעה, ושום דבר לא משתנה בלי אישור שלכם.': {
    en: 'Tell me in your own words what matters to you in the wardrobe, what needs to fit in it, or what bothers you about the design. Every change comes as a proposal, and nothing changes without your approval.',
    ru: 'Расскажите своими словами, что для вас важно в шкафу, что должно в него поместиться или что вам мешает в проекте. Каждое изменение приходит как предложение, и ничего не меняется без вашего согласия.',
    ar: 'أخبرني بكلماتك ما المهم لك في الخزانة، وما يجب أن تتسع له، أو ما يزعجك في التصميم. كل تغيير يأتي كاقتراح، ولا يتغير شيء دون موافقتك.',
  },
  'שיחה': { en: 'Conversation', ru: 'Разговор', ar: 'المحادثة' },
  'בוב כותב': { en: 'Bob is typing', ru: 'Боб пишет', ar: 'بوب يكتب' },
  // Key status
  'לא מחובר': { en: 'Not connected', ru: 'Не подключено', ar: 'غير متصل' },
  'בודק…': { en: 'Checking…', ru: 'Проверка…', ar: 'جارٍ التحقق…' },
  'המפתח מחובר': { en: 'Key connected', ru: 'Ключ подключён', ar: 'المفتاح متصل' },
  'מפתח לא תקין': { en: 'Invalid key', ru: 'Неверный ключ', ar: 'مفتاح غير صالح' },
  'המודל לא זמין': { en: 'Model unavailable', ru: 'Модель недоступна', ar: 'النموذج غير متاح' },
  'אין חיבור ל-OpenAI': { en: 'No connection to OpenAI', ru: 'Нет связи с OpenAI', ar: 'لا يوجد اتصال بـ OpenAI' },
  // Chat messages
  'הסוכן עוד לא מחובר. הוסיפו מפתח OpenAI בהגדרות AI, או המשיכו לתכנן ידנית בפאנל התכנון.': {
    en: 'The assistant is not connected yet. Add an OpenAI key in AI settings, or keep designing by hand in the design panel.',
    ru: 'Помощник ещё не подключён. Добавьте ключ OpenAI в настройках ИИ или продолжайте проектировать вручную в панели проекта.',
    ar: 'المساعد غير متصل بعد. أضف مفتاح OpenAI في إعدادات الذكاء الاصطناعي، أو تابع التصميم يدويًا في لوحة التصميم.',
  },
  'בוב הבנאי לא הצליח לענות. נסו שוב.': { en: 'Bob the Builder could not answer. Try again.', ru: 'Боб-строитель не смог ответить. Попробуйте ещё раз.', ar: 'لم يتمكن بوب البنّاء من الإجابة. حاول مرة أخرى.' },
  'התכנון השתנה מאז ההצעה. בקשו הצעה חדשה.': { en: 'The design changed since this proposal. Ask for a new one.', ru: 'Проект изменился после этого предложения. Попросите новое.', ar: 'تغيّر التصميم منذ هذا الاقتراح. اطلب اقتراحًا جديدًا.' },
  'OpenAI דחה את המפתח. בדקו אותו בהגדרות AI.': { en: 'OpenAI rejected the key. Check it in AI settings.', ru: 'OpenAI отклонил ключ. Проверьте его в настройках ИИ.', ar: 'رفضت OpenAI المفتاح. تحقق منه في إعدادات الذكاء الاصطناعي.' },
  'הוסיפו מפתח OpenAI תקין בהגדרות AI.': { en: 'Add a valid OpenAI key in AI settings.', ru: 'Добавьте действующий ключ OpenAI в настройках ИИ.', ar: 'أضف مفتاح OpenAI صالحًا في إعدادات الذكاء الاصطناعي.' },
  'למפתח שלכם אין גישה למודל השיחה.': { en: 'Your key has no access to the chat model.', ru: 'У вашего ключа нет доступа к модели чата.', ar: 'لا يملك مفتاحك صلاحية الوصول إلى نموذج المحادثة.' },
  'OpenAI מגביל כרגע את המפתח הזה, או שהמכסה נגמרה. נסו שוב מאוחר יותר.': { en: 'OpenAI is rate-limiting this key, or its quota is used up. Try again later.', ru: 'OpenAI сейчас ограничивает этот ключ, или квота исчерпана. Попробуйте позже.', ar: 'تقيّد OpenAI هذا المفتاح حاليًا، أو نفدت الحصة. حاول لاحقًا.' },
  'שירות ה-AI לא זמין כרגע. נסו שוב בעוד רגע.': { en: 'The AI service is unavailable right now. Try again in a moment.', ru: 'Сервис ИИ сейчас недоступен. Попробуйте через минуту.', ar: 'خدمة الذكاء الاصطناعي غير متاحة حاليًا. حاول بعد قليل.' },
  'התקבלה תשובה ריקה. נסו שוב.': { en: 'The answer came back empty. Try again.', ru: 'Пришёл пустой ответ. Попробуйте ещё раз.', ar: 'وصلت إجابة فارغة. حاول مرة أخرى.' },
  'בוב עסוק כרגע. נסו שוב בעוד רגע.': { en: 'Bob is busy right now. Try again in a moment.', ru: 'Боб сейчас занят. Попробуйте через минуту.', ar: 'بوب مشغول الآن. حاول بعد قليل.' },
  'ההצעה בוטלה. התכנון לא השתנה.': { en: 'Proposal cancelled. The design did not change.', ru: 'Предложение отменено. Проект не изменился.', ar: 'أُلغي الاقتراح. لم يتغير التصميم.' },
  'אושר והוחל. אפשר לבטל עם Ctrl+Z.': { en: 'Approved and applied. Ctrl+Z undoes it.', ru: 'Утверждено и применено. Отменить — Ctrl+Z.', ar: 'تمت الموافقة والتطبيق. يمكنك التراجع بـ Ctrl+Z.' },
  'התכנון השתנה מאז ההצעה, ולכן היא לא הוחלה. בקשו הצעה חדשה.': { en: 'The design changed since the proposal, so it was not applied. Ask for a new one.', ru: 'Проект изменился после предложения, поэтому оно не применено. Попросите новое.', ar: 'تغيّر التصميم منذ الاقتراح، لذلك لم يُطبَّق. اطلب اقتراحًا جديدًا.' },
  'השרת עסוק ולא החיל את ההצעה. התכנון לא השתנה; בקשו אותה שוב בעוד רגע.': { en: 'The server is busy and did not apply the proposal. The design did not change; ask again in a moment.', ru: 'Сервер занят и не применил предложение. Проект не изменился; попросите ещё раз через минуту.', ar: 'الخادم مشغول ولم يطبّق الاقتراح. لم يتغير التصميم؛ اطلبه مرة أخرى بعد قليل.' },
  'לא הצלחנו להחיל את ההצעה. התכנון לא השתנה.': { en: 'We could not apply the proposal. The design did not change.', ru: 'Не удалось применить предложение. Проект не изменился.', ar: 'تعذّر تطبيق الاقتراح. لم يتغير التصميم.' },
  // Proposal card
  'אישור': { en: 'Approve', ru: 'Утвердить', ar: 'موافقة' },
  'ביטול': { en: 'Cancel', ru: 'Отмена', ar: 'إلغاء' },
  'שינויים מוצעים': { en: 'Proposed changes', ru: 'Предлагаемые изменения', ar: 'تغييرات مقترحة' },
  'שינוי אחד': { en: 'One change', ru: 'Одно изменение', ar: 'تغيير واحد' },
  '{n} שינויים': { en: '{n} changes', ru: 'Изменений: {n}', ar: 'عدد التغييرات: {n}' },
  'עוד לא הוחל. אשרו כדי להחיל את השינויים על התכנון.': { en: 'Not applied yet. Approve to apply the changes to the design.', ru: 'Ещё не применено. Утвердите, чтобы применить изменения к проекту.', ar: 'لم يُطبَّق بعد. وافق لتطبيق التغييرات على التصميم.' },
  '+{n} אזהרה בייעוץ': { en: '+{n} advisory warning', ru: '+{n} предупреждение в советах', ar: '+{n} تحذير في الإرشادات' },
  '+{n} אזהרות בייעוץ': { en: '+{n} advisory warnings', ru: 'Новых предупреждений в советах: {n}', ar: 'تحذيرات جديدة في الإرشادات: {n}' },
  '{n} אזהרה פחות בייעוץ': { en: '{n} fewer advisory warning', ru: 'На {n} предупреждение меньше', ar: 'تحذير أقل في الإرشادات: {n}' },
  '{n} אזהרות פחות בייעוץ': { en: '{n} fewer advisory warnings', ru: 'Меньше предупреждений на {n}', ar: 'تحذيرات أقل في الإرشادات: {n}' },
  'בלי שינוי באזהרות': { en: 'No change in warnings', ru: 'Без изменений в предупреждениях', ar: 'لا تغيير في التحذيرات' },
  // Voice input
  'אין הרשאה למיקרופון. אפשרו גישה למיקרופון בהגדרות הדפדפן ונסו שוב.': { en: 'No microphone permission. Allow microphone access in the browser settings and try again.', ru: 'Нет доступа к микрофону. Разрешите его в настройках браузера и попробуйте снова.', ar: 'لا يوجد إذن للميكروفون. اسمح بالوصول إلى الميكروفون في إعدادات المتصفح وحاول مجددًا.' },
  'לא נמצא מיקרופון. חברו מיקרופון ונסו שוב.': { en: 'No microphone found. Connect one and try again.', ru: 'Микрофон не найден. Подключите его и попробуйте снова.', ar: 'لم يُعثر على ميكروفون. وصّل ميكروفونًا وحاول مجددًا.' },
  'לא הצלחנו להפעיל את המיקרופון. ייתכן שתוכנה אחרת משתמשת בו.': { en: 'We could not start the microphone. Another program may be using it.', ru: 'Не удалось включить микрофон. Возможно, его использует другая программа.', ar: 'تعذّر تشغيل الميكروفون. ربما يستخدمه برنامج آخر.' },
  'הדפדפן הזה לא תומך בהקלטת קול. אפשר להקליד את ההודעה.': { en: 'This browser cannot record voice. You can type the message.', ru: 'Этот браузер не поддерживает запись голоса. Можно напечатать сообщение.', ar: 'هذا المتصفح لا يدعم تسجيل الصوت. يمكنك كتابة الرسالة.' },
  'ההקלטה קצרה מדי. החזיקו את המיקרופון בזמן שאתם מדברים.': { en: 'The recording is too short. Hold the microphone while you speak.', ru: 'Запись слишком короткая. Удерживайте микрофон, пока говорите.', ar: 'التسجيل قصير جدًا. اضغط على الميكروفون مطولًا أثناء التحدث.' },
  'לא נשמע דיבור. נסו שוב קרוב יותר למיקרופון.': { en: 'No speech was heard. Try again closer to the microphone.', ru: 'Речь не слышна. Попробуйте ближе к микрофону.', ar: 'لم يُسمع كلام. حاول مجددًا بالقرب من الميكروفون.' },
  'ההקלטה ארוכה מדי. נסו הודעה קצרה יותר.': { en: 'The recording is too long. Try a shorter message.', ru: 'Запись слишком длинная. Попробуйте сообщение короче.', ar: 'التسجيل طويل جدًا. جرّب رسالة أقصر.' },
  'התמלול נכשל. נסו שוב.': { en: 'Transcription failed. Try again.', ru: 'Не удалось распознать речь. Попробуйте ещё раз.', ar: 'فشل التفريغ النصي. حاول مرة أخرى.' },
  'כדי לדבר עם בוב, הוסיפו מפתח OpenAI תקין בהגדרות AI.': { en: 'To talk to Bob, add a valid OpenAI key in AI settings.', ru: 'Чтобы говорить с Бобом, добавьте действующий ключ OpenAI в настройках ИИ.', ar: 'للتحدث مع بوب، أضف مفتاح OpenAI صالحًا في إعدادات الذكاء الاصطناعي.' },
  'למפתח שלכם אין גישה למודל התמלול.': { en: 'Your key has no access to the transcription model.', ru: 'У вашего ключа нет доступа к модели распознавания речи.', ar: 'لا يملك مفتاحك صلاحية الوصول إلى نموذج التفريغ النصي.' },
  'התמלול עמוס כרגע. נסו שוב בעוד רגע.': { en: 'Transcription is busy right now. Try again in a moment.', ru: 'Распознавание речи сейчас занято. Попробуйте через минуту.', ar: 'التفريغ النصي مشغول الآن. حاول بعد قليل.' },
  'פורמט ההקלטה של הדפדפן הזה לא נתמך. אפשר להקליד את ההודעה.': { en: "This browser's recording format is not supported. You can type the message.", ru: 'Формат записи этого браузера не поддерживается. Можно напечатать сообщение.', ar: 'صيغة التسجيل في هذا المتصفح غير مدعومة. يمكنك كتابة الرسالة.' },
  'שחררו כדי לבטל': { en: 'Release to cancel', ru: 'Отпустите, чтобы отменить', ar: 'اترك للإلغاء' },
  'שחררו לשליחה · גררו לביטול': { en: 'Release to send · drag away to cancel', ru: 'Отпустите — отправить · потяните в сторону — отменить', ar: 'اترك للإرسال · اسحب جانبًا للإلغاء' },
  'מקליט. לחצו שוב כדי לשלוח': { en: 'Recording. Tap again to send', ru: 'Идёт запись. Нажмите ещё раз, чтобы отправить', ar: 'جارٍ التسجيل. انقر مرة أخرى للإرسال' },
  'מתמלל…': { en: 'Transcribing…', ru: 'Распознаю…', ar: 'جارٍ التفريغ…' },
  'בוב עוד עונה. ההודעה הקולית מחכה בתיבה.': { en: 'Bob is still answering. Your voice message is waiting in the box.', ru: 'Боб ещё отвечает. Ваше голосовое сообщение ждёт в поле ввода.', ar: 'بوب ما زال يجيب. رسالتك الصوتية تنتظر في المربع.' },
  'ההודעה הקולית מחכה בתיבה. ערכו אותה ושלחו.': { en: 'Your voice message is waiting in the box. Edit it and send.', ru: 'Голосовое сообщение ждёт в поле ввода. Отредактируйте и отправьте.', ar: 'رسالتك الصوتية تنتظر في المربع. عدّلها وأرسلها.' },
  // Spoken replies
  'היי, אני בוב הבנאי. בואו נתכנן יחד ארון שמתאים בדיוק לכם.': { en: "Hi, I'm Bob the Builder. Let's design a wardrobe that fits you perfectly.", ru: 'Привет, я Боб-строитель. Давайте вместе спроектируем шкаф, который подойдёт именно вам.', ar: 'مرحبًا، أنا بوب البنّاء. هيا نصمّم معًا خزانة تناسبك تمامًا.' },
  'כדי לשמוע את בוב, הוסיפו מפתח OpenAI בהגדרות AI.': { en: 'To hear Bob, add an OpenAI key in AI settings.', ru: 'Чтобы слышать Боба, добавьте ключ OpenAI в настройках ИИ.', ar: 'لسماع بوب، أضف مفتاح OpenAI في إعدادات الذكاء الاصطناعي.' },
  'למפתח שלכם אין גישה למודל הקול. התשובה מופיעה בכתב.': { en: 'Your key has no access to the voice model. The answer is shown in writing.', ru: 'У вашего ключа нет доступа к голосовой модели. Ответ показан текстом.', ar: 'لا يملك مفتاحك صلاحية الوصول إلى نموذج الصوت. الإجابة معروضة كتابيًا.' },
  'OpenAI מגביל כרגע את המפתח הזה. התשובה מופיעה בכתב.': { en: 'OpenAI is rate-limiting this key right now. The answer is shown in writing.', ru: 'OpenAI сейчас ограничивает этот ключ. Ответ показан текстом.', ar: 'تقيّد OpenAI هذا المفتاح حاليًا. الإجابة معروضة كتابيًا.' },
  'הקול עמוס כרגע. התשובה מופיעה בכתב.': { en: 'The voice is busy right now. The answer is shown in writing.', ru: 'Голос сейчас занят. Ответ показан текстом.', ar: 'الصوت مشغول الآن. الإجابة معروضة كتابيًا.' },
  'הדפדפן לא השמיע את הקול. התשובה מופיעה בכתב.': { en: 'The browser did not play the voice. The answer is shown in writing.', ru: 'Браузер не воспроизвёл голос. Ответ показан текстом.', ar: 'لم يشغّل المتصفح الصوت. الإجابة معروضة كتابيًا.' },
  'לא הצלחנו להקריא את התשובה. היא מופיעה בכתב.': { en: 'We could not read the answer aloud. It is shown in writing.', ru: 'Не удалось озвучить ответ. Он показан текстом.', ar: 'تعذّرت قراءة الإجابة بصوت عالٍ. هي معروضة كتابيًا.' },
};
