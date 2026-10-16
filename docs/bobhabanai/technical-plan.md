<!-- Exported from Obsidian: BanAI/12 - bobHabanai Technical Plan.md. The vault copy is the source of truth. -->
---
project: BanAI
type: plan
branch: bobHabanai
status: draft
tags: [banai, bobhabanai, phase-3, plan]
---

# bobHabanai: תוכנית טכנית (שלב 3)

**בסיס:** אבות-הטיפוס שאושרו, P1 (סביבת עבודה + שכבה B) ו-P2 (תיק נגר), מ-[[11 - bobHabanai Characterization]] ומ-[[04 - Decisions & Assumptions]]. **הגשה:** 20.10.2026. **כלל:** שכבה A לא נחתכת. כשנגמר הזמן חותכים מלמטה: קודם C, ואז B (ADR-016).

## 1. נקודת המוצא (נבדק ב-16.10)

| רכיב | מצב |
|---|---|
| `bobHabanai` (fork) | FastAPI ו-Pydantic, מנוע ops כפול (Python מוסמך + JS) עם fixtures לבדיקת זהות, צ'ט טקסט בלבד (`/api/chat`, נושא ארונות + מזג אוויר בירושלים), ‏pytest, ‏vitest ו-Playwright |
| `uxui` (גיבוי ב-fork) | viewer בסגנון אפל, ידיות, מראה, עץ, ו-47 fixtures לידיות ומראה |
| מיזוג `uxui` לתוך `bobHabanai` | **11 התנגשויות, כולן ב-UI וב-viewer** (`index.html`, ‏`main.js`, ‏`styles/*`, ‏`viewer/*`, ‏`ux.spec.js`, ‏`DESIGN.md`). ה-domain מתמזג נקי. |
| אבות-טיפוס | `prototypes/p1-workspace`, `prototypes/p2-dossier`: קוד JS עצמאי, מודל פשוט, סוכן מבוסס כללים |

## 2. החלטות ארכיטקטורה לביצוע

- **ADR-017: מודל הנתונים v2 נשאר הסכמה הקנונית עם ops.** אב-הטיפוס השתמש ב-preset כנתון. בייצור preset הוא **op** שמייצר פריטים מפורשים, כך שהסכמה נשארת מפורשת וניתנת לבדיקה. השינויים (תוספתיים, `schemaVersion: 2`):
  - `site: { ceiling, niche }`
  - `compartments[i].inserts: [{ id: 'ins_…', type: 'pulldown'|'shoes'|'trousers'|'led' }]`
  - הקלה בכלל הדלתות: עד 2 כנפיים לתא (פיצול). היום הכלל אוסר שתא יכוסה פעמיים.
  - `appearance.decor` (מזהה דקור מהקטלוג), במקום הצירופים החופשיים של צבע וגימור. הערכים המותאמים (`custom`) נשארים.
  - עובי ברירת מחדל 17 מ״מ.
  - ops חדשים: `apply_preset`, `add_insert`, `remove_insert`, `set_site`, `split_door`.
  - **כל שינוי נכנס לשני המנועים ולשני ה-fixtures** (חוק הריפו).
- **ADR-018: שכבת הייעוץ רק ב-Python.** `POST /api/advisories {design}` מחזיר `advisories[]`. הלקוח קורא לה אחרי כל שינוי, בהשהיה של כ-150 מ״ש. אין עותק ב-JS, וזה חוסך את כל עבודת הזהות בין המנועים. המחיר: תלות ברשת לייעוץ, כ-20 מ״ש מקומית. תיקון מהיר מוחזר כרשימת ops ומוחל דרך מנוע ה-JS, כמו עריכה ידנית.
- **ADR-019: תיק הנגר ב-Python, ורינדור ה-PDF ב-Chromium.** `production.py` (חלקים, פרזול, קנט, אומדן), `nesting.py` (גיליוטינה) ו-`drawings.py` (SVG) הם port של קוד P2 לפונקציות טהורות עם pytest. HTML נבנה ב-Jinja2 עם autoescape. ה-PDF עצמו נוצר ב-Chromium דרך Python Playwright (`page.pdf()`).
  - **שינוי מההמלצה הקודמת (WeasyPrint):** WeasyPrint דורש GTK/Pango, וב-Windows ההתקנה שלו שבירה. Chromium מרנדר בדיוק את ה-HTML/CSS שאושר ב-P2, כולל RTL ו-SVG, ובלי שכתוב של התבנית. המחיר: Chromium כבד יותר בפריסה ל-Railway.
  - `POST /api/dossier {design, renderPng?}` מחזיר `application/pdf`.
