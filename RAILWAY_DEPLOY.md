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

| Key | Example value |
| --- | --- |
| `MONGO_URL` | `mongodb+srv://USER:PWD@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority` |
| `DB_NAME` | `taskflow` |
| `JWT_SECRET` | a 64-char random string (e.g. `openssl rand -hex 32`) |
| `ADMIN_EMAIL` | `admin@taskflow.com` |
| `ADMIN_PASSWORD` | `<choose a strong password>` |
| `FRONTEND_URL` | URL where you host the React frontend, e.g. `https://taskflow.vercel.app`. Use `*` if you don't have one yet (Bearer-token auth still works without cookies). |

The backend refuses to boot if `MONGO_URL`, `DB_NAME` or `JWT_SECRET` is missing,
and prints a clear error message identifying the missing key.

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
