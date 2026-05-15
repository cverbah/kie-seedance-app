import json
from pathlib import Path

import time
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import kie_client
from .schemas import CreateTaskResponse, GenerateVideoRequest, TaskStatusResponse


app = FastAPI(title="Kie.ai Seedance 2.0 Fast — Local App")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.post("/api/generate", response_model=CreateTaskResponse)
async def generate_video(req: GenerateVideoRequest) -> CreateTaskResponse:
    try:
        task_id = await kie_client.create_task(req.to_kie_input())
    except kie_client.KieAPIError as e:
        raise HTTPException(status_code=_map_status(e.status_code), detail=e.message)
    return CreateTaskResponse(taskId=task_id)


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB
ALLOWED_MIME_PREFIXES = ("image/", "video/", "audio/")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> dict:
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith(ALLOWED_MIME_PREFIXES):
        raise HTTPException(
            status_code=415,
            detail=f"Tipo no permitido: {content_type}. Solo image/video/audio.",
        )

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="Archivo vacío.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Archivo demasiado grande (máx {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )

    safe_name = _safe_filename(file.filename or "upload.bin")
    try:
        url = await kie_client.upload_file(
            file_bytes=contents,
            filename=safe_name,
            content_type=content_type,
        )
    except kie_client.KieAPIError as e:
        raise HTTPException(status_code=_map_status(e.status_code), detail=e.message)

    return {"url": url, "fileName": safe_name, "size": len(contents), "mimeType": content_type}


def _safe_filename(name: str) -> str:
    """Prefija con timestamp + uuid corto para evitar colisiones en kie.ai."""
    base = "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in name)
    base = base.lstrip(".") or "upload.bin"
    prefix = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    return f"{prefix}-{base}"


@app.get("/api/task/{task_id}", response_model=TaskStatusResponse)
async def task_status(task_id: str) -> TaskStatusResponse:
    try:
        data = await kie_client.get_task(task_id)
    except kie_client.KieAPIError as e:
        raise HTTPException(status_code=_map_status(e.status_code), detail=e.message)

    state = data.get("state") or "unknown"
    video_url: str | None = None
    first_frame: str | None = None
    last_frame: str | None = None

    result_json_raw = data.get("resultJson")
    if result_json_raw:
        try:
            result = json.loads(result_json_raw)
            urls = result.get("resultUrls") or []
            if urls:
                video_url = urls[0]
            first_frame = result.get("firstFrameUrl")
            last_frame = result.get("lastFrameUrl")
        except (ValueError, TypeError):
            pass

    return TaskStatusResponse(
        taskId=data.get("taskId", task_id),
        state=state if state in {"waiting", "queuing", "generating", "success", "fail"} else "unknown",
        videoUrl=video_url,
        firstFrameUrl=first_frame,
        lastFrameUrl=last_frame,
        creditsConsumed=data.get("creditsConsumed"),
        costTimeMs=data.get("costTime"),
        failCode=data.get("failCode") or None,
        failMsg=data.get("failMsg") or None,
    )


def _map_status(kie_status: int) -> int:
    """Mapea códigos de kie.ai a códigos HTTP razonables para el frontend."""
    if kie_status in (400, 401, 402, 404, 422, 429):
        return kie_status
    if kie_status == 501:
        return 502  # generación falló en upstream
    return 500


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
