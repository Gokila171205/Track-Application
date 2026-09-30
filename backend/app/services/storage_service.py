import os
from pathlib import Path
from typing import Optional, Protocol
from fastapi import HTTPException, status

class StorageProvider(Protocol):
    async def save_file(self, application_id: str, doc_id: str, filename: str, content: bytes) -> str:
        ...

    def get_file_path(self, storage_key: str) -> Path:
        ...

    async def delete_file(self, storage_key: str) -> bool:
        ...

class LocalStorageService:
    """
    Secure local disk storage provider for document binaries.
    Prevents path traversal and isolates storage from web root.
    """
    def __init__(self, base_dir: Optional[Path] = None):
        if base_dir is None:
            # Default to backend/storage/documents
            backend_root = Path(__file__).resolve().parent.parent.parent
            self.base_dir = backend_root / "storage" / "documents"
        else:
            self.base_dir = Path(base_dir).resolve()
        
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _sanitize_path_segment(self, segment: str) -> str:
        """
        Sanitize application or document ID so it cannot traverse directories.
        """
        # Replace forward slashes (e.g., MOTA/2026-27/ST/10415) with underscores for folder naming
        return segment.replace("/", "_").replace("\\", "_").strip("._ ")

    async def save_file(self, application_id: str, doc_id: str, filename: str, content: bytes) -> str:
        """
        Write document bytes to isolated folder structure:
        storage/documents/{safe_app_id}/{doc_id}_{filename}
        Returns the relative storage key.
        """
        safe_app_dir = self._sanitize_path_segment(application_id)
        target_dir = self.base_dir / safe_app_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        storage_filename = f"{doc_id}_{filename}"
        file_path = (target_dir / storage_filename).resolve()

        # Strict security assertion: ensure path remains inside base_dir
        if not str(file_path).startswith(str(self.base_dir.resolve())):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Invalid storage path traversal detected."
            )

        # Write bytes synchronously/blocking in thread-safe manner
        with open(file_path, "wb") as f:
            f.write(content)

        # Return storage key relative to base_dir
        return f"{safe_app_dir}/{storage_filename}"

    def get_file_path(self, storage_key: str) -> Path:
        """
        Resolve storage key to absolute path and verify traversal safety.
        """
        # Resolve target path
        target_path = (self.base_dir / storage_key).resolve()

        # Check path traversal
        base_resolved = self.base_dir.resolve()
        try:
            target_path.relative_to(base_resolved)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Invalid file path."
            )

        if not target_path.exists() or not target_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document file is no longer available."
            )

        return target_path

    def file_exists(self, storage_key: Optional[str]) -> bool:
        """
        Safely check whether the physical file exists on disk without raising exceptions.
        """
        if not storage_key:
            return False
        try:
            target_path = (self.base_dir / storage_key).resolve()
            base_resolved = self.base_dir.resolve()
            target_path.relative_to(base_resolved)
            return target_path.exists() and target_path.is_file()
        except Exception:
            return False

    async def delete_file(self, storage_key: str) -> bool:
        try:
            path = self.get_file_path(storage_key)
            path.unlink()
            return True
        except Exception:
            return False

# Global instance
storage_service = LocalStorageService()
