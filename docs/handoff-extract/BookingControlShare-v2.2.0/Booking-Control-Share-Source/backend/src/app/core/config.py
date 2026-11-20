from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    HOST: str = "127.0.0.1"
    PORT: int = 8002
    RELOAD: bool = False
    CORS_ALLOW_ALL: bool = True
    API_KEY: str = ""
    DATABASE_URL: str = "sqlite+aiosqlite:///./ttdapi.db"

    ENVIRONMENT: str = "dev"

    MAX_CONCURRENT: int = 5
    TASK_TIMEOUT_SECONDS: int = 300

    HEADLESS: bool = False
    BROWSER_TIMEOUT_MS: int = 30_000
    BROWSER_LOCALE: str = "en-IN"
    TTD_LOGIN_URL: str = "https://tirupatibalaji.ap.gov.in/#/userLogin"
    # Free-tier CloakBrowser only: no license_key, no geoip. Do not add a
    # CLOAKBROWSER_LICENSE_KEY setting unless/until a paid plan is adopted.

    USE_PROXY: bool = False

    # Manual-fill instance runner (uv run ttdapi --instances)
    TTD_FORM_URL: str = ""
    RELEASE_POLL_INTERVAL_SECONDS: float = 0.5
    RELEASE_STATUS_LOG_INTERVAL_SECONDS: float = 15.0

    # Fully-automated booking mode
    LOGIN_CAPTCHA_MAX_ATTEMPTS: int = 6
    FUTURE_DARSHAN_POLL_INTERVAL_SECONDS: float = 2.0
    FUTURE_BOOKING_TASK_TIMEOUT_SECONDS: int = 86_400

    # Local, in-memory task logging only in the share build.
    LOG_LEVEL: str = "INFO"
    SERVICE_NAME: str = "booking-control-share"


settings = Settings()
