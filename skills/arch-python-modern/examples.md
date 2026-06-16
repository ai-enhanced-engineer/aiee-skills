# Modern Python Standards - Examples

## Modern Python Project Structure

```
myproject/
├── pyproject.toml
├── src/
│   └── myproject/
│       ├── __init__.py
│       ├── domain/
│       │   ├── __init__.py
│       │   └── model.py
│       ├── service_layer/
│       │   └── services.py
│       └── adapters/
│           └── repository.py
└── tests/
    ├── unit/
    │   └── test_model.py
    └── integration/
        └── test_repository.py
```

## Type-Safe Configuration

```python
from dataclasses import dataclass
from pathlib import Path
import tomllib

@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    name: str
    user: str
    password: str

    @property
    def url(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.name}"

@dataclass(frozen=True)
class AppConfig:
    debug: bool
    database: DatabaseConfig
    log_level: str = "INFO"

    @classmethod
    def from_toml(cls, path: Path) -> "AppConfig":
        with path.open("rb") as f:
            data = tomllib.load(f)

        return cls(
            debug=data.get("debug", False),
            log_level=data.get("log_level", "INFO"),
            database=DatabaseConfig(**data["database"])
        )
```

## Async HTTP Client

```python
import asyncio
from dataclasses import dataclass
import aiohttp
from typing import Any

@dataclass
class APIClient:
    base_url: str
    timeout: float = 30.0

    async def get(self, path: str) -> dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{path}"
            async with session.get(url, timeout=self.timeout) as response:
                response.raise_for_status()
                return await response.json()

    async def post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{path}"
            async with session.post(url, json=data, timeout=self.timeout) as response:
                response.raise_for_status()
                return await response.json()


async def fetch_users_and_posts(client: APIClient) -> tuple[list, list]:
    """Fetch users and posts concurrently."""
    users, posts = await asyncio.gather(
        client.get("/users"),
        client.get("/posts"),
    )
    return users, posts
```

## Repository with Type Hints

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TypeVar, Generic
from uuid import UUID

T = TypeVar("T")

class Repository(ABC, Generic[T]):
    @abstractmethod
    async def get(self, id: UUID) -> T | None:
        ...

    @abstractmethod
    async def add(self, entity: T) -> None:
        ...

    @abstractmethod
    async def update(self, entity: T) -> None:
        ...

    @abstractmethod
    async def delete(self, id: UUID) -> None:
        ...


@dataclass
class User:
    id: UUID
    email: str
    name: str


class UserRepository(Repository[User]):
    def __init__(self, session):
        self._session = session

    async def get(self, id: UUID) -> User | None:
        result = await self._session.execute(
            "SELECT * FROM users WHERE id = $1", id
        )
        row = result.fetchone()
        return User(**row) if row else None

    async def add(self, entity: User) -> None:
        await self._session.execute(
            "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)",
            entity.id, entity.email, entity.name
        )

    async def update(self, entity: User) -> None:
        await self._session.execute(
            "UPDATE users SET email = $2, name = $3 WHERE id = $1",
            entity.id, entity.email, entity.name
        )

    async def delete(self, id: UUID) -> None:
        await self._session.execute(
            "DELETE FROM users WHERE id = $1", id
        )
```

## Modern Testing

```python
import pytest
from dataclasses import dataclass
from unittest.mock import AsyncMock, patch

@dataclass
class Order:
    id: str
    total: float
    status: str = "pending"

    def confirm(self) -> None:
        if self.total <= 0:
            raise ValueError("Order total must be positive")
        self.status = "confirmed"


class TestOrder:
    def test__confirm__changes_status(self):
        order = Order(id="123", total=100.0)

        order.confirm()

        assert order.status == "confirmed"

    def test__confirm__raises_on_zero_total(self):
        order = Order(id="123", total=0)

        with pytest.raises(ValueError, match="must be positive"):
            order.confirm()


@pytest.fixture
def mock_api_client():
    client = AsyncMock()
    client.get.return_value = {"id": 1, "name": "Test"}
    return client


@pytest.mark.asyncio
async def test__fetch_user__returns_user(mock_api_client):
    result = await mock_api_client.get("/users/1")

    assert result["name"] == "Test"
    mock_api_client.get.assert_called_once_with("/users/1")
```

## FastAPI with Modern Patterns

```python
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Annotated
from uuid import UUID

app = FastAPI()

class UserCreate(BaseModel):
    email: EmailStr
    name: str

class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str

async def get_repository() -> UserRepository:
    # Dependency injection
    async with get_session() as session:
        yield UserRepository(session)

@app.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate,
    repo: Annotated[UserRepository, Depends(get_repository)]
) -> UserResponse:
    new_user = User(
        id=uuid4(),
        email=user.email,
        name=user.name
    )
    await repo.add(new_user)
    return UserResponse(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name
    )

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    repo: Annotated[UserRepository, Depends(get_repository)]
) -> UserResponse:
    user = await repo.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name
    )
```

## Structured Logging

```python
import structlog
from typing import Any

