import os
import sys
from uuid import UUID

sys.path.insert(0, os.path.abspath("src"))

from worktrace_api.database import SessionLocal, RecordingChunkRecord, RecordingRecord
from worktrace_api.repository import Repository
from worktrace_api.tasks.transcription import transcribe_audio
from worktrace_api.core.celery_app import celery_app

db = SessionLocal()

# Find a recording with audio chunks and a session
chunk = (
    db.query(RecordingChunkRecord)
    .join(RecordingRecord, RecordingRecord.id == RecordingChunkRecord.recording_id)
    .filter(RecordingChunkRecord.content_type == "audio")
    .filter(RecordingRecord.session_id != None)
    .first()
)

if not chunk:
    print("No audio chunks found in the database. Please record a session with audio first.")
    sys.exit(1)

recording_id = chunk.recording_id
tenant_id = chunk.tenant_id

# get session
repo = Repository(db=db, tenant_id=UUID(tenant_id))
recording = repo.get_recording(UUID(recording_id))

if not recording:
    print(f"Recording {recording_id} not found.")
    sys.exit(1)

session_id = str(recording.session_id)

print(f"Found recording {recording_id} with audio chunks. Session ID: {session_id}")

# Create a dummy silent WAV file for the first chunk to test whisper
try:
    import wave
    import struct
    storage_path = os.path.join("data", "recordings", str(recording.tenant_id), str(recording.id), chunk.storage_key.split("/")[-1])
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)
    with wave.open(storage_path, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        for _ in range(16000): # 1 second of silence
            wav_file.writeframes(struct.pack('h', 0))
    print(f"Created dummy audio chunk at {storage_path}")
except Exception as e:
    print(f"Failed to create dummy audio chunk: {e}")

# Run transcription task synchronously to test
print("Running transcription synchronously...")
transcribe_audio(recording_id=recording_id, session_id=session_id, tenant_id=tenant_id)

db.refresh(chunk)
session_record = repo.get_session(UUID(session_id))
print("Finished!")
if session_record.transcript:
    print("Transcript generated successfully!")
    print(session_record.transcript.model_dump_json(indent=2))
else:
    print("No transcript was generated.")

db.close()
