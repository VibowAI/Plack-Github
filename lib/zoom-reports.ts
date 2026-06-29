import { getGeminiClient } from './gemini';
import { createAdminClient } from './supabase/client';

export interface AIReport {
  executive_summary: string;
  key_decisions: { decision: string; rationale: string }[];
  action_items: { task: string; assignee: string; due_date: string }[];
  participants: string[];
  topics: { topic: string; duration_spent: string; summary: string }[];
  risks: string[];
  follow_ups: { step: string; owner: string }[];
}

export async function getOrCreateAIReport(
  userId: string,
  meetingId: string,
  customKeys?: (string | undefined)[]
): Promise<{ success: boolean; report?: any; logs?: string[]; error?: string }> {
  const supabase = createAdminClient();
  const logs: string[] = [];
  const addLog = (msg: string) => {
    console.log(msg);
    logs.push(`[${new Date().toISOString()}] ${msg}`);
  };

  try {
    // 1. Check if the report already exists in Supabase
    addLog(`[ZOOM REPORT] Checking for existing AI report for meeting ${meetingId}`);
    const { data: existingReport, error: fetchError } = await supabase
      .from('zoom_ai_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('meeting_id', meetingId)
      .maybeSingle();

    if (existingReport) {
      addLog(`[ZOOM REPORT] Found cached AI report in Supabase for meeting ${meetingId}. [MEETING LOADED]`);
      return { success: true, report: existingReport, logs };
    }

    // 2. Fetch the meeting from Supabase to provide context to Gemini
    const { data: meeting, error: meetingError } = await supabase
      .from('zoom_meetings')
      .select('*')
      .eq('user_id', userId)
      .eq('zoom_meeting_id', meetingId)
      .maybeSingle();

    if (!meeting) {
      addLog(`[ZOOM REPORT ERROR] Meeting ${meetingId} not found in database.`);
      return { success: false, error: 'Meeting not found. Synchronize meetings first.', logs };
    }

    addLog(`[ZOOM REPORT] Creating new meeting analysis for "${meeting.topic}" using Gemini`);

    // 3. Call Gemini to generate a structured JSON report
    const ai = getGeminiClient(customKeys);
    const prompt = `You are a meeting analyst assistant.
Analyze the following meeting details and generate a professional, factual, and data-driven meeting analysis report.

CRITICAL: Use ONLY the provided metadata. Do NOT project or hallucinate participants, decisions, or topics that are not explicitly present in the data or clearly inferred from the description. If a field (like participants or specific decisions) is not available in the metadata, return an empty array or a "Not identified" string as appropriate.

Meeting Details:
- Topic: ${meeting.topic}
- Description: ${meeting.description || 'No agenda provided.'}
- Scheduled Time: ${meeting.start_time || 'Recent'}
- Duration: ${meeting.duration || 40} minutes
- Host: ${meeting.host_email || 'User'}

You MUST return a JSON object with this exact schema:
{
  "executive_summary": "A factual summary of the meeting based strictly on the topic and description.",
  "key_decisions": [
    { "decision": "Explicit decision from description", "rationale": "Context if available" }
  ],
  "action_items": [
    { "task": "Specific task from agenda/description", "assignee": "Name if mentioned", "due_date": "Deadline if mentioned" }
  ],
  "participants": ["Participant Name 1", "Participant Name 2"],
  "topics": [
    { "topic": "Name of segment", "duration_spent": "Duration", "summary": "Outline" }
  ],
  "risks": ["Specific risk identified in description"],
  "follow_ups": [
    { "step": "Next step", "owner": "Owner" }
  ]
}

Return ONLY valid JSON. Do not write markdown blocks or explanation.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response received from Gemini API');
    }

    const parsedReport = JSON.parse(text) as AIReport;

    // 4. Save report into Supabase
    const reportRow = {
      user_id: userId,
      meeting_id: meetingId,
      executive_summary: parsedReport.executive_summary,
      key_decisions: parsedReport.key_decisions,
      action_items: parsedReport.action_items,
      participants: parsedReport.participants,
      topics: parsedReport.topics,
      risks: parsedReport.risks,
      follow_ups: parsedReport.follow_ups,
      generated_at: new Date().toISOString()
    };

    const { data: savedReport, error: saveError } = await supabase
      .from('zoom_ai_reports')
      .insert(reportRow)
      .select()
      .single();

    if (saveError) {
      addLog(`[ZOOM REPORT ERROR] Failed to save report to Supabase: ${saveError.message}`);
      throw saveError;
    }

    addLog(`[AI REPORT GENERATED] [SUPABASE SAVE] Created and cached AI Report for meeting ${meetingId}`);
    return { success: true, report: savedReport, logs };
  } catch (err: any) {
    addLog(`[ZOOM REPORT FAILED] Report generation failed: ${err.message || err}`);
    return { success: false, error: err.message || 'Failed to generate AI report', logs };
  }
}
