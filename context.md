# Контекст для продолжения

Этап 1 закрыт. Этап 2 сделан: страница `/book`. Этап 3 закрыт: схема в Supabase, миграция и сид применены. Этап 4 закрыт: сайт берёт услуги и барберов из Fastify. Этап 5 закрыт: слоты, запись, отмена и перенос идут через API. Этап 6 сделан: Mini App в `apps/miniapp` ходит в тот же API. Этап 7 сделан: бот @barberOrdabot шлёт подтверждение, отмену и перенос. Этап 8 сделан: напоминания и запрос отзыва считаются по расписанию. Этап 9 сделан: админка `/admin`. Этап 10 сделан: аналитика в `/admin/analytics`. Внутри Telegram Mini App ещё не открывали.

Читать вместе с `tasks-final.md`, `prd-final.md`, `spec-final.md`. Если лендинг и учебный план расходятся, для уже сделанной главной страницы приоритет у этого файла.

## Статус

Сделаны лендинг, страница записи, база в Supabase, API в `apps/api`, сохранение записи, Telegram Mini App, бот, расчёт напоминаний, админка и аналитика.

Запуск из корня репозитория:

```bash
npm run dev
npm run lint
npm run build
```

`npm run dev` поднимает `@barbershop/api` на порту 4000, `@barbershop/web` и `@barbershop/miniapp` на порту 5173. Если порт 3000 занят, Next берёт следующий свободный. CORS разрешает любой `http://localhost` и `http://127.0.0.1`.

## Что уже есть

Монорепозиторий npm workspaces: корневой `package.json`, пакет `@barbershop/web` в `apps/web`.

Стек лендинга:

- Next.js 16.3.8, App Router, React 19, TypeScript, ESLint
- без Tailwind
- GSAP 3.15, `@gsap/react`, Lenis 1.3
- плагины GSAP регистрируются только в `apps/web/src/lib/gsap.ts` и только из клиентских компонентов

Бренд лендинга: **Orda**, мужской груминг в Ташкенте. Язык страницы — английский. Тема одна, тёмная. Переключателя светлой темы нет.

Палитра:

- фон `#0B0B0A`, второй слой `#151513`
- тёплый светлый `#E8E1D5`
- текст `#F3F0EA`, вторичный `#96928A`
- акцент `#B58A5A`

Шрифты: Bodoni Moda для заголовков, Host Grotesk для интерфейса. Подключены через `next/font` в `layout.tsx`.

Данные-моки: `apps/web/src/data/content.ts`. Фото: `apps/web/public/images/`. Это сгенерированные кадры под палитру, не сток и не иконки.

## Состав главной

Порядок секций в `apps/web/src/app/page.tsx`:

1. `Nav` — прозрачная шапка поверх hero. Ссылки: Services, Barbers, Space, Contact. При скролле фон становится тёмным. На узком экране полноэкранное меню, не карточка.
2. `Hero` — фото на весь первый экран. Текст: Tashkent · Men's grooming, Your style. / Your standard., Book a visit, Explore the space.
3. `Statement` — «Not just a haircut. A ritual.» Слова светлеют при скролле.
4. `Services` — вертикальный список 01–05, не сетка карточек. На desktop справа меняется большое фото. На mobile строка раскрывается.
5. `Barbers` — «The hands behind the craft», 4 портрета. На desktop секция закреплена и едет вбок. На телефоне обычный горизонтальный свайп.
6. `Tashkent` — «Built in Tashkent. Made for men who move.»
7. `Space` — асимметричные фото интерьера, лёгкий параллакс у одного кадра.
8. `Signature` — единственный главный scroll-момент: фото раскрывается на весь экран, по очереди появляются Precision, Craft, Character.
9. `Proof` — один отзыв Тимура Рахимова и два кадра.
10. `Booking` — «Your next signature look starts here.»
11. `SiteFooter` — адрес, часы, Instagram, Telegram, телефон, Book a visit. `id="contact"`.

Контакты салона:

- 18 Shota Rustaveli Street, Tashkent, Uzbekistan
- Tuesday–Sunday, 11:00–21:00
- +998 71 255 18 00

Кнопки записи ведут на `/book`. Телефон в футере остаётся ссылкой `tel:+998712551800`.

Встроенной карты нет. Пункт «контакты и карта» в этапе 1 закрыт футером и городскими кадрами. Карту-iframe не возвращать: это ломает текущую композицию.

## Движение

`SmoothScroll` крутит Lenis от `gsap.ticker`. `autoRaf: false`, `lerp: 0.08`, `syncTouch: false`, `scrub: true`. Пины с `pinType: "transform"`, чтобы не было скачка вёрстки.

`prefers-reduced-motion` отключает пины, параллакс и intro. Lenis сам переходит на обычный скролл.

