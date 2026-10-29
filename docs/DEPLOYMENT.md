<div dir="rtl">

# פריסה לאינטרנט — KaraokeSync AI

המדריך הזה מעלה את האתר לאינטרנט **בחינם**, צעד אחר צעד. כל צעד שעולה כסף מסומן ב-💰 — ואותו עושים רק אם תחליטו.

## איך זה ייראה אחרי הפריסה

```
 משתמשים (טלפון / מחשב)
        │
        ▼
 ┌─────────────────┐     ┌──────────────────────┐
 │ האתר — Vercel   │────▶│ Supabase (ענן)       │◀──────────┐
 │ (חינם)          │     │ התחברות, מסד נתונים, │           │
 └────────┬────────┘     │ אחסון קבצים (חינם)   │           │
          │              └──────────▲───────────┘           │
          ▼                         │                       │
 ┌─────────────────┐                │            ┌──────────┴──────────┐
 │ API — Render    │────────────────┘            │ Worker (עיבוד AI)    │
 │ (חינם)          │                             │ במחשב שלכם (חינם)    │
 └─────────────────┘                             │ או בענן (💰)          │
                                                 └─────────────────────┘
```

**למה ה-Worker במחשב שלכם?** עיבוד AI צריך 2–4GB זיכרון, ואין שירות ענן שנותן את זה בחינם. ה-Worker רק "מושך" עבודות מ-Supabase — הוא לא צריך כתובת ציבורית, פתיחת פורטים או הגדרות רשת. כל עוד המחשב דולק ו-`5-start-worker.bat` פתוח, שירים מעובדים. כשהמחשב כבוי — השירים ממתינים בתור ומעובדים כשהוא חוזר.

## 💰 מה בחינם ומה עולה כסף

| רכיב | בתוכנית החינמית | מגבלות שחשוב להכיר | אם צריך יותר (💰) |
|---|---|---|---|
| **Vercel** (האתר) | Hobby — חינם | לשימוש **אישי / לא מסחרי** בלבד | Pro (לשימוש מסחרי) |
| **Supabase** | Free | מסד נתונים 500MB, אחסון ~1GB, 2 פרויקטים; **פרויקט שלא היה בו שימוש שבוע — מושהה** (הנתונים נשמרים, מפעילים מחדש בלחיצה) | Pro (~‎$25 לחודש) |
| **Render** (ה-API) | Free web service — ‏512MB | **נרדם אחרי 15 דקות בלי שימוש**; ההתעוררות לוקחת 30–60 שניות (האתר מציג הודעה "השרת מתעורר") | Starter ‏(~$7 לחודש) — לא נרדם |
| **Worker** | במחשב שלכם | עובד רק כשהמחשב דולק | שרת ענן עם 2–4GB ‏(~$25 לחודש ב-Render, או VPS זול יותר), או GPU לפי שעה |

> המחירים והמגבלות השתנו בעבר ועשויים להשתנות. הנתונים כאן נבדקו באוקטובר 2026 ממקורות משניים — **אמתו בדפי התמחור הרשמיים** (vercel.com/pricing, ‏supabase.com/pricing, ‏render.com/pricing) לפני שאתם מחליטים.

---

## שלב 0 — הכנה (פעם אחת)

1. **חשבון GitHub** עם הקוד (כבר קיים: `Shaybena90/karaokesync-ai`).
2. **ענף ייצור:** ב-GitHub ← הריפו ← **Branches** ← צרו ענף חדש בשם `main` מהענף `claude/karaokesync-ai-web-app-rm8gon`, ואז ב-**Settings ← General ← Default branch** בחרו `main`. מעכשיו Vercel ו-Render יפרסו כל שינוי שנכנס ל-`main`.
3. **פרויקט Supabase לייצור:** מומלץ פרויקט **נפרד** מזה של הפיתוח (כדי שניסויים לא יפגעו במשתמשים אמיתיים). צרו אותו כמו בשלב ב׳ ב-README, והריצו את **שלושת** קובצי ה-SQL שבתיקייה `supabase/migrations` לפי הסדר.

## שלב 1 — ה-API ב-Render (חינם)

