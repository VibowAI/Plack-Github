export function detectMemoryIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  
  console.log("[MEMORY CHECK]", text);

  const triggers = [
    "remember this",
    "remember that",
    "save this preference",
    "save this",
    "don't forget",
    "dont forget",
    "keep this in mind",
    "keep in mind",
    "remember i",
    "remember my",
    "remember that i",
    "remember my preference",
    "my preference is",
    "my project is",
    "i am learning",
    "i like",
    "i prefer"
  ];
  
  const hasTriggerWord = triggers.some(t => lower.includes(t));
  const startsWithRemember = lower.startsWith("remember");
  const startsWithSave = lower.startsWith("save this");
  
  const isDetected = hasTriggerWord || startsWithRemember || startsWithSave;
  
  if (isDetected) {
    console.log("[MEMORY INTENT DETECTED]");
  } else {
    // console.log("[MEMORY INTENT NOT DETECTED]");
  }

  return isDetected;
}

export function detectDocumentTrigger(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  
  const docTriggers = [
    "write an article",
    "write article",
    "create a report",
    "create report",
    "generate documentation",
    "generate docs",
    "make a business plan",
    "write a research paper",
    "write research paper",
    "create project specification",
    "create specification",
    "generate long code file"
  ];
  
  return docTriggers.some(t => lower.includes(t));
}
