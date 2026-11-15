import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import cors_origins
from app.routers import assistant, documents, intake, plan, reminders, session

app = FastAPI(title="Civio API", version="0.1.0")

origins = cors_origins()
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

for module in (plan, intake, documents, assistant, session, reminders):
    app.include_router(module.router)


@app.get("/api/health")
async def health():
    return {"ok": True}


# The Cloud Run image serves the Vite build and the API from the same origin.
if web_dist := os.getenv("WEB_DIST"):
    index = Path(web_dist) / "index.html"

    def frontend():
        return FileResponse(index)

    for route in ("/", "/onboarding", "/onboarding/details", "/dashboard", "/documents", "/compare"):
        app.add_api_route(route, frontend, methods=["GET", "HEAD"], include_in_schema=False)
    app.mount("/", StaticFiles(directory=web_dist), name="web")
