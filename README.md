# Social Publisher

> 🇬🇧 English · 🇦🇷 [Español](README.es.md)

A personal web panel to **schedule and publish image posts** to Facebook Pages, Instagram Business/Creator accounts and Threads, using Meta's official APIs. Single user, your own accounts, your own infrastructure: no third-party scheduler in the middle.

A portfolio project, built to learn and to actually use.

## Features

- **Calendar** of scheduled, published and failed posts, with a detail view
- **Composer**: multiple images (carousel), per-network copy, publish date and time
- **Brands**: group the accounts of each business, with their own hashtags and signature
- **Automatic publishing** at the chosen time, with retries and an email alert on failure
- **Facebook, Instagram and Threads** (the code is organized per network, so adding more is straightforward)
- **Optional AI** (Claude) that suggests copy and hashtags from the image
- Mobile-friendly web UI

## Stack

| Part | Technology |
|------|------------|
| API | NestJS 12, Prisma 7, PostgreSQL, BullMQ + Redis, Vitest |
| Web | Next.js 16 (App Router), Tailwind |
| Images | Cloudflare R2 (S3-compatible) |
| Networks | Meta Graph API and Threads API |

npm workspaces monorepo: `apps/api` (API + the worker that publishes) and `apps/web`. Spec and design decisions live in [`docs/`](docs/) (written in Spanish).

---

## Tutorial: getting it running

You'll need accounts on a few services. All have free tiers that are enough for personal use. Allow about an hour the first time, most of it on the Meta app.

### 1. What you need first