1. היכנסו ל-render.com והתחברו עם GitHub.
2. **New ← Blueprint** ← בחרו את הריפו `karaokesync-ai`. Render ימצא את הקובץ `render.yaml` ויציע ליצור את `karaokesync-api` בתוכנית **Free**.
3. Render יבקש שלושה ערכים סודיים:

| משתנה | מה לכתוב |
|---|---|
| `SUPABASE_URL` | ה-Project URL של פרויקט הייצור |
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח ה-service_role / secret של פרויקט הייצור (**סודי**) |
| `CORS_ORIGINS` | בינתיים `https://example.com` — נחליף אחרי שלב 2 |

4. **Apply**. הבנייה הראשונה לוקחת כמה דקות. בסוף תקבלו כתובת כמו `https://karaokesync-api.onrender.com`.
5. בדיקה: פתחו בדפדפן `https://<הכתובת>/health` — צריך להופיע `{"ok":true}`.

> 🔒 השרת **מסרב לעלות** אם ההגדרות לא בטוחות (למשל `CORS_ORIGINS` עם localhost או `*`, או מפתח חסר) — ותופיע הודעה ברורה בלוגים של Render. זה מכוון.

## שלב 2 — האתר ב-Vercel (חינם)

1. היכנסו ל-vercel.com והתחברו עם GitHub ← **Add New ← Project** ← בחרו את הריפו.
2. **Root Directory:** ‏`web` (חשוב!). Framework: ‏Vite (מזוהה אוטומטית).
3. **Environment Variables** (רק משתנים ציבוריים — **לעולם לא** את ה-service_role):

| משתנה | ערך |
|---|---|
| `VITE_SUPABASE_URL` | ה-Project URL של פרויקט הייצור |
| `VITE_SUPABASE_ANON_KEY` | המפתח anon / publishable |
| `VITE_API_URL` | כתובת ה-API משלב 1 (בלי `/` בסוף) |
| `VITE_ENABLE_GOOGLE_AUTH` | `false` (או `true` אחרי שלב 5) |

4. **Deploy**. תקבלו כתובת כמו `https://karaokesync.vercel.app`.

> אם תשנו משתנה ב-Vercel, צריך **Redeploy** כדי שייכנס לתוקף (הם נצרבים בזמן הבנייה).

## שלב 3 — לחבר את החלקים

1. **Render ← karaokesync-api ← Environment:** שנו את `CORS_ORIGINS` לכתובת האתר המדויקת (למשל `https://karaokesync.vercel.app`). שמרו — השרת יעלה מחדש.
2. **Supabase ← Authentication ← URL Configuration:**
   - **Site URL:** כתובת האתר
   - **Redirect URLs:** ‏`https://karaokesync.vercel.app/**`
3. **Supabase ← Authentication ← Providers ← Email:** ודאו ש-"Confirm email" **מופעל**.

## שלב 4 — ה-Worker במחשב שלכם (חינם)

1. בקובץ `.env` במחשב — מלאו את **ערכי פרויקט הייצור** (`SUPABASE_URL`, ‏`SUPABASE_SERVICE_ROLE_KEY`). זה אותו קובץ שהשתמשתם בו בפיתוח; אם תרצו להחליף בין פיתוח לייצור, שמרו עותק של כל אחד.
2. לחיצה כפולה על `scripts\windows\5-start-worker.bat` והשאירו את החלון פתוח.
3. כדי שהמחשב לא ייכנס למצב שינה בזמן עיבוד: **הגדרות ← מערכת ← צריכת חשמל** ← "מצב שינה: אף פעם" (כשמחובר לחשמל).

> 💡 Worker שרץ גם שומר על פרויקט ה-Supabase החינמי "פעיל", כך שהוא לא יושהה אחרי שבוע.

## שלב 5 (רשות) — כניסה עם Google

1. Google Cloud Console ← צרו OAuth Client ID מסוג Web, עם Authorized redirect URI: ‏`https://<project>.supabase.co/auth/v1/callback`.
2. Supabase ← Authentication ← Providers ← Google ← הדביקו Client ID ו-Secret ← הפעילו.
3. Vercel: ‏`VITE_ENABLE_GOOGLE_AUTH=true` ← Redeploy.

