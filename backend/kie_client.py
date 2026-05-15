from typing import Any

import httpx

from .config import settings


MODEL_ID = "bytedance/seedance-2-fast"
CREATE_TASK_PATH = "/api/v1/jobs/createTask"
GET_TASK_PATH = "/api/v1/jobs/recordInfo"
UPLOAD_BASE_URL = "https://kieai.redpandaai.co"
UPLOAD_PATH = "/api/file-stream-upload"
DEFAULT_UPLOAD_FOLDER = "seedance-app"


class KieAPIError(Exception):
    def __init__(self, status_code: int, message: str, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.payload = payload


def _auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.kie_api_key}",
        "Content-Type": "application/json",
    }


def _raise_for_kie(response: httpx.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        body = {"raw": response.text}

    if response.status_code >= 400:
        msg = (
            body.get("msg")
            or body.get("message")
            or body.get("error")
            or f"HTTP {response.status_code}"
        )
        raise KieAPIError(response.status_code, str(msg), body)

    # kie.ai a veces devuelve 200 pero con code != 200 en el body.
    code = body.get("code")
    if code is not None and code != 200:
        msg = body.get("msg") or body.get("message") or f"kie code {code}"
        raise KieAPIError(int(code) if isinstance(code, int) else 500, str(msg), body)

    return body


async def create_task(input_payload: dict) -> str:
    """Crea una tarea de generación en kie.ai. Retorna el taskId."""
    payload = {"model": MODEL_ID, "input": input_payload}
    url = f"{settings.kie_base_url}{CREATE_TASK_PATH}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=_auth_headers())
    body = _raise_for_kie(resp)
    task_id = (body.get("data") or {}).get("taskId")
    if not task_id:
        raise KieAPIError(500, "Respuesta de kie.ai sin taskId", body)
    return task_id


async def upload_file(
    file_bytes: bytes,
    filename: str,
    content_type: str | None = None,
    upload_path: str = DEFAULT_UPLOAD_FOLDER,
) -> str:
    """Sube un archivo a kie.ai. Retorna la downloadUrl pública."""
    url = f"{UPLOAD_BASE_URL}{UPLOAD_PATH}"
    files = {
        "file": (filename, file_bytes, content_type or "application/octet-stream"),
    }
    data = {"uploadPath": upload_path, "fileName": filename}
    headers = {"Authorization": f"Bearer {settings.kie_api_key}"}
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(url, files=files, data=data, headers=headers)
    body = _raise_for_kie(resp)
    download_url = (body.get("data") or {}).get("downloadUrl")
    if not download_url:
        raise KieAPIError(500, "Respuesta de upload sin downloadUrl", body)
    return download_url


async def get_task(task_id: str) -> dict:
    """Consulta el estado de una tarea. Retorna el dict crudo de `data`."""
    url = f"{settings.kie_base_url}{GET_TASK_PATH}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            url, params={"taskId": task_id}, headers=_auth_headers()
        )
    body = _raise_for_kie(resp)
    data = body.get("data")
    if not data:
        raise KieAPIError(500, "Respuesta de kie.ai sin data", body)
    return data