- **ADR-020: צ'ט שרואה את התכנון.** `/api/chat` מקבל `{messages, design, revision}` ומחזיר הצעה חתומה `{ops, baseRevision, baseHash, summary, signature}` (HMAC). `/api/proposals/apply` מחזיר 409 STALE על הצעה ישנה, לפי הפרוטוקול המקורי בסעיף 5 של architecture.md. כלים למודל: ops ו-`ask_clarification`. יועץ המלאי הוא הנחיה בהנחיית המערכת: שאלות, ובסוף הצעת `apply_preset` ו-`add_insert`. כלי מזג האוויר נשאר כביקורת מכוונת (ADR-015). הסוכן מבוסס הכללים מאב-הטיפוס **לא עובר לייצור**.
- **ADR-021: קול בלחיצה לדיבור.** `MediaRecorder` ‏(webm/opus) שולח ל-`POST /api/voice/transcribe` ‏(multipart, עד 1 MiB או 30 שניות). מפתח הלקוח עובר בגוף הבקשה כמו בצ'ט, ולא נשמר ולא נרשם בלוג. התמלול נעשה ב-OpenAI, ואת שם המודל העדכני בודקים בתיעוד בזמן המימוש. הטקסט נכנס לאותו צ'ט. אין הקראה בקול. אישור שינויים רק בלחיצה.
- **ADR-022: רינדור.** נשארים על `three-gpu-pathtracer` 0.0.26 ‏(WebGL, הוכרז כמיושן ב-upstream) עם חימום מוקדם של ה-shader. טקסטורות CC0 ו-HDR נשמרים אצלנו, בגלל ה-CSP. ה-PNG של הרינדור נשלח לתיק. אם אין WebGL2 או GPU, מוצגת הודעה ונשארים בתצוגה החיה.
- **ADR-023: ביטול/חזרה והשוואה בלקוח.** ה-store שומר snapshot לכל עריכה, ופעולות רצופות על אותו פקד מאוחדות לצעד אחד. ההשוואה (החזקה כדי לראות את הגרסה השמורה) קיימת בלקוח בלבד.
- **ADR-024: תיעוד לכל משימה (מימוש של ADR-010).**
  - hook של `post-commit` ב-git (Python) כותב לכל commit רשומה ב-`10 - Work Log`: הודעה, קבצים, שינויים, ו-ADR מתוך trailers בצורת `Decision:`.
  - ה-Stop hook הקיים כותב רק בתורות שהשתנו בהן קבצים.
  - CLAUDE.md מתעדכן להיקף החדש.

## 3. מפת מודולים

**Backend (`backend/app/`):**

| קובץ | תפקיד |
|---|---|
| `domain/schema.py`, `ops_*.py`, `validation.py` | סכמה v2, ‏ops חדשים, הכלל המוקל לדלתות |
| `domain/layout.py` | גזירת גיאומטריה מהסכמה (port של `layout()` מ-P1) |
| `advice/rules.py` | R1–R19 (port של `advisories.js`), כל כלל עם דרגת ראיה ומקור |
| `production/parts.py`, `nesting.py`, `estimate.py`, `drawings.py` | port של P2 |
| `dossier/templates/*.html.j2`, `dossier/render.py` | Jinja2 ‏(autoescape) ו-Chromium |
| `api/advisories.py`, `api/dossier.py`, `api/voice.py`, `api/proposals.py` | נתיבים חדשים |
| `agent/tools.py`, `agent/prompts.py` | כלי ops, יועץ מלאי, הצעות חתומות |

**Frontend (`frontend/src/`):**

| תיקייה | תוכן |
|---|---|
| `viewer/` | P1 `scene.js` מפוצל ל-builders (גוף, דלתות, פנים, רכיבים), ‏picking, ‏environment ו-pathtrace. זה תואם לכלל של CLAUDE.md: "builders, rendering, picking". |
| `editor/` | inspector בעברית מימין לשמאל, רכיבים, דקורים |
| `chat/` | שיחה, כרטיס הצעה, קול (`voice.js` מ-P1, עם מקליט במקום Web Speech) |
| `state/store.js` | ביטול/חזרה, revision, השוואה |
| `advice/` | פאנל הייעוץ, שמקבל נתונים מ-`/api/advisories` |

## 4. חוזי API חדשים

| שיטה | נתיב | קלט | פלט / שגיאות |
|---|---|---|---|
| POST | `/api/advisories` | `{design}` | `{advisories: [{id, level, title, body, grade, src, targets, fix?: {label, ops}}]}` |
| POST | `/api/dossier` | `{design, renderPng?}` (PNG עד 4 MiB) | `application/pdf` · 413 גדול מדי · 422 תכנון לא תקין |
| POST | `/api/chat` | `{apiKey, messages, design, revision}` | `{reply, proposal?}` |
| POST | `/api/proposals/apply` | `{design, revision, proposal}` | `{design, revision+1}` · 409 STALE · 400 חתימה |
| POST | `/api/voice/transcribe` | multipart `{apiKey, audio}` | `{text}` · 413 · 415 · 429 BUSY |

## 5. בדיקות ושערים (שלב 8)

- **pytest:**
  - ops חדשים ו-fixtures לבדיקת זהות v2
  - כללי ייעוץ: כל כלל עם תרחיש חיובי ושלילי
  - חלקים ושיבוץ: אינווריאנטים (אין חפיפה בין חלקים, kerf נשמר, כיוון הסיב נשמר, אין חלק מחוץ ללוח)
  - בדיקת עשן ל-PDF (מספר עמודים, טקסט עברי)
  - צ'ט עם OpenAI מדומה: הצעה, אישור, ביטול, 409, וכלי מזג האוויר: ירושלים כן, תל אביב לא
