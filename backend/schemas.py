from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


Resolution = Literal["480p", "720p"]
AspectRatio = Literal["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"]


class GenerateVideoRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=20_000)
    resolution: Resolution = "720p"
    aspect_ratio: AspectRatio = "16:9"
    duration: int = Field(default=5, ge=4, le=15)
    generate_audio: bool = True
    nsfw_checker: bool = False
    web_search: bool = False

    first_frame_url: HttpUrl | None = None
    last_frame_url: HttpUrl | None = None
    reference_image_urls: list[HttpUrl] = Field(default_factory=list, max_length=9)
    reference_video_urls: list[HttpUrl] = Field(default_factory=list, max_length=3)
    reference_audio_urls: list[HttpUrl] = Field(default_factory=list, max_length=3)

    @field_validator("prompt")
    @classmethod
    def _strip_prompt(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("El prompt debe tener al menos 3 caracteres.")
        return v

    @model_validator(mode="after")
    def _check_mutual_exclusivity(self) -> "GenerateVideoRequest":
        has_frame = self.first_frame_url is not None or self.last_frame_url is not None
        has_refs = bool(
            self.reference_image_urls
            or self.reference_video_urls
            or self.reference_audio_urls
        )
        if has_frame and has_refs:
            raise ValueError(
                "No puedes combinar first_frame_url/last_frame_url con reference_*_urls. "
                "Elige una sola modalidad."
            )
        return self

    def to_kie_input(self) -> dict:
        """Construye el payload `input` que espera kie.ai, omitiendo campos vacíos."""
        data: dict = {
            "prompt": self.prompt,
            "resolution": self.resolution,
            "aspect_ratio": self.aspect_ratio,
            "duration": self.duration,
            "generate_audio": self.generate_audio,
            "nsfw_checker": self.nsfw_checker,
            "web_search": self.web_search,
        }
        if self.first_frame_url:
            data["first_frame_url"] = str(self.first_frame_url)
        if self.last_frame_url:
            data["last_frame_url"] = str(self.last_frame_url)
        if self.reference_image_urls:
            data["reference_image_urls"] = [str(u) for u in self.reference_image_urls]
        if self.reference_video_urls:
            data["reference_video_urls"] = [str(u) for u in self.reference_video_urls]
        if self.reference_audio_urls:
            data["reference_audio_urls"] = [str(u) for u in self.reference_audio_urls]
        return data


class CreateTaskResponse(BaseModel):
    taskId: str


class TaskStatusResponse(BaseModel):
    taskId: str
    state: Literal["waiting", "queuing", "generating", "success", "fail", "unknown"]
    videoUrl: str | None = None
    firstFrameUrl: str | None = None
    lastFrameUrl: str | None = None
    creditsConsumed: int | None = None
    costTimeMs: int | None = None
    failCode: str | None = None
    failMsg: str | None = None
