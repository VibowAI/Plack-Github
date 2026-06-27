import { getValidAccessToken } from './supabase/connections';

export async function listZoomMeetings(userId: string, env: any) {
  const token = await getValidAccessToken(userId, 'zoom', env);
  if (!token) throw new Error('Zoom is not connected. Please connect Zoom in your Connections settings.');

  const url = 'https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=30';
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zoom API error (List): ${errText}`);
  }

  const data = await response.json() as any;
  return data.meetings || [];
}

export async function getZoomMeeting(userId: string, meetingId: string, env: any) {
  const token = await getValidAccessToken(userId, 'zoom', env);
  if (!token) throw new Error('Zoom is not connected.');

  const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zoom API error (Get): ${errText}`);
  }

  return response.json();
}

export async function createZoomMeeting(
  userId: string,
  params: {
    topic: string;
    start_time: string;
    duration?: number;
    timezone?: string;
  },
  env: any
) {
  const token = await getValidAccessToken(userId, 'zoom', env);
  if (!token) throw new Error('Zoom is not connected. Please connect Zoom in Connections page.');

  const url = 'https://api.zoom.us/v2/users/me/meetings';
  const body = {
    topic: params.topic,
    type: 2, // Scheduled meeting
    start_time: params.start_time,
    duration: params.duration || 40,
    timezone: params.timezone || 'UTC',
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: true,
      mute_upon_entry: true,
      waiting_room: false
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zoom API error (Create): ${errText}`);
  }

  return response.json();
}

export async function updateZoomMeeting(
  userId: string,
  meetingId: string,
  params: {
    topic?: string;
    start_time?: string;
    duration?: number;
    timezone?: string;
  },
  env: any
) {
  const token = await getValidAccessToken(userId, 'zoom', env);
  if (!token) throw new Error('Zoom is not connected.');

  const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
  const body: any = {};
  if (params.topic) body.topic = params.topic;
  if (params.start_time) body.start_time = params.start_time;
  if (params.duration) body.duration = params.duration;
  if (params.timezone) body.timezone = params.timezone;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zoom API error (Update): ${errText}`);
  }

  return { success: true };
}

export async function cancelZoomMeeting(userId: string, meetingId: string, env: any) {
  const token = await getValidAccessToken(userId, 'zoom', env);
  if (!token) throw new Error('Zoom is not connected.');

  const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zoom API error (Cancel): ${errText}`);
  }

  return { success: true };
}