- **vitest:**
  - ביטול/חזרה ואיחוד צעדים
  - השוואת גרסאות
  - `diff`
  - מצב "ישנה" בכרטיס הצעה
- **Playwright** (בתוספת רגרסיה מלאה של הקיים):
  - עריכה, ייעוץ ותיקון מהיר
  - רכיבים
  - צ'ט מדומה
  - **קול עם מיקרופון מדומה** (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=fixture.wav`)
  - הורדת התיק
- **אבטחה:** `/security-review` ו-security-reviewer. ‏`npm audit` ו-`pip-audit`. בדיקות ייעודיות:
  - escaping בתבנית התיק, כי שמות מותאמים עלולים להכיל HTML
  - מגבלות גודל על אודיו ו-PNG
  - המפתח לא מופיע בלוגים ובשגיאות
  - Chromium בלי רשת: `route.abort` לכל בקשה חיצונית ב-PDF, נגד SSRF
  - rate limit לנתיבים הכבדים

## 6. git

1. מיזוג `uxui` לתוך `bobHabanai`. ב-11 ההתנגשויות `uxui` גובר, כי הקבצים האלה מוחלפים בכל מקרה בקוד P1. ה-domain מתמזג נקי.
2. commit לכל פיצ'ר (conventional commits), כל אחד עם trailer בצורת `Decision:` כשיש החלטה.
3. push ל-`fork/bobHabanai`.
4. בסוף: PR ליונתן מ-`ariel-korenn:bobHabanai` אל `JonathanZouari:dev`. יונתן מחליט.

## 7. לוח זמנים

| יום | עבודה | שער |
|---|---|---|
| **2 (16–17.10, ערב)** | מיזוג `uxui`. סכמה v2 ו-ops בשני המנועים, עם fixtures. ‏`/api/advisories`. | pytest ו-vitest ירוקים |
| **3 (18.10)** | port של P1 ל-frontend: RTL, ‏viewer, רכיבים, ייעוץ, רינדור, ביטול/חזרה. ‏port של P2 ל-Python ו-`/api/dossier`. | רגרסיה + E2E לעריכה, ייעוץ ותיק |
| **4 (19.10)** | צ'ט עם הצעות חתומות, קול. hook ל-Obsidian ו-CLAUDE.md. בדיקת אבטחה. ליטוש. | כל השערים + דוח |
| **20.10** | הגשה ו-PR | — |

**קו חיתוך:** אם יום 3 לא נסגר, הקול ויועץ המלאי בייצור יורדים, ונשארים באב-הטיפוס כהדגמה מתועדת. אם גם יום 4 לחוץ, ההשוואה מצטמצמת לביטול/חזרה בלבד.

## 8. סיכונים

| סיכון | השפעה | מענה |
|---|---|---|
| port ל-Python של חלקים, שיבוץ ושרטוטים (כ-900 שורות) לא נגמר | אין תיק אמיתי | זה הדבר הראשון ביום 3. אם צריך, שרטוטים פשוטים יותר |
| עבודת זהות כפולה בסכמה v2 | זמן | ops מינימליים. הייעוץ רק ב-Python (ADR-018) |
| Chromium בפריסה ל-Railway | תמונת deploy כבדה | פריסה ל-Railway לא בהיקף ההגשה. מקומית זה עובד |
| זמינות מודלים לאודיו ב-OpenAI | אין קול | בודקים מוקדם ביום 4. נפילה בחזרה: Web Speech כמו באב-הטיפוס |
| path tracing במחשב בלי GPU | רינדור איטי | התקדמות מוצגת, אפשר לעצור, וההדגמה עובדת גם בתצוגה החיה |
| ה-pane המוסתר מקפיא rAF בבדיקות שלי | אימות ויזואלי חלקי | Playwright מריץ דפדפן נראה, ו-hooks לבדיקה (`flush`, ‏`simulate`) |

## עדכון 16.10: ADR-025, צ'ט כשיחה ולא כתפריט

ההחלטה מעדכנת את ADR-020.
- **הנחיית המערכת של הסוכן בייצור:** עונים בשפה טבעית ומשתנה, בעברית. אין רשימות אפשרויות, כפתורים או שאלות סגורות. מבקשים רק מידע חסר, בשאלה פתוחה. מנמקים כל הצעה, כולל ההשלכות שלה, למשל רוחב התא ואלכסון ההרמה. הטקסט חייב להתאים למה שההצעה עושה בפועל.
- **בממשק:** אין שורת הצעות מתחת לצ'ט. כרטיס האישור (אישור/ביטול) נשאר.
- **בדיקות:**
  - pytest לסוכן המדומה: מלאי מטקסט חופשי, כולל מספרים במילים ("עשרה מעילים")
  - שאלת המשך רק על מה שחסר
  - אין `chips` בתגובת ה-API
  - Playwright: אין אלמנטים של הצעות ב-DOM של הצ'ט