# Configure structlog
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

logger = structlog.get_logger()

async def process_order(order_id: str, data: dict[str, Any]) -> None:
    log = logger.bind(order_id=order_id)

    log.info("Processing order started")

    try:
        result = await do_processing(data)
        log.info("Processing complete", result=result)
    except Exception as e:
        log.error("Processing failed", error=str(e))
        raise
```

## Multi-Stage Image Processing Pipeline


```python
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
import cv2
import numpy as np
from typing import Tuple


class DocumentProcessor:
    """OpenCV pipeline for document preprocessing with quality gates."""

    def process(self, image_path: str) -> Tuple[np.ndarray, dict]:
        """Multi-stage processing: remove background → straighten → extract features."""
        img = cv2.imread(image_path)

        cleaned = self._remove_background_adaptive(img)
        straightened = self._straighten_iterative(cleaned)
        features = self._extract_features(straightened)

        return straightened, features

    def _remove_background_adaptive(self, img: np.ndarray) -> np.ndarray:
        """Adaptive thresholding scales block_size to image dimensions."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Block size must be odd; | 1 ensures this without a conditional
        block_size = min(31, int(gray.shape[0] * 0.05) | 1)
        return cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            block_size, 2
        )

    def _straighten_iterative(self, img: np.ndarray) -> np.ndarray:
        """Contour-based rotation with quality gates (10 passes max)."""
        original_width = img.shape[1]
        for _ in range(10):
            contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                break
            largest = max(contours, key=cv2.contourArea)
            # Quality gate: contour must cover >5% of image area
            if cv2.contourArea(largest) < (img.shape[0] * img.shape[1] * 0.05):
                break
            rect = cv2.minAreaRect(largest)
            angle = rect[2]
            if abs(angle) < 0.5:
                break
            M = cv2.getRotationMatrix2D(rect[0], angle, 1.0)
            img = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]))
            # Quality gate: reject over-rotation (width must stay >70% of original)
            if img.shape[1] < original_width * 0.7:
                break
        return img

    def _extract_features(self, img: np.ndarray) -> dict:
        contours, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return {"area": 0, "aspect_ratio": 0.0}
        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)
        return {"area": int(cv2.contourArea(largest)), "aspect_ratio": round(w / h, 3)}


class UploadView(APIView):
    """Thin Django REST endpoint — delegates to processor and classifier."""

    parser_classes = [MultiPartParser]

    def post(self, request):
        image_file = request.FILES['image']
        processor = DocumentProcessor()
        processed, features = processor.process(image_file.temporary_file_path())
        prediction, confidence = self.classify(processed, features)
        return Response({
            'prediction': prediction,
            'confidence': round(confidence, 3),
            'features': features,
        })
```

**Key design decisions:**
- `int(height * 0.05) | 1` — bitwise OR ensures odd number (OpenCV `adaptiveThreshold` requirement) without a conditional
- Quality gates inside the loop (not after) — reject bad rotations immediately, not after all 10 passes
- Thin controller delegates to `DocumentProcessor` — keeps Django view unit-testable in isolation

## Core Defaults (Modern Python Style)

```python
# Always use modern patterns
from pathlib import Path
from typing import Any
from dataclasses import dataclass

def process(items: list[dict[str, Any]]) -> dict[str, int] | None:
    config_path = Path("config.json")
    return {"count": len(items)} if items else None
```

## Exception Logging Best Practice

```python
# ❌ Anti-pattern: f-string loses traceback
logging.error(f"Failed to process: {e}")

# ✅ Best practice: exc_info preserves full exception
logging.error("Failed to process", exc_info=e)
```

**Why:** Preserves full traceback for debugging, avoids f-string overhead in error path, follows Python stdlib conventions.

## Pydantic Settings Validation (Cross-Field Security)

```python
from pydantic import model_validator

class Settings(BaseSettings):
    environment: str = "development"
    auth_database_url: str | None = None

    @model_validator(mode="after")
    def validate_production_requirements(self) -> "Settings":
        if self.environment == "production" and not self.auth_database_url:
            raise ValueError("AUTH_DATABASE_URL required in production")
        return self
```

## Pydantic Value Object Comparison

```python
# WRONG - type mismatch causes silent failures
session.visitor_id.value != visitor_id

# RIGHT - explicit string conversion
str(session.visitor_id) != str(visitor_id)
```

## StrEnum for Status Fields

```python
from enum import StrEnum

class WidgetStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"

# ORM: default=WidgetStatus.ACTIVE, NOT default="active"
```

Values compare equal to strings, so existing DB queries work without migration.

## Computed Fields on Pydantic Models

```python
from pydantic import computed_field

class WidgetConfig(BaseModel):
    widget_id: str
    base_url: str

    @computed_field  # type: ignore[misc]
    @property
    def embed_code(self) -> str:
        return f'<script src="{self.base_url}/widget/{self.widget_id}"></script>'
```

Included in `.model_dump()` and JSON schema output. `__init__` assignment bypasses Pydantic validation lifecycle and isn't serialized.
