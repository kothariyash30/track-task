# TaskFlow Auth Testing Playbook

## Seeded accounts
See `/app/memory/test_credentials.md`.

## Quick curl smoke test
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d'=' -f2)
curl -c /tmp/c.txt -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@taskflow.com","password":"admin123"}'
curl -b /tmp/c.txt "$API/api/auth/me"
curl -b /tmp/c.txt "$API/api/admin/dashboard"
```

## Expected
- `/auth/login` -> 200 with user JSON; sets `access_token` cookie
- `/auth/me` with cookie -> 200 user JSON
- `/admin/dashboard` as admin -> 200; as employee -> 403