| What | Used for | Required |
|------|----------|----------|
| Node 22+ and npm 12 | running the project | Yes |
| PostgreSQL 16+ | storing posts, brands and connections | Yes |
| Redis 6.2+ | publishing queue | Yes |
| A [Meta for Developers](https://developers.facebook.com) account | permission to publish to FB and IG | Yes |
| A Facebook Page (optionally an Instagram Business/Creator account linked to it) | where you publish | Yes |
| A [Cloudflare](https://dash.cloudflare.com) account with R2 | storing images behind a public URL (Meta downloads them from there) | Yes |
| An SMTP server (Gmail app password, Mailtrap, Resend, etc.) | error and publishing alerts | Yes |
| A Threads app on Meta | publishing to Threads | No |
| An [Anthropic](https://console.anthropic.com) API key | the "Suggest with AI" button | No |

> **Redis on Windows:** there is no official build. Use Redis on WSL, [Memurai](https://www.memurai.com) or Docker (`docker run -p 6379:6379 redis:8`). On Linux and macOS, use your system package.

### 2. Install

```bash
git clone <repo-url>
cd social-publisher
npx npm@latest install
```

> `npx npm@latest` is used because npm 11.4.1 hits an arborist bug in monorepos. With npm 12 or later, a plain `npm install` works.

### 3. Create the databases

In Postgres, create one database for development and one for tests:

```sql
CREATE DATABASE social_publisher;
CREATE DATABASE social_publisher_test;
```

### 4. Configure the environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.example apps/api/.env.test
cp apps/web/.env.example apps/web/.env.local
```

(On Windows PowerShell, use `Copy-Item` instead of `cp`.)

Open `apps/api/.env` and fill in every `CAMBIAR` ("change me"). The file has comments; here are the non-obvious ones:

| Variable | How to get it |
|----------|---------------|
| `DATABASE_URL` | Your Postgres user and password |
| `REDIS_URL` | `redis://localhost:6379/0` if you use the default port |
| `ADMIN_EMAIL` | The email you'll log into the panel with |
| `ADMIN_PASSWORD_HASH` | Run `npm run hash-password`, type your password (12 characters minimum) and paste the result **inside single quotes** |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `TOKEN_ENC_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Never change it afterwards**: stored tokens would become unreadable |
| `META_*` | See step 5 |
| `R2_*` | See step 6 |
| `SMTP_*` | Your mail provider's details |

In `apps/api/.env.test`, use the `social_publisher_test` database and `/1` at the end of `REDIS_URL`, so tests never touch your data.

### 5. Create the Meta app (Facebook and Instagram)

This is the longest step. At [developers.facebook.com](https://developers.facebook.com):

1. **Create an app** of type **Business** and add the **Facebook Login for Business** product
2. Permissions to request: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
3. Under **Settings > Basic**: copy the *App ID* and *App Secret* into `META_APP_ID` and `META_APP_SECRET`
4. In Facebook Login, add the **redirect URI** `http://localhost:3001/meta/callback`. It must be **identical** to `META_REDIRECT_URI` in your `.env`
5. Your Instagram account must be **Business or Creator** and **linked to a Facebook Page**
6. To publish without App Review: switch the app to **Live** mode with *Standard Access*. Meta asks for a privacy policy URL, an icon, a category and data-deletion instructions (simple pages of your own are enough). With Standard Access **you can only publish to accounts where you hold a role in the app**, which is exactly the personal use case

### 6. Create the image bucket (Cloudflare R2)

1. In Cloudflare: **R2 > Create bucket**
2. In the bucket: **Settings > Public access**, and enable the `r2.dev` domain (or connect your own). Copy the public URL into `R2_PUBLIC_BASE_URL` (no trailing slash)
3. **R2 > Manage API tokens > Create API token**, with *Object Read & Write* permission on that bucket. Copy the *Access Key ID* and *Secret* into `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
4. `R2_ACCOUNT_ID` is in the R2 sidebar, and `R2_BUCKET` is the bucket name

> The bucket must be public because Instagram and Facebook download the image from its URL. That's why the app strips EXIF/GPS metadata from the original before uploading it.

### 7. Apply the migrations

```bash
npm run db:deploy -w apps/api
```

### 8. Start everything

```bash
npm run dev
```

- Web: http://localhost:3000 (log in with `ADMIN_EMAIL` and your password)
- API: http://localhost:3001 (`GET /health` to check it)
- The **worker** also starts; it's the one that publishes at the scheduled time

### 9. First use

1. **Brands**: create a brand (name, optional hashtags and signature)
2. **Meta**: connect your Facebook account. The app fetches your Pages and linked Instagram accounts
3. In **Brands**, assign each account to its brand
4. **New post**: pick the brand, upload the image, write the copy, choose the networks and the date. Schedule it
5. The calendar shows the status; if something fails you get an email and the error details stay on the post

---

## Threads (optional)

Threads has its own login: it doesn't use the Facebook one.

1. In the same Meta app, add the **Access the Threads API** use case
2. Permissions: `threads_basic` and `threads_content_publish`
3. **Settings > Basic**: copy the *Threads app ID* and *Threads app secret* (they differ from the Meta ones)
4. Threads **redirect URI**: `http://localhost:3001/threads/callback`
5. **App roles > Threads testers**: add your profile and accept the invitation from Threads (Settings > Account > Website permissions). Without App Review you can only publish to tester profiles
6. In `apps/api/.env`, uncomment and fill `THREADS_APP_ID`, `THREADS_APP_SECRET` and `THREADS_REDIRECT_URI` (all three together)
7. Connect from the web, under **Threads**. The token lasts 60 days and the worker renews it automatically; if a profile shows "Needs reconnecting", connect it again

## AI for copywriting (optional)

Set `ANTHROPIC_API_KEY` in `apps/api/.env`. The composer then shows "Suggest with AI", which generates 2 or 3 copy variants with hashtags based on the brand and the image. Without the key the button reports it isn't configured and everything else works as usual.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| The API won't start and lists invalid variables | A `CAMBIAR` is still unfilled in `.env`, or `ADMIN_PASSWORD_HASH` lacks single quotes (the `$` breaks it) |
| Invalid `redirect_uri` when connecting Meta | The URI in the Meta app isn't identical to `META_REDIRECT_URI` |
| A post stays "scheduled" and never goes out | The worker isn't running, or Redis isn't responding |
| Instagram rejects the image | The R2 URL isn't public, or the image doesn't meet IG's aspect-ratio rules |
| My Instagram account doesn't show up | It isn't Business/Creator, or isn't linked to a Page |
| Meta says you don't have permission | The app isn't in Live mode, or your user has no role in the app |

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | API, worker and web together |
| `npm test -w apps/api` | unit tests |
| `npm run test:e2e -w apps/api` | integration tests (use the `_test` database) |
| `npm run typecheck` | API and web types |
| `npm run lint` | linter |
| `npm run hash-password` | generates your password hash |

Meta and R2 calls are mocked in tests: none of them publishes for real. More on the quality bar in [`CONSTRAINTS.md`](CONSTRAINTS.md).

## Security

- Single user; the password is stored as a bcrypt hash and the session lives in an `httpOnly` cookie
- Meta tokens are encrypted with AES-256 in the database and never logged
- Never commit your `.env`: `.gitignore` already excludes it

## Deploying to a server

It's designed to run on a VPS (PM2 or Docker + Nginx with HTTPS). When going to production, change `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` and both redirect URIs (Meta and Threads) to your real domains.

## License

[MIT](LICENSE)
