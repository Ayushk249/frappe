import tempfile
from typing import Any
from uuid import UUID

from celery.exceptions import SoftTimeLimitExceeded

from worktrace_api.core.celery_app import celery_app
from worktrace_api.database import SessionLocal, WorkflowSessionRecord
from worktrace_api.repository import Repository
from worktrace_api.schemas import RecordingStatus, RecordingTranscript, TranscriptSegment
from worktrace_api.settings import get_settings
from worktrace_api.recordings import ChunkStorage
import whisper

_whisper_model: whisper.Whisper | None = None
_storage: ChunkStorage | None = None


def get_whisper_model() -> whisper.Whisper:
    global _whisper_model
    if _whisper_model is None:
        settings = get_settings()
        _whisper_model = whisper.load_model(settings.whisper_model_size)
    return _whisper_model


def get_storage() -> ChunkStorage:
    global _storage
    if _storage is None:
        settings = get_settings()
        from pathlib import Path
        _storage = ChunkStorage(Path(settings.recording_storage_path), settings.max_chunk_bytes)
    return _storage


def make_repo(tenant_id: str) -> Repository:
    db = SessionLocal()
    return Repository(db=db, tenant_id=UUID(tenant_id))


@celery_app.task(bind=True, max_retries=3, queue="audio")
def transcribe_audio(self: Any, recording_id: str, session_id: str, tenant_id: str) -> None:
    repo = make_repo(tenant_id)
    try:
        recording = repo.get_recording(UUID(recording_id))
        if not recording:
            return

        # GUARD: Check if already transcribed to prevent double processing
        session_record = repo.db.query(WorkflowSessionRecord).filter(
            WorkflowSessionRecord.id == session_id
        ).first()

        if not session_record:
            return

        if session_record.transcript and session_record.transcript.get("status") == "completed":
            return

        # Start transcription
        repo.set_recording_status(UUID(recording_id), RecordingStatus.TRANSCRIBING_AUDIO)
        
        chunks = repo.list_recording_chunks(UUID(recording_id))
        audio_chunks = [c for c in chunks if c.content_type == "audio"]
        
        if not audio_chunks:
            # No audio uploaded
            transcript = RecordingTranscript(
                status="completed", 
                text="", 
                segments=[], 
                audio_chunk_count=0
            )
            session_record.transcript = transcript.model_dump(mode="json")
            repo.db.commit()
            return

        storage = get_storage()
        
        # Concatenate into a temp file for whisper
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_file:
            for chunk in audio_chunks:
                try:
                    data = storage.read(chunk.storage_key)
                    temp_file.write(data)
                except FileNotFoundError:
                    # Log warning or just continue, to avoid crashing the whole transcription
                    pass
            temp_file_path = temp_file.name

        try:
            import os
            if os.path.getsize(temp_file_path) == 0:
                # No audio data was successfully written
                transcript = RecordingTranscript(
                    status="completed",
                    text="",
                    segments=[],
                    audio_chunk_count=0
                )
                session_record.transcript = transcript.model_dump(mode="json")
                repo.db.commit()
                return

            model = get_whisper_model()
            result = model.transcribe(temp_file_path)
            
            segments = []
            for seg in result.get("segments", []):
                segments.append(
                    TranscriptSegment(
                        start_ms=int(seg["start"] * 1000),
                        end_ms=int(seg["end"] * 1000),
                        text=seg["text"].strip(),
                    )
                )

            transcript = RecordingTranscript(
                status="completed",
                text=result.get("text", "").strip(),
                segments=segments,
                audio_chunk_count=len(audio_chunks),
            )
            
            session_record.transcript = transcript.model_dump(mode="json")
            repo.db.commit()
            
        finally:
            import os
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    except SoftTimeLimitExceeded:
        repo.set_recording_status(UUID(recording_id), RecordingStatus.FAILED, "Transcription timed out")
        raise self.retry(countdown=30)
    except Exception as e:
        repo.set_recording_status(UUID(recording_id), RecordingStatus.FAILED, f"Transcription failed: {str(e)}")
        transcript = RecordingTranscript(
            status="failed",
            text=None,
            segments=[],
            audio_chunk_count=0
        )
        if session_record:
            session_record.transcript = transcript.model_dump(mode="json")
            repo.db.commit()
        raise
    finally:
        repo.db.close()
