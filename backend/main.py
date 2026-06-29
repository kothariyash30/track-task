# Convenience shim so `uvicorn main:app` (Nixpacks/Railway default) works
# without overriding the start command. Mirrors server.py:app.
from server import app  # noqa: F401
