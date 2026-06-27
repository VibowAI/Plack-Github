import { getGeminiClient } from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accessToken = searchParams.get("accessToken");
    const action = searchParams.get("action"); // "list" or "thread"

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized. Missing connection token." }, { status: 401 });
    }

    if (action === "list") {
      // Fetch user's recent messages
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!listRes.ok) {
        if (listRes.status === 401) {
          return NextResponse.json({ error: "Unauthorized session or token expired.", code: "UNAUTHORIZED" }, { status: 401 });
        }
        return NextResponse.json({ error: "Failed to fetch messages list from Google API." }, { status: listRes.status });
      }
      const listData = await listRes.json();
      const messagesResult = listData.messages || [];

      // Resolve headers details in parallel
      const details = await Promise.all(
        messagesResult.map(async (msg: any) => {
          try {
            const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
              headers: { "Authorization": `Bearer ${accessToken}` }
            });
            if (!detailRes.ok) return null;
            const detailData = await detailRes.ok ? await detailRes.json() : {};
            
            const headers = detailData.payload?.headers || detailData.headers || [];
            const fromHeader = headers.find((h: any) => h.name === "From")?.value || "Unknown Sender";
            const subjectHeader = headers.find((h: any) => h.name === "Subject")?.value || "No Subject";
            const dateHeader = headers.find((h: any) => h.name === "Date")?.value || "";

            return {
              id: msg.id,
              threadId: msg.threadId,
              snippet: detailData.snippet || "",
              from: fromHeader,
              subject: subjectHeader,
              date: dateHeader
            };
          } catch (e) {
            return null;
          }
        })
      );

      return NextResponse.json({ messages: details.filter(Boolean) });
    }

    if (action === "thread") {
      const threadId = searchParams.get("threadId");
      if (!threadId) {
        return NextResponse.json({ error: "Missing threadId parameter." }, { status: 400 });
      }

      const threadRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      if (!threadRes.ok) {
        return NextResponse.json({ error: "Failed to fetch thread detailed content." }, { status: threadRes.status });
      }
      const threadData = await threadRes.json();
      return NextResponse.json({ thread: threadData });
    }

    return NextResponse.json({ error: "Invalid action. Supported: 'list', 'thread'." }, { status: 400 });
  } catch (err: any) {
    console.error("[GMAIL API GET ERROR]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { action, to, subject, body, accessToken, emailContent, userInstructions } = payload;

    if (!accessToken) {
      return NextResponse.json({ error: "Gmail connection token is missing. Please reconnect Gmail." }, { status: 401 });
    }

    const ai = getGeminiClient();

    // ACTION: GENERATE REPLY DRAFT DIRECTLY using Gemini
    if (action === "create_reply_draft") {
      if (!emailContent) {
        return NextResponse.json({ error: "Missing emailContent for generating reply" }, { status: 400 });
      }

      // Generate the reply text
      const prompt = `You are Plack AI, an elite email assistant. Generate a professional reply to the following email:
---
EMAIL CONTENT:
${emailContent}
---
User instructions for reply tone or guidelines:
"${userInstructions || "Write a friendly, polite, professional reply."}"

Construct only the reply body. Do not output anything else (no subject lines, no system data, no metadata, just the reply message). Ensure proper professional spacing and greeting.`;

      const geminiResponse = await ai.models.generateContent({
        model: "models/gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      const replyText = geminiResponse.text || "Could not generate reply.";
      const cleanTo = to || "";
      const cleanSubject = subject ? (subject.startsWith("Re:") ? subject : `Re: ${subject}`) : "Re: Email Correspondence";
      
      const emailParts = [
        `To: ${cleanTo}`,
        `Subject: ${cleanSubject}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222222;">${replyText.replace(/\n/g, "<br>")}</div>`
      ];

      const emailMIME = emailParts.join("\r\n");
      const base64Encoded = Buffer.from(emailMIME)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
      const requestBody = {
        message: {
          raw: base64Encoded
        }
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Gmail API Draft creation failed with status ${response.status}`);
      }

      const responseData = await response.json();
      return NextResponse.json({ success: true, replyText, data: responseData });
    }

    // ACTION: SUMMARIZE THREAD
    if (action === "summarize_thread") {
      if (!emailContent) {
        return NextResponse.json({ error: "Missing emailContent to summarize" }, { status: 400 });
      }

      const prompt = `You are Plack AI, a premium productivity assistant. Summarize the following email thread.
Provide a clean summary containing exactly these four groups structured in clear markdown lists:
1. **Key Points**
2. **Action Items**
3. **Deadlines**
4. **Questions requiring response**

If a group has no items found in the thread, state "None detected". Keep the formatting beautifully readable.

---
EMAIL THREAD CONTENT:
${emailContent}
---`;

      const geminiResponse = await ai.models.generateContent({
        model: "models/gemini-3.1-flash-lite-preview",
        contents: prompt,
      });

      const summaryText = geminiResponse.text || "Could not generate summary.";
      return NextResponse.json({ success: true, summaryText });
    }

    // ACTION: STANDARD CREATE DRAFT OR SEND
    if (action === "create_draft" || action === "send_email") {
      const cleanTo = to || "";
      const cleanSubject = subject || "No Subject";
      const cleanBody = body || "";

      const emailParts = [
        `To: ${cleanTo}`,
        `Subject: ${cleanSubject}`,
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        "",
        `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.5; color: #222222;">${cleanBody.replace(/\n/g, "<br>")}</div>`
      ];

      const emailMIME = emailParts.join("\r\n");

      const base64Encoded = Buffer.from(emailMIME)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      let endpoint = "";
      let requestBody = {};
      
      if (action === "create_draft") {
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
        requestBody = {
          message: {
            raw: base64Encoded
          }
        };
      } else {
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
        requestBody = {
          raw: base64Encoded
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[GMAIL API ERROR]", errorData);
        
        if (response.status === 401) {
          return NextResponse.json({ 
            error: "Your Gmail session has expired or been revoked. Please reconnect Gmail in the Connections panel.",
            code: "UNAUTHORIZED"
          }, { status: 401 });
        }
        
        return NextResponse.json({ 
          error: errorData?.error?.message || `Gmail API call failed with status: ${response.status}` 
        }, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  } catch (err: any) {
    console.error("[GMAIL ROUTE ERROR]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