## שלב 6 — בדיקה אוטומטית אחרי הפריסה ✅

הסקריפט בודק את הפריסה מבחוץ: שהאתר וה-API עונים, ש-CORS מוגדר נכון, ש**מפתח הסודי לא דלף** לקוד של האתר, שמשתמש אנונימי לא רואה נתונים (RLS), שהאחסון פרטי, שפונקציות התור לא נגישות מהדפדפן, ושאישור אימייל מופעל.

```
cd server
.venv\Scripts\python scripts\smoke_test.py --web https://karaokesync.vercel.app --api https://karaokesync-api.onrender.com
```

הסקריפט קורא את כתובת Supabase והמפתחות מ-`.env` (ולכן ודאו שהוא מכיל את ערכי הייצור). בסוף צריך להופיע `… checks passed` בלי אף `FAIL`. כל `FAIL` מסביר מה לתקן. (הבקשה הראשונה עשויה לקחת עד דקה — השרת החינמי מתעורר.)

**ואחר כך בדיקה ידנית:** הירשמו עם אימייל אמיתי, העלו שיר קצר, ובדקו שהוא עובר ל"בעיבוד" (ה-Worker במחשב), ל"מוכן", ושהנגן, העורך והייצוא עובדים. בטלפון — עברו על הרשימה ב-[docs/TESTING.md](TESTING.md), כולל "הוספה למסך הבית" (עובדת רק עכשיו, ב-HTTPS).

---

## אחרי הפריסה

- **עדכונים:** כל מיזוג ל-`main` נפרס אוטומטית ב-Vercel וב-Render.
- **פיתוח מול ייצור:** ב-Vercel, ענפים אחרים מקבלים כתובת תצוגה מקדימה ("Preview") — הגדירו להם משתני Environment של פרויקט ה-Supabase **לפיתוח** (Vercel ← Settings ← Environment Variables ← Preview).
- **אימיילים:** שירות האימייל המובנה של Supabase מוגבל למעט הודעות בשעה ומיועד לבדיקות. לפני שמזמינים משתמשים אמיתיים, הגדירו SMTP משלכם ב-Supabase ← Authentication ← Emails ← SMTP (יש ספקים עם מכסה חינמית — 💰 מעבר לה).
- **גיבויים:** בתוכנית החינמית של Supabase אין שחזור גיבויים מובנה (אמתו בדף התמחור). אם הנתונים חשובים — 💰 Pro.
- **מעבר ל-Worker בענן (💰):** אותו `server/Dockerfile` (עם `INSTALL_AI=true`) עם הפקודה `python -m karaokesync.worker.runner`, על שרת עם 2–4GB זיכרון לפחות (או GPU לעיבוד מהיר). אפשר להריץ כמה Workers במקביל — התור מונע כפילויות. **לא נוסף כאן קובץ הגדרות בתשלום — נוסיף רק באישורכם.**

## תקלות נפוצות בפריסה

| מה רואים | מה לעשות |
|---|---|
| ב-Render הלוג מראה `Unsafe production configuration` | תקנו את המשתנה שמופיע בהודעה (בדרך כלל `CORS_ORIGINS`) |
| באתר: "שרת ה-API אינו זמין" | `VITE_API_URL` ב-Vercel שגוי, או `CORS_ORIGINS` ב-Render לא תואם לכתובת האתר — הריצו את בדיקת שלב 6 |
| באתר: "האתר עדיין לא מחובר ל-Supabase" | חסרים `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` ב-Vercel ← Redeploy |
| הקישור באימייל האישור מוביל ל-localhost | Supabase ← Authentication ← URL Configuration ← Site URL |
| שירים נשארים "בתור לעיבוד" | ה-Worker לא רץ, או ש-`.env` במחשב מצביע על פרויקט Supabase אחר |
| האתר לא נטען בכלל אחרי שבוע בלי שימוש | פרויקט ה-Supabase הושהה — Supabase ← Restore project |

</div>
