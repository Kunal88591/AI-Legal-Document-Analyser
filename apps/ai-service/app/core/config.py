from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "legal-ai-service"
    environment: str = "dev"

    legal_data_dir: str = "./data"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"


settings = Settings()
