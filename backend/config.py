import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    kie_api_key: str
    kie_base_url: str


def load_settings() -> Settings:
    api_key = os.getenv("KIE_API_KEY", "").strip()
    if not api_key or api_key == "YOUR_API_KEY_HERE":
        raise RuntimeError(
            "Falta KIE_API_KEY. Copia .env.example a .env y pega tu API key de kie.ai "
            "(https://kie.ai/api-key)."
        )
    base_url = os.getenv("KIE_BASE_URL", "https://api.kie.ai").rstrip("/")
    return Settings(kie_api_key=api_key, kie_base_url=base_url)


settings = load_settings()
