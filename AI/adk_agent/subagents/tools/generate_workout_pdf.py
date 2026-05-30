"""
Tool for generating premium, high-fidelity PDF workout reports using ReportLab.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List

# Define visual brand colors
HEX_COLORS = {
    "HIIT": "#E74C3C",        # Tomato Red (high intensity)
    "STRENGTH": "#8E44AD",    # Grape Purple (hypertrophy / core lift)
    "SKILL": "#2980B9",       # Cobalt Blue (tactical plays / drills)
    "RECOVERY": "#27AE60",    # Basil Green (mobility / rest)
    "ASSESSMENT": "#7F8C8D",  # Graphite Gray (fitness tests / audits)
    "BRAND_DARK": "#2C3E50",  # Charcoal Gray for primary branding
}


async def generate_workout_pdf(
    athlete_name: str,
    workout_title: str,
    workout_description: str,
    exercises_json: str,
) -> dict:
    """
    Generate a high-fidelity PDF report of the workout routine using ReportLab.

    Args:
        athlete_name (str): The name of the athlete receiving the routine.
        workout_title (str): The title of the workout plan (e.g. 'Elite Strength Progression').
        workout_description (str): General instructions, goals, and coach's notes.
        exercises_json (str): A JSON-serialized array of daily exercise objects.
            Format:
            [
              {
                "day": "Monday",
                "workout_type": "HIIT",
                "exercises": [
                  {"name": "Burpees", "sets": "4", "reps": "15", "notes": "Max effort"},
                  {"name": "Box Jumps", "sets": "4", "reps": "12", "notes": "Soft landing"}
                ]
              }
            ]

    Returns:
        dict: A status dictionary containing the path to the generated PDF.
    """
    try:
        print(f"[PDF_TOOL] Executing generate_workout_pdf. Athlete: {athlete_name}, Title: {workout_title}")
        print(f"[PDF_TOOL] Exercises JSON: {exercises_json[:300]}...")
        # Import reportlab components internally to prevent startup import crashes if not installed
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    except ImportError:
        return {
            "status": "error",
            "message": "ReportLab package is missing. Please install it using 'pip install reportlab' to generate PDFs.",
        }

    # 1. Parse JSON exercises with extreme robustness
    try:
        daily_workouts = json.loads(exercises_json)
        if not isinstance(daily_workouts, list):
            # Try parsing if it was wrapped in a nested field
            if isinstance(daily_workouts, dict) and "workouts" in daily_workouts:
                daily_workouts = daily_workouts["workouts"]
            else:
                raise ValueError("Parsed JSON is not a list structure.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[PDF_TOOL] Failed to parse exercises_json. Value received: {exercises_json}")
        return {
            "status": "error",
            "message": f"Failed to parse exercises_json. Please provide valid JSON array. Error: {e}",
        }

    # 2. Setup in-memory compilation buffer
    import io
    buffer = io.BytesIO()
    
    # Safe filename creation
    safe_name = "".join(c for c in athlete_name if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pdf_filename = f"workout_{safe_name}_{timestamp}.pdf"

    # 3. Create PDF Document Template (Letter size, 0.5-inch margins for maximum layout space)
    margin = 36  # 0.5 inch in points
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
    )

    story = []

    # 4. Define rich styling tokens
    styles = getSampleStyleSheet()
    
    # Primary title style
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor(HEX_COLORS["BRAND_DARK"]),
        spaceAfter=4,
    )
    
    # Subtitle / Athlete Info
    meta_style = ParagraphStyle(
        "DocMeta",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#7F8C8D"),
        spaceAfter=15,
    )

    # Callout / Description text style
    desc_title_style = ParagraphStyle(
        "DescTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor(HEX_COLORS["BRAND_DARK"]),
        spaceAfter=4,
    )
    
    desc_body_style = ParagraphStyle(
        "DescBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13.5,
        textColor=colors.HexColor("#2C3E50"),
    )

    # Day header style
    day_header_style = ParagraphStyle(
        "DayHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.white,
    )

    # Table cell text styles
    th_style = ParagraphStyle(
        "TableHeaderCell",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        textColor=colors.white,
    )
    
    tb_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#2C3E50"),
    )
    
    tb_cell_bold_style = ParagraphStyle(
        "TableCellBold",
        parent=tb_cell_style,
        fontName="Helvetica-Bold",
    )

    # --- BRAND HEADER ---
    story.append(Paragraph(workout_title.upper(), title_style))
    current_date = datetime.now().strftime("%B %d, %Y")
    story.append(Paragraph(f"ATHLETE: {athlete_name.upper()}  |  DATE: {current_date}  |  POWERED BY ALPHONSO AI", meta_style))

    # --- COACH'S NOTES / DESCRIPTION CALLOUT ---
    if workout_description:
        # Wrap the description in a single-cell callout box table
        desc_content = [
            Paragraph("COACH'S STRATEGY & OBJECTIVES", desc_title_style),
            Paragraph(workout_description.replace("\n", "<br/>"), desc_body_style)
        ]
        
        desc_table = Table([[desc_content]], colWidths=[doc.width])
        desc_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8F9FA")),
            ('PADDING', (0,0), (-1,-1), 12),
            ('BOX', (0,0), (-1,-1), 1.5, colors.HexColor("#E2E8F0")),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(desc_table)
        story.append(Spacer(1, 15))

    # --- DAILY WORKOUT SCHEDULE BLOCKS ---
    for block in daily_workouts:
        day_name = block.get("day", "Scheduled Day")
        workout_type = block.get("workout_type", "STRENGTH").upper()
        exercises = block.get("exercises", [])

        # Skip days with no exercises configured
        if not exercises:
            continue

        # Get color-coding for this specific intensity type
        theme_hex = HEX_COLORS.get(workout_type, HEX_COLORS["STRENGTH"])
        theme_color = colors.HexColor(theme_hex)

        # 1. Day Header Title block
        header_p = Paragraph(f"{day_name.upper()} — {workout_type}", day_header_style)
        header_table = Table([[header_p]], colWidths=[doc.width])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), theme_color),
            ('PADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))

        # 2. Exercises Table Content
        # Define table headers
        table_data = [[
            Paragraph("EXERCISE", th_style),
            Paragraph("SETS", th_style),
            Paragraph("REPS", th_style),
            Paragraph("COACH NOTES & PROGRESSIONS", th_style),
        ]]

        # Populate rows
        for idx, ex in enumerate(exercises):
            ex_name = ex.get("name", "Unnamed Exercise")
            sets = str(ex.get("sets", "—"))
            reps = str(ex.get("reps", "—"))
            notes = ex.get("notes", "As prescribed.")

            table_data.append([
                Paragraph(ex_name, tb_cell_bold_style),
                Paragraph(sets, tb_cell_style),
                Paragraph(reps, tb_cell_style),
                Paragraph(notes, tb_cell_style),
            ])

        # Column widths: Exercise (30%), Sets (12%), Reps (12%), Notes (46%)
        w_ex = doc.width * 0.30
        w_sets = doc.width * 0.12
        w_reps = doc.width * 0.12
        w_notes = doc.width * 0.46

        ex_table = Table(table_data, colWidths=[w_ex, w_sets, w_reps, w_notes])
        
        # Apply premium styling sheet to table
        t_style = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor(HEX_COLORS["BRAND_DARK"])),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('PADDING', (0,0), (-1,-1), 6),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ]

        # Add alternating row backgrounds starting after header
        for row in range(1, len(table_data)):
            bg = colors.HexColor("#F8F9FA") if row % 2 == 0 else colors.white
            t_style.append(('BACKGROUND', (0, row), (-1, row), bg))

        ex_table.setStyle(TableStyle(t_style))

        # 3. Assemble Day Block (keep header and table together so they don't break across pages!)
        day_block = KeepTogether([
            header_table,
            ex_table,
            Spacer(1, 15)
        ])
        
        story.append(day_block)

    # 5. Build PDF Document in memory
    try:
        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        print("Workout PDF compiled successfully in-memory.")
        
        # 6. Upload to Google Cloud Storage
        pdf_url = ""
        try:
            import asyncio
            from .calendar_utils import active_user_context
            from adk_agent.agent import artifact_service
            
            ctx = active_user_context.get()
            user_id = ctx.get("user_id", "default_user") if ctx else "default_user"
            session_id = ctx.get("session_id", "default_session") if ctx else "default_session"
            
            if artifact_service:
                app_name = "alphonso_performance_mentor"
                from google.genai import types
                
                part = types.Part(inline_data=types.Blob(data=pdf_bytes, mime_type="application/pdf"))
                
                version = await artifact_service.save_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=pdf_filename,
                    artifact=part
                )
                
                bucket_name = getattr(artifact_service, 'bucket_name', os.getenv('GCS_BUCKET', 'productionbucket101'))
                storage_client = getattr(artifact_service, 'storage_client', None)
                blob_path = f"{app_name}/{user_id}/{session_id}/{pdf_filename}/{version}"
                
                # Standard public fallback URL
                pdf_url = f"https://storage.googleapis.com/{bucket_name}/{blob_path}"
                
                if storage_client:
                    try:
                        # 1. Attempt to generate a V4 Signed URL (Valid for 7 days)
                        from datetime import timedelta
                        bucket = storage_client.bucket(bucket_name)
                        blob = bucket.blob(blob_path)
                        pdf_url = blob.generate_signed_url(
                            version="v4",
                            expiration=timedelta(days=7),
                            method="GET"
                        )
                        print(f"[PDF_TOOL] Generated GCS Signed URL successfully: {pdf_url[:120]}...")
                    except Exception as sign_err:
                        print(f"[PDF_TOOL] Signed URL generation failed, trying make_public: {sign_err}")
                        try:
                            # 2. Fallback: Make blob public if fine-grained ACLs are enabled
                            bucket = storage_client.bucket(bucket_name)
                            blob = bucket.blob(blob_path)
                            blob.make_public()
                            print(f"[PDF_TOOL] Successfully made blob public.")
                        except Exception as acl_err:
                            print(f"[PDF_TOOL] Could not make blob public (uniform access level enabled?): {acl_err}")
        except Exception as upload_err:
            import traceback
            traceback.print_exc()
            print(f"Failed to upload PDF to GCS: {upload_err}")
            
        return {
            "status": "success",
            "message": f"Workout PDF routine generated successfully. [PDF_URL: {pdf_url}]",
            "pdf_url": pdf_url,
            "filename": pdf_filename,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "message": f"Failed to compile PDF document. Error: {e}",
        }
