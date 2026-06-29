# Deploying TaskFlow on Railway

This guide gets the FastAPI backend running on Railway. The React frontend is
typically deployed on Vercel/Netlify and pointed at the Railway backend URL.

## 1. MongoDB

Railway does not bundle MongoDB. Create a free MongoDB Atlas cluster:

1. https://www.mongodb.com/cloud/atlas → create a free M0 cluster.
2. Database Access → add user/password.
3. Network Access → add IP `0.0.0.0/0` (Railway uses dynamic egress IPs).
4. Copy the connection string (Drivers → Python). It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority`

## 2. Create the Railway service

1. New Project → Deploy from GitHub repo → select your TaskFlow repo.
2. After it imports, open the service → **Settings**:
   - **Root Directory**: `backend`
   - **Build / Start commands**: leave empty (the included `Procfile` and
     `nixpacks.toml` handle this — Python 3.11.15 + `uvicorn server:app`).
3. **Generate a public Domain** in Settings → Networking → Public Networking.

## 3. Environment Variables (Service → Variables)

**Only `MONGO_URL` is strictly required.** Everything else has a sensible default.

| Key | Required? | Example value | Notes |
| --- | --- | --- | --- |
| `MONGO_URL` | **YES** | `mongodb+srv://USER:PWD@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority` | MongoDB connection string |
| `DB_NAME` | optional | `taskflow` | Defaults to `taskflow` if unset |
| `JWT_SECRET` | optional but **recommended** | 64-char hex (`openssl rand -hex 32`) | Auto-generated at boot if unset; logging out / restarting will invalidate tokens unless you set it |
| `ADMIN_EMAIL` | optional | `admin@taskflow.com` | Seeded admin email; defaults to `admin@taskflow.com` |
| `ADMIN_PASSWORD` | optional | strong password | Seeded admin password; defaults to `admin123` (change ASAP) |
| `FRONTEND_URL` | optional | `https://taskflow.vercel.app` or `*` | CORS origin; `*` disables credentials but Bearer tokens still work |

The backend refuses to boot only if `MONGO_URL` is missing, and prints the exact
variable name in the error.

## 4. Trigger a deploy

Push to the connected branch — Railway will redeploy with the `python311`
runtime, install `requirements.txt`, and start with
`uvicorn server:app --host 0.0.0.0 --port $PORT`.

## 5. Verify

After the deploy turns green:

```
curl https://<your-railway-domain>/health
# → {"status":"ok"}

curl https://<your-railway-domain>/api/health
# → {"status":"ok","db":"ok"}

curl -X POST https://<your-railway-domain>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@taskflow.com","password":"<your ADMIN_PASSWORD>"}'
# → {"id":"...","email":"...","role":"admin","access_token":"..."}
```

## 6. Wire up the frontend

In your frontend host (Vercel/Netlify), set:

```
REACT_APP_BACKEND_URL=https://<your-railway-domain>
```

…and redeploy the frontend. Login flows then go through Railway.

## Common Railway failures and fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Could not import module "main"` | Start command points to `main:app` but no entrypoint exists | Already fixed — `backend/main.py` re-exports `app` from `server.py` |
| `RuntimeError: Missing required environment variable 'MONGO_URL'` | env var not set | Add it in Service → Variables |
| `ServerSelectionTimeoutError` on startup | Mongo Atlas IP allow-list blocks Railway | Add `0.0.0.0/0` in Atlas Network Access |
| CORS error in browser console | `FRONTEND_URL` not set or wrong | Set it to your exact frontend origin (no trailing slash), or `*` |
| 502 on first request | App still booting | Wait ~30s on first deploy; check `/health` |
