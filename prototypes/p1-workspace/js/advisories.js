// Advisory layer: research-backed, non-blocking guidance (R1–R15 in the characterization).
// Pure: (state, layout) → advisories[]. Every item carries its evidence grade and source,
// so the app explains why instead of claiming a design is "approved".
import { cm, PANEL, PLINTH, SLIDE_TRACK_DEPTH, PULLDOWN_WIDTH, SHOE_TIER, SHOE_TIERS, TROUSER_ZONE } from './model.js';

const LEVEL_ORDER = { critical: 0, warn: 1, info: 2 };
const HANG_DEPTH = 580; // [39]

export function advisories(state, L) {
  const out = [];
  const add = (a) => out.push(a);
  const { ceiling, niche } = state.site;
  const { W, H, D } = L;
  const hinged = state.doors.type === 'hinged';

  // R1: a carcass assembled lying down pivots on its back-bottom corner when raised.
  const diag = Math.hypot(H, D);
  const maxH = Math.floor(Math.sqrt((ceiling - 10) ** 2 - D ** 2) / 10) * 10;
  if (H > ceiling) {
    add({
      id: 'r1-over', level: 'critical', title: 'הארון גבוה מהתקרה',
      body: `גובה ${cm(H)} ס״מ מול תקרה של ${cm(ceiling)} ס״מ.`,
      grade: 'מדידה', src: 'סעיף 5.1', targets: ['carcass'],
      fix: { label: `הנמך ל-${cm(maxH)} ס״מ`, apply: (s) => { s.body.height = maxH; } },
    });
  } else if (diag + 10 > ceiling) {
    add({
      id: 'r1-lift', level: 'warn', title: 'הגוף לא יתרומם לעמידה',
      body: `גוף שהורכב בשכיבה מסתובב סביב הפינה האחורית: האלכסון ${cm(diag)} ס״מ, והתקרה ${cm(ceiling)} ס״מ. הגובה המרבי הוא ${cm(maxH)} ס״מ, ואת ההפרש סוגרים בפילר עליון.`,
      grade: 'הערכה', src: '[97]', targets: ['carcass'],
      fix: { label: `הנמך ל-${cm(maxH)} ס״מ`, apply: (s) => { s.body.height = maxH; } },
    });
  } else if (ceiling - H > 60) {
    add({
      id: 'r1-gap', level: 'info', title: `${cm(ceiling - H)} ס״מ עד התקרה`,
      body: 'מקובל לסגור את המרווח בפילר עליון או בכרכוב, אחרי שהגוף הורם למקום.',
      grade: 'כלל אצבע', src: '[97]', targets: ['carcass'],
    });
  }

  // Niche fit and fillers.
  const gap = niche - W;
  if (gap < 0) {
    add({
      id: 'niche-over', level: 'critical', title: 'הארון רחב מהנישה',
      body: `${cm(W)} ס״מ מול נישה של ${cm(niche)} ס״מ (הרוחב הקטן מבין שלוש המדידות).`,
      grade: 'מדידה', src: 'סעיף 5.1', targets: ['carcass'],
      fix: { label: `התאם ל-${cm(niche - 50)} ס״מ`, apply: (s) => { s.body.width = niche - 50; } },
    });
  } else if (hinged && gap < 40) {
    add({
      id: 'r12-filler', level: 'warn', title: 'דלת ציר צמודה לקיר',
      body: 'דלת ציר ליד קיר צריכה פילר, כדי להיפתח מעבר ל-90° בלי לשפשף את הקיר. מומלץ לפחות 2 ס״מ בכל צד.',
      grade: 'כלל אצבע', src: '[38][96]', targets: ['carcass'],
      fix: { label: `הקטן ל-${cm(niche - 50)} ס״מ`, apply: (s) => { s.body.width = niche - 50; } },
    });
  } else if (gap >= 40 && gap <= 300) {
    add({
      id: 'filler', level: 'info', title: `פילר ${cm(gap / 2)} ס״מ בכל צד`,
      body: 'הפילרים סוגרים את הנישה ומשמשים מרווח לפתיחת הדלתות. הנגר מכייל אותם במדידה באתר.',
      grade: 'כלל אצבע', src: '[96]', targets: ['carcass'],
    });
  }

  // R3 + R4 + R6: hinged doors.
  if (hinged) {
    const wide = L.doors.filter((d) => d.w > 600);
    if (wide.length) {
      const comps = [...new Set(wide.map((d) => d.comp))];
      const worst = Math.max(...wide.map((d) => d.w));
      add({
        id: 'r3-wide', level: worst > 650 ? 'warn' : 'info', title: 'דלת רחבה מדי לציר סמוי',
        body: `${wide.length === 1 ? 'דלת אחת' : `${wide.length} דלתות`} ברוחב עד ${cm(worst)} ס״מ. צירים סמויים מוגדרים עד 60 ס״מ, ו-65 עם ציר נוסף.`,
        grade: 'יצרן', src: '[3]', targets: wide.map((d) => `door:${d.id}`),
        fix: { label: 'פצל לשתי דלתות', apply: (s) => { comps.forEach((i) => { s.compartments[i].split = true; }); } },
      });
    }
    const mirror = L.doors.find((d) => d.mirror);
    const plain = L.doors.find((d) => !d.mirror) ?? L.doors[0];
    if (mirror && mirror.kg > 27.2) {
      add({
        id: 'r6-mirror', level: 'warn', title: 'דלת מראה כבדה לציר',
        body: `מראה של 4 מ״מ על לוח מוסיפה כ-10 ק״ג למ״ר. הדלת שוקלת כ-${Math.round(mirror.kg)} ק״ג, מעבר לטבלאות הצירים. בדלת כזו עדיפה הזזה במסילה של 50–100 ק״ג.`,
        grade: 'הערכה', src: '[17][13]', targets: [`door:${mirror.id}`],
        fix: { label: 'עבור לדלתות הזזה', apply: (s) => { s.doors.type = 'sliding'; } },
      });
    }
    if (plain) {
      add({
        id: 'r4-hinges', level: 'info', title: `${plain.hinges} צירים לכל דלת`,
        body: `דלת ${cm(plain.h)} ס״מ, כ-${Math.round(plain.kg)} ק״ג. המספר נקבע לפי הגובה ולפי המשקל, הגבוה מביניהם.${mirror ? ` לדלת המראה: ${mirror.hinges}.` : ''}`,
        grade: 'יצרן', src: '[3][5]', targets: L.doors.map((d) => `door:${d.id}`),
      });
    }
  }
  if (state.doors.mirror) {
    add({
      id: 'r6-safety', level: 'info', title: 'מראה עם גיבוי בטיחות',
      body: 'מראה בדלת ארון מגובה ביריעת בטיחות (סיווג EN 12600), כדי שלא תתנפץ לרסיסים.',
      grade: 'תקן', src: '[21]', targets: L.doors.filter((d) => d.mirror).map((d) => `door:${d.id}`),
    });
  }

  // R5: sliding doors take depth and limit access.
  if (L.sliding) {
    const usable = D - SLIDE_TRACK_DEPTH - PANEL;
    const hanging = L.comps.filter((c) => c.rails.length);
    if (hanging.length && usable < HANG_DEPTH) {
      add({
        id: 'r5-depth', level: 'warn', title: 'אין מספיק עומק לתלייה',
        body: `המסילות תופסות 8–10 ס״מ מהעומק. נשארים כ-${cm(usable)} ס״מ, ותלייה צריכה ${cm(HANG_DEPTH)} לפחות.`,
        grade: 'יצרן', src: '[11][15][39]', targets: hanging.map((c) => `comp:${c.index}`),
        fix: { label: `הגדל עומק ל-${cm(HANG_DEPTH + SLIDE_TRACK_DEPTH + PANEL + 3)} ס״מ`, apply: (s) => { s.body.depth = HANG_DEPTH + SLIDE_TRACK_DEPTH + PANEL + 3; } },
      });
    }
    const p = L.doors.length;
    add({
      id: 'r5-open', level: 'info', title: `${p} דלתות הזזה בחפיפה של 2 ס״מ`,
      body: `בכל רגע פתוח לכל היותר ${p === 3 ? 'שליש' : 'חצי'} מרוחב הארון.`,
      grade: 'חישוב', src: '[13][14]', targets: L.doors.map((d) => `door:${d.id}`),
    });
    // R10: drawers behind sliding doors must sit inside one door's opening.
    const overlaps = L.doors.slice(1).map((d) => [d.x0, d.x0 + 20]);
    const blocked = L.comps.filter((c) => c.drawers.length && overlaps.some(([a, b]) => a < c.x0 + c.w && b > c.x0));
    if (blocked.length) {
      add({
        id: 'r10-slide', level: 'warn', title: 'מגירות בתחום החפיפה',
        body: 'מאחורי דלתות הזזה, מגירה חייבת לשבת בתוך הפתח של דלת אחת ומחוץ לחפיפה. אחרת הדלת חוסמת אותה.',
        grade: 'יצרן', src: '[38][15]', targets: blocked.map((c) => `comp:${c.index}`),
      });
    }
  } else if (hinged && L.comps.some((c) => c.drawers.length)) {
    add({
      id: 'r10-hinge', level: 'info', title: 'מגירות מאחורי דלת ציר',
      body: 'כדי שהמגירה לא תתנגש בציר, מוסיפים ספייסר של עד 25 מ״מ בכל צד, או ציר 155° ללא בליטה.',
      grade: 'יצרן', src: '[36][37]', targets: L.comps.filter((c) => c.drawers.length).map((c) => `comp:${c.index}`),
    });
  }

  // R11: concealed runners need 11–16 mm drawer sides, so the standard 17 mm board won't do.
  const drawerComps = L.comps.filter((c) => c.drawers.length);
  if (drawerComps.length) {
    add({
      id: 'r11-runner', level: 'info', title: 'תיבות מגירה מלוח 16 מ״מ',
      body: 'מסילות סמויות דורשות דפנות מגירה של 11–16 מ״מ, ולכן לוח 17 לא מתאים. מתכננים תיבה מלוח 16, או מערכת עם דפנות מתכת. רוחב פנימי = רוחב התא פחות 42 מ״מ.',
      grade: 'יצרן', src: '[28][32]', targets: drawerComps.map((c) => `comp:${c.index}`),
    });
  }

  // R7: shelf span. R8: rail span.
  const longShelves = L.comps.filter((c) => c.shelves.length && c.w > 800);
  if (longShelves.length) {
    add({
      id: 'r7-sag', level: 'warn', title: 'מדף ארוך עלול לשקוע',
      body: `מדף של ${cm(Math.max(...longShelves.map((c) => c.w)))} ס״מ במלמין 17 מ״מ: עד כ-80 ס״מ לבגדים מקופלים, וכ-60 לספרים. זחילה לאורך זמן מקצרת עוד.`,
      grade: 'הערכה', src: '[22][25]', targets: longShelves.map((c) => `comp:${c.index}`),
      fix: { label: 'הוסף תא', apply: (s) => { s.compartments.push({ preset: 'shelves', split: false, inserts: [] }); } },
    });
  }
  const railComps = L.comps.filter((c) => c.rails.length && c.w > 800);
  if (railComps.length) {
    const worst = Math.max(...railComps.map((c) => c.w));
    add({
      id: 'r8-rail', level: worst > 1000 ? 'warn' : 'info', title: worst > 1000 ? 'מוט תלייה ארוך מדי' : 'למוט נדרשת תמיכה אמצעית',
      body: `מוט עגול 25 מ״מ: מ-80 ס״מ צריך תמיכה באמצע, ולא יותר מ-100 ס״מ בסך הכול. כאן ${cm(worst)} ס״מ.`,
      grade: 'יצרן', src: '[41]', targets: railComps.map((c) => `comp:${c.index}`),
      ...(worst > 1000 ? { fix: { label: 'הוסף תא', apply: (s) => { s.compartments.push({ preset: 'shelves', split: false, inserts: [] }); } } } : {}),
    });
  }

  // R16–R19: interior inserts.
  const floorY = (y) => PLINTH + PANEL + y;
  for (const c of L.comps) {
    const n = c.index + 1;
    const highRail = c.rails.find((y) => floorY(y) > 1900);
    if (highRail != null && !c.pulldown) {
      const fits = c.w >= PULLDOWN_WIDTH[0] && c.w <= PULLDOWN_WIDTH[1];
      add({
        id: `r16-high-${c.index}`, level: 'info', title: `מוט גבוה בתא ${n}`,
        body: `המוט בגובה ${cm(floorY(highRail))} ס״מ מהרצפה. מעל כ-190 ס״מ נוח יותר מתקן תלייה נשלף.${fits ? '' : ` המתקנים בשוק ברוחב 83–115 ס״מ, והתא ברוחב ${cm(c.w)}.`}`,
        grade: 'הערכה', src: '[43][44]', targets: [`comp:${c.index}`],
        ...(fits ? { fix: { label: 'הוסף מתקן נשלף', apply: (s) => { const t = s.compartments[c.index]; t.inserts = [...new Set([...(t.inserts ?? []), 'pulldown'])]; } } } : {}),
      });
    }
    if (c.pulldown && (c.w < PULLDOWN_WIDTH[0] || c.w > PULLDOWN_WIDTH[1])) {
      add({
        id: `r16-width-${c.index}`, level: 'warn', title: `מתקן נשלף לא בגודל התא ${n}`,
        body: `מתקני תלייה נשלפים מיוצרים ברוחב 83–115 ס״מ, והתא ברוחב ${cm(c.w)}. משנים את מספר התאים או מוותרים על המתקן.`,
        grade: 'יצרן', src: '[43]', targets: [`comp:${c.index}`],
        fix: { label: L.n > 1 && c.w < PULLDOWN_WIDTH[0] ? 'הסר תא' : 'הסר את המתקן', apply: (s) => {
          if (L.n > 1 && c.w < PULLDOWN_WIDTH[0]) s.compartments.splice(c.index === L.n - 1 ? c.index - 1 : c.index + 1, 1);
          else s.compartments[c.index].inserts = s.compartments[c.index].inserts.filter((x) => x !== 'pulldown');
        } },
      });
    }
    if (c.shoes) {
      const pairs = SHOE_TIERS * Math.floor(c.w / 220);
      add({
        id: `r17-shoes-${c.index}`, level: L.shelfDepth < 350 ? 'warn' : 'info', title: `${pairs} זוגות נעליים בתא ${n}`,
        body: `${SHOE_TIERS} קומות משופעות בגובה ${cm(SHOE_TIER)} ס״מ, בעומק ${cm(L.shelfDepth)}. מקובל: 22–26 ס״מ לקומה ו-35 ס״מ עומק לפחות.`,
        grade: 'כלל אצבע', src: '[35]', targets: [`comp:${c.index}`],
      });
    }
    if (c.trousers) {
      add({
        id: `r18-trousers-${c.index}`, level: c.w < 450 ? 'warn' : 'info', title: `מתקן מכנסיים בתא ${n}`,
        body: `נשלף מתחת למדף בגובה ${cm(floorY(TROUSER_ZONE))} ס״מ. מכנסיים מקופלים על מוט צריכים 60–70 ס״מ.${c.w < 450 ? ' התא צר מדי למתקן סטנדרטי.' : ''}`,
        grade: 'יצרן', src: '[39]', targets: [`comp:${c.index}`],
      });
    }
  }
  const lit = L.comps.filter((c) => c.led);
  if (lit.length) {
    add({
      id: 'r19-led', level: 'info', title: `תאורת LED ב-${lit.length === 1 ? 'תא אחד' : `${lit.length} תאים`}`,
      body: 'נדלקת בפתיחת הדלת (חיישן). צריך נקודת חשמל בנישה או ספק 12V מוסתר. מתאמים עם חשמלאי לפני הייצור.',
      grade: 'צ׳קליסט', src: '§6', targets: lit.map((c) => `comp:${c.index}`),
    });
  }

  // R9: hanging zone heights.
  for (const c of L.comps) {
    if (c.preset === 'long' && c.rails.length && c.rails[0] - c.hangFloor < 1400) {
      add({
        id: `r9-long-${c.index}`, level: 'warn', title: `תלייה ארוכה קצרה בתא ${c.index + 1}`,
        body: `יש ${cm(c.rails[0] - c.hangFloor)} ס״מ מתחת למוט. מעילים צריכים כ-100 ס״מ ושמלות ארוכות עד 190.`,
        grade: 'כלל אצבע', src: '[35][39]', targets: [`comp:${c.index}`],
      });
    }
    if (c.preset === 'double' && c.rails.length === 2) {
      const upper = c.rails[0] - (c.shelves[1] + PANEL);
      const lower = c.rails[1];
      const short = Math.min(upper, lower);
      if (short < 900) {
        add({
          id: `r9-double-${c.index}`, level: 'warn', title: `תלייה כפולה צפופה בתא ${c.index + 1}`,
          body: `באזור הקצר יש ${cm(short)} ס״מ. חולצה תלויה צריכה כ-80 ס״מ ועוד קולב, כלומר כ-90.`,
          grade: 'כלל אצבע', src: '[35][39][40]', targets: [`comp:${c.index}`],
        });
      }
    }
  }

  // R2: board thickness, always shown as context.
  add({
    id: 'r2-board', level: 'info', title: 'לוח 17 מ״מ',
    body: 'המלמין הסטנדרטי בישראל הוא 17 מ״מ ולא 18, בלוחות של 244×122 ס״מ. כל המידות בתכנון מחושבות לפי 17.',
    grade: 'ספק', src: '[59]–[62]', targets: ['carcass'],
  });

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