Не добавлять второй такой же pin, WebGL, barber pole, ножницы как графику, чёрно-красную палитру, glassmorphism и одинаковый fade-up на все блоки.

Якоря — обычные `<a href="#...">`, не `next/link`. Иначе Lenis и Next спорят за скролл.

## Проверено

Линтер и `npm run build` проходят. Проверка движения на 1440 и 390, включая reduced motion: горизонтального вылезания нет, CLS 0, скрытого текста нет.

## Что не делать вслепую

`prd-final.md` описывает MVP на русском и две темы. Для лендинга и `/book` это уже заменено брифом Orda: английский и только тёмная тема. «Любой свободный» на странице подписан Any available.

`/book` — сценарий в `apps/web/src/components/book/BookFlow.tsx`. Услуги и барберы приходят из API. Свободные часы — из `GET /api/v1/availability` и `GET /api/v1/availability/days`: шаг 15 минут, окно 11:00–21:00, обед 15:00–15:30, понедельник закрыт, горизонт 30 дней, запись не раньше чем за 30 минут. «Любой свободный» на странице подписан Any available и уходит как `barberId=any`. Подтверждение ведёт на `/booking/[token]`. Там же отмена и перенос, пока до начала больше 30 минут (`cancel_cutoff_min`). Занятый слот отвечает `409 SLOT_TAKEN`. Вёрстка сужается до одной колонки, но отдельный проход в браузере на 390 px ещё не сделан.

`packages/ui` и `packages/shared` из спецификации ещё не созданы.

## База, этап 3

Prisma 6 лежит в корне: `prisma/schema.prisma`, миграция `prisma/migrations/20261005120000_init`, сид `prisma/seed.ts`. Списки услуг и барберов на сайте идут из `GET /api/v1/services` и `GET /api/v1/barbers`. В `content.ts` остались только контакты салона и навигация. Фото услуг по-прежнему лежат в `apps/web/public/images` и подставляются по id. Запись создаётся через `POST /api/v1/bookings`, читается и меняется по `manageToken`.

`DATABASE_URL` — pooler, порт 6543. `DIRECT_URL` — session pooler, порт 5432. Оба в `.env`, файл не коммитится. `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` тоже там.

Миграция `20261005120000_init` и сид применены на Supabase: 5 услуг, 4 барбера, расписание вт–вс 11:00–21:00, настройки.

У `bookings` есть generated `time_range` и exclusion constraint `bookings_no_overlap`: две `confirmed` записи одного барбера не могут пересекаться.

Админ в сиде: логин `admin`, пароль `orda-local`. После первого входа хеш в базе — Argon2id. Старый scrypt-хеш из сида тоже принимается и сразу заменяется.

## Mini App, этап 6

`apps/miniapp` — Vite, React, `@twa-dev/sdk`. Язык английский, палитра Orda. Внутри Telegram `themeParams` подменяют цвета, имя берётся из `initData`.

`POST /api/v1/telegram/session` проверяет HMAC подписи `initData` токеном `TELEGRAM_BOT_TOKEN` и находит или создаёт клиента по `telegram_id`. Срок подписи — 24 часа. `GET /api/v1/telegram/bookings` отдаёт записи этого клиента. Запись из Mini App шлёт заголовок `x-telegram-init-data`, источник в базе — `telegram`.

Без токена бота session отвечает `503`. В обычном браузере `initData` пустой: запись идёт как гостевая, «My visits» просит открыть приложение из бота. Внутри Telegram Mini App ещё не проверяли.

## Бот, этап 7

Бот @barberOrdabot, grammY в `apps/api/src/telegram-bot.ts`. Входящие апдейты: `POST /telegram/webhook`. Пока `TELEGRAM_WEBHOOK_URL` пустой, процесс API сам опрашивает Telegram. На проде задают публичный HTTPS URL и `TELEGRAM_WEBHOOK_SECRET`.

`/start` показывает меню My visits и Book. Ссылка `https://t.me/barberOrdabot?start=b_<manageToken>` привязывает Telegram к клиенту этой записи и присылает подтверждение. Команда меню: `/start`, `/visits`. Отмена из чата — кнопка под подтверждением.

После записи, отмены и переноса сообщение уходит клиенту, если у него есть `telegram_chat_id`, и барберу, если чат привязан. Сбой Telegram не отменяет запись.

Одноразовая привязка барбера: строка в `settings`, ключ `barber_link:<code>`, значение `<barberId>|<expiresAt>`, живёт 30 минут. Ссылка `t.me/barberOrdabot?start=barber_<code>`. Код создаёт `issueBarberLinkCode`. В админке кнопка на странице кресла, `POST /api/v1/admin/barbers/:id/link`.

## Напоминания, этап 8

