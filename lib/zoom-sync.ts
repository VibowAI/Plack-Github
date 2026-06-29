import { createAdminClient } from './supabase/client';
import { listZoomMeetings, listZoomRecordings } from './zoom';

export interface SyncResult {
  success: boolean;
  meetingsSynced: number;
  recordingsSynced: number;
  logs: string[];
}

export async function syncZoomData(userId: string, env: any): Promise<SyncResult> {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    const formatted = `[${new Date().toISOString()}] ${msg}`;
    console.log(msg);
    logs.push(formatted);
  };

  addLog(`[ZOOM SYNC START] Starting sync for user ${userId}`);
  const supabase = createAdminClient();

  try {
    // 1. Fetch upcoming meetings from Zoom API
    let meetings: any[] = [];
    try {
      meetings = await listZoomMeetings(userId, env);
      addLog(`[ZOOM SYNC] Fetched ${meetings.length} upcoming meetings from Zoom API.`);
    } catch (err: any) {
      addLog(`[ZOOM SYNC ERROR] Failed to fetch meetings from Zoom API: ${err.message}`);
    }

    // 2. Fetch past recordings from Zoom API
    let recordings: any[] = [];
    try {
      recordings = await listZoomRecordings(userId, env);
      addLog(`[ZOOM SYNC] Fetched ${recordings.length} cloud recordings from Zoom API.`);
    } catch (err: any) {
      addLog(`[ZOOM SYNC ERROR] Failed to fetch recordings from Zoom API: ${err.message}`);
    }

    let meetingsSyncedCount = 0;
    let recordingsSyncedCount = 0;

    // 3. Upsert meetings into Supabase
    if (meetings.length > 0) {
      for (const m of meetings) {
        // Prepare record
        const startTime = m.start_time ? new Date(m.start_time).toISOString() : null;
        let endTime = null;
        if (startTime && m.duration) {
          endTime = new Date(new Date(startTime).getTime() + m.duration * 60 * 1000).toISOString();
        }

        const meetingData = {
          user_id: userId,
          zoom_meeting_id: String(m.id),
          topic: m.topic || 'Untitled Zoom Meeting',
          description: m.agenda || m.description || '',
          start_time: startTime,
          end_time: endTime,
          timezone: m.timezone || 'UTC',
          duration: m.duration || 40,
          join_url: m.join_url || '',
          start_url: m.start_url || '',
          meeting_password: m.password || '',
          host_email: m.host_email || '',
          meeting_status: m.status || 'scheduled',
          calendar_event_id: m.calendar_event_id || null,
          last_synced_at: new Date().toISOString()
        };

        // Check if exists
        const { data: existing, error: checkError } = await supabase
          .from('zoom_meetings')
          .select('id, topic, start_time')
          .eq('user_id', userId)
          .eq('zoom_meeting_id', String(m.id))
          .maybeSingle();

        const isUpdate = !!existing;

        const { error: upsertError } = await supabase
          .from('zoom_meetings')
          .upsert(meetingData, { onConflict: 'user_id,zoom_meeting_id' });

        if (upsertError) {
          addLog(`[ZOOM SYNC ERROR] Failed to upsert meeting ${m.id}: ${upsertError.message}`);
        } else {
          meetingsSyncedCount++;
          if (isUpdate) {
            addLog(`[ZOOM MEETING UPDATED] [SUPABASE UPDATE] Updated meeting: ${m.topic} (ID: ${m.id})`);
          } else {
            addLog(`[ZOOM MEETING CREATED] [SUPABASE SAVE] Saved new meeting: ${m.topic} (ID: ${m.id})`);
          }
        }
      }
    }

    // 4. Upsert recordings into Supabase
    if (recordings.length > 0) {
      for (const r of recordings) {
        // Zoom recording might have multiple recording files
        const recordingFiles = r.recording_files || [];
        const mainFile = recordingFiles.find((f: any) => f.file_type === 'MP4') || recordingFiles[0] || {};

        const recordingData = {
          user_id: userId,
          zoom_meeting_id: String(r.id || r.uuid),
          recording_id: String(mainFile.id || r.id || ''),
          recording_type: mainFile.recording_type || 'cloud',
          recording_url: r.share_url || mainFile.download_url || '',
          transcript_available: recordingFiles.some((f: any) => f.file_type === 'TRANSCRIPT'),
          duration: r.duration || 0,
          file_size: mainFile.file_size ? BigInt(mainFile.file_size) : null,
          created_at: r.start_time ? new Date(r.start_time).toISOString() : new Date().toISOString(),
          last_synced_at: new Date().toISOString()
        };

        // Check if exists
        const { data: existingRec, error: checkRecError } = await supabase
          .from('zoom_recordings')
          .select('id')
          .eq('user_id', userId)
          .eq('zoom_meeting_id', String(r.id || r.uuid))
          .maybeSingle();

        const isRecUpdate = !!existingRec;

        const { error: upsertRecError } = await supabase
          .from('zoom_recordings')
          .upsert(recordingData, { onConflict: 'user_id,zoom_meeting_id,recording_id' });

        if (upsertRecError) {
          addLog(`[ZOOM SYNC ERROR] Failed to upsert recording for meeting ${r.id}: ${upsertRecError.message}`);
        } else {
          recordingsSyncedCount++;
          if (isRecUpdate) {
            addLog(`[SUPABASE UPDATE] Updated recording for meeting: ${r.topic} (ID: ${r.id})`);
          } else {
            addLog(`[SUPABASE SAVE] Saved new recording for meeting: ${r.topic} (ID: ${r.id})`);
          }
        }
      }
    }

    addLog(`[ZOOM SYNC COMPLETE] Synced ${meetingsSyncedCount} meetings and ${recordingsSyncedCount} recordings for user ${userId}`);
    return {
      success: true,
      meetingsSynced: meetingsSyncedCount,
      recordingsSynced: recordingsSyncedCount,
      logs
    };
  } catch (err: any) {
    addLog(`[ZOOM SYNC FAILED] Sync failed with error: ${err.message || err}`);
    return {
      success: false,
      meetingsSynced: 0,
      recordingsSynced: 0,
      logs
    };
  }
}
