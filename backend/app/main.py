from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import cors_origins
from app.routers import assistant, documents, intake, plan, session

app = FastAPI(title="Civio API", version="0.1.0")

origins = cors_origins()
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

for module in (plan, intake, documents, assistant, session):
    app.include_router(module.router)


@app.get("/api/health")
async def health():
    return {"ok": True}