Поля `reminder_day_sent_at`, `reminder_30m_sent_at`, `review_requested_at`, `auto_completed_at` уже были в миграции `20261005120000_init`. Окна считает `apps/api/src/reminder-rules.ts`: за день это 23–24 часа до визита, короткое — 15–30 минут. Повтор не уходит, пока timestamp стоит. Если Telegram не принял сообщение, timestamp снимается и следующая попытка шлёт снова.

Прошедшая `confirmed` запись становится `completed`, в `auto_completed_at` пишется время. Через `review_delay_min` (60) бот просит оценку 1–5. Кнопки обрабатывает тот же бот и пишет `reviews`. Оценка от 4 попадает в публичные.

Локальный запуск: `POST /internal/notifications` с заголовком `x-cron-secret`. Секрет лежит в `.env` как `CRON_SECRET`.

Edge Function: `supabase/functions/notifications`. Cron `orda-notifications` в Supabase уже стоит на каждые 5 минут и зовёт `https://zbcnrbdaxmszqgfqneyx.supabase.co/functions/v1/notifications`. Секрет крона в vault под именем `cron_secret`. Сама функция ещё не задеплоена: CLI просит `supabase login`. После входа: `supabase functions deploy notifications --project-ref zbcnrbdaxmszqgfqneyx` и секреты функции `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`. Пока деплоя нет, крон получает 404, а рабочий прогон — локальный маршрут API.

## Админка, этап 9

Страницы в `apps/web/src/app/admin`: вход, визиты, услуги, барберы, кресло, отзывы, настройки. Язык английский, палитра Orda. Ниже 800px форма становится колонкой.

Сессия — httpOnly cookie `orda_admin` на API, HMAC, 7 дней. Секрет в `.env`: `ADMIN_SESSION_SECRET`. CORS отдаёт `credentials`, браузер шлёт cookie с `credentials: "include"`. Логин ограничен: 8 попыток за 10 минут с одного IP. Неверный пароль и пустая cookie дают 401.

Создание, перенос и отмена визита идут через те же функции, что сайт. Источник ручной записи — `admin`. Отмена из админки не упирается в 30 минут до визита. Статусы: confirmed, completed, cancelled, no_show.

Услуги и барберы: создание, правка, закрытие (`isActive: false`). Фото пишется в `apps/web/public/images/uploads` и отдаётся как `/images/uploads/...`. На кресле — неделя, обед, выходные и портфолио. Часы в базе — UTC TIME, как в сиде. Настройки читаются и пишутся в `settings`, ключи `barber_link:*` на форме скрыты.

`GET /api/v1/admin/me` без cookie — 401. Проверены вход, список, ручная запись, перенос, отмена, закрытие услуги, загрузка фото, сохранение той же недели и ссылка барбера. Тестовые строки после проверки удалены.

## Аналитика, этап 10

`GET /api/v1/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` считает период по Ташкенту, включая оба дня. Страница `/admin/analytics`, пункт Numbers. Период не длиннее года.

Выручка — сумма `total_price` у `completed`. Количество — все записи периода. Услуги считаются по каждой записи, деньги услуги — только с завершённых. Загрузка барбера — минуты `confirmed`, `completed` и `no_show` против открытых минут графика без обеда и выходных. Отмена и неявка — доля от всех записей периода. Возвращаемость — клиенты периода, у которых уже была запись `completed`, `confirmed` или `no_show` до начала периода. Heatmap — день недели и час старта по Ташкенту, без отменённых.

Сверка на четырёх записях 7–8 января 2020: выручка 200000, 4 записи, отмены 25%, неявки 25%, Азиз 135/1140 мин = 11.8%, вернулся 1 из 3. Строки после сверки удалены.

## API на Vercel

Entrypoint — `apps/api/src/index.ts`. Он сам импортирует Fastify, создаёт приложение, подключает маршруты и слушает `process.env.PORT` (локально запасной `API_PORT`, иначе 4000). `src/app.ts` удалён, чтобы детектор Vercel не выбрал его раньше `src/index.ts`. TypeScript: `NodeNext`, относительные импорты с `.js`. Fastify в зависимостях `^5.6.2`, установлен `5.12.5`.

`/health` не ходит в базу и Telegram. Если клиент Prisma не создался, остальные маршруты не вешаются, а `/health` всё равно слушает. На Vercel (`VERCEL=1`) бот не вызывает `bot.start()`: только `POST /telegram/webhook`. Long polling остаётся для локального запуска без `TELEGRAM_WEBHOOK_URL`. Секреты в `.env`, файл в `.gitignore`. В проект Vercel их кладут в Environment Variables.

`npx vercel@63.1.2 build` из `apps/api` остановился: `The specified token is not valid`. Функция на Vercel этой сборкой не создана. Локально при мёртвой базе и пустом токене бота `GET /health` ответил `200` и `{"ok":true}`.
