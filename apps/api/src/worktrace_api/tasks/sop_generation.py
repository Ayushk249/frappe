import openai
from uuid import UUID
from datetime import timedelta

from worktrace_api.core.celery_app import celery_app
from worktrace_api.tasks._repo import make_repo
from worktrace_api.schemas import RecordingTranscript, SOP, SOPStep, SOPStatus
from worktrace_api.settings import get_settings


def get_narration(screenshot, next_screenshot, session_created_at, segments):
    rec_start = session_created_at
    ss_start = screenshot.captured_at
    ss_end = next_screenshot.captured_at if next_screenshot else None
    texts = []
    for seg in segments:
        seg_abs_start = rec_start + timedelta(milliseconds=seg.start_ms)
        seg_abs_end   = rec_start + timedelta(milliseconds=seg.end_ms)
        # Segment overlaps with this screenshot's active window
        if (ss_end is None or seg_abs_start < ss_end) and seg_abs_end > ss_start:
            texts.append(seg.text)
    return " ".join(texts).strip() or None


def generate_instruction(ctx: dict) -> str:
    settings = get_settings()
    app_line = f"Application: {ctx['window_title'] or ctx['application'] or 'Unknown'}"
    action_line = (
        f"Action: {ctx['event_type']} at ({ctx['x']}, {ctx['y']})"
        if ctx["x"] is not None else ""
    )
    narration_line = (
        f'User narrated: "{ctx["narration"]}"'
        if ctx["narration"] else "No narration recorded for this step."
    )
    prompt = (
        "You are writing a Standard Operating Procedure.\n"
        "Write ONE clear, concise instruction for this step.\n\n"
        f"{app_line}\n{action_line}\n{narration_line}\n\n"
        "Output only the instruction sentence. No step numbers, no preamble."
    )
    
    client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.openai_api_key,
        # API key in app/api/.env
    )
    response = client.chat.completions.create(
        extra_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-OpenRouter-Title": "WorkTrace",
        },
        model="openai/gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=200,
        temperature=0.3,
    )
    return response.choices[0].message.content.strip()


@celery_app.task(bind=True, max_retries=3)
def generate_sop_with_ai(self, recording_id: str, session_id: str, tenant_id: str) -> None:
    repo = make_repo(tenant_id)
    session = repo.get_session(UUID(session_id))
    screenshots = repo.get_screenshots_for_recording(UUID(recording_id))
    
    annotated = [s for s in screenshots if s.redaction_status == "redacted"]
    events = session.events

    transcript = RecordingTranscript.model_validate(session.transcript or {})
    segments = transcript.segments

    steps_context = []
    for i, screenshot in enumerate(annotated):
        next_ss = annotated[i + 1] if i + 1 < len(annotated) else None
        
        matching_event = next(
            (e for e in reversed(events) if e.before_screenshot_id == screenshot.id), None
        )
        narration = get_narration(screenshot, next_ss, session.created_at, segments)
        steps_context.append({
            "position": i + 1,
            "annotated_storage_key": screenshot.annotated_storage_key,
            "screenshot_id": screenshot.id,
            "application": matching_event.application if matching_event else None,
            "window_title": matching_event.window_title if matching_event else None,
            "event_type": matching_event.event_type if matching_event else None,
            "x": matching_event.x if matching_event else None,
            "y": matching_event.y if matching_event else None,
            "narration": narration,
        })

    sop_steps = [
        SOPStep(
            position=ctx["position"],
            title=f"Step {ctx['position']}",
            instruction=generate_instruction(ctx),
            warning="No narration recorded for this step." if not ctx["narration"] else None,
            screenshot_reference=ctx["screenshot_id"],
        )
        for ctx in steps_context
    ]

    version = repo.next_sop_version(UUID(session_id))
    sop = SOP(
        tenant_id=UUID(tenant_id),
        source_session_id=UUID(session_id),
        version=version,
        status=SOPStatus.DRAFT,
        title=session.workflow_name,
        steps=sop_steps,
    )
    repo.save_sop(sop)
