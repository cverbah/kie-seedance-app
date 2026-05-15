# Kie.ai Seedance 2.0 Fast — App Local

> **Proyecto personal — uso local.** Esta es una herramienta que armé para mí, pensada para correr **únicamente en `localhost`** en mi propio computador y hacer experimentos con el modelo **Seedance 2.0 Fast** de [kie.ai](https://kie.ai). No está pensada (por ahora) para desplegarse en producción, exponerse a internet ni usarse en multiusuario. El código está público como referencia, pero úsalo bajo tu propio criterio.

App local (Python + HTML/JS) para generar videos con Seedance 2.0 Fast desde una interfaz web cómoda en `localhost`.

- Backend en Python con FastAPI que actúa como proxy local a `api.kie.ai`.
- Frontend HTML/JS vanilla servido por el mismo backend (sin build step).
- La API key vive solo en `.env` — nunca se expone al navegador ni se commitea.

### Alcance actual

- ✅ Generación de video con todos los parámetros del modelo (resolución, aspect ratio, duración, audio, NSFW, web search).
- ✅ Drag & drop de imágenes/videos/audios (se suben al endpoint de upload de kie.ai y se obtiene una URL pública temporal).
- ✅ Polling automático del estado de cada tarea y visor de video integrado.
- ✅ Historial de las últimas 10 generaciones en `localStorage`.
- ❌ No hay auth, deployment, multiusuario, base de datos ni nada de eso — y por ahora no es el objetivo.

---

## Setup

### 1. Clona o entra al directorio

```bash
cd Kie-API-gen
```

### 2. Crea un entorno virtual e instala dependencias

```bash
python -m venv .venv
source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

### 3. Configura tu API key

```bash
cp .env.example .env
```

Edita `.env` y pega tu API key de kie.ai (obténla en https://kie.ai/api-key):

```env
KIE_API_KEY=sk-tu-api-key-real-aquí
```

> ⚠️ El archivo `.env` está en `.gitignore`. **Nunca** lo subas a git.

### 4. Levanta la app

```bash
uvicorn backend.main:app --reload
```

Abre [http://localhost:8000](http://localhost:8000) en el navegador.

---

## Cómo usar

1. Escribe un **prompt** describiendo el video que quieres generar.
2. Ajusta resolución, aspect ratio, duración y opciones (audio, web search, NSFW).
3. (Opcional) Expande **Referencias** y pega URLs públicas de imágenes/videos/audios.
   - **Importante**: no puedes combinar `first_frame_url`/`last_frame_url` con las listas `reference_*_urls`.
4. Click **Generar video**. El frontend hace polling cada 3s hasta que la tarea termina.
5. Cuando esté listo, se reproduce el video y puedes descargarlo.
6. El historial de las últimas 10 generaciones queda guardado en `localStorage`.

---

## Endpoints del backend

| Método | Ruta                  | Descripción                                                   |
| ------ | --------------------- | ------------------------------------------------------------- |
| `POST` | `/api/generate`       | Crea una tarea en kie.ai. Devuelve `{ taskId }`.              |
| `GET`  | `/api/task/{task_id}` | Consulta el estado y normaliza la respuesta para el frontend. |

Ambos son simples envoltorios sobre los 2 endpoints de kie.ai:

- `POST https://api.kie.ai/api/v1/jobs/createTask`
- `GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…`

---

## Estructura

```
Kie-API-gen/
├── .env.example
├── .gitignore
├── requirements.txt
├── README.md
├── backend/
│   ├── __init__.py
│   ├── main.py          # Rutas FastAPI + sirve frontend
│   ├── kie_client.py    # Cliente httpx → api.kie.ai
│   ├── config.py        # Carga .env
│   └── schemas.py       # Validación pydantic
└── frontend/
    ├── index.html
    ├── app.js
    └── style.css
```

---

## Troubleshooting

- **`Falta KIE_API_KEY`** al arrancar → revisa que `.env` exista y tenga la key real.
- **401 Unauthorized** → la API key es inválida o expiró.
- **402 Insufficient credits** → recarga créditos en tu cuenta de kie.ai.
- **422 Validation error** → el payload no cumple alguna regla (longitud del prompt, max items, etc.).
- **El video no se ve** → la URL que devuelve kie.ai suele expirar; descárgalo cuanto antes.
