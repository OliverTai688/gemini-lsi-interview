import { systemPrompt } from "./system";

export default {
  system: {
    prompt: systemPrompt,
  },

  home: {
    title: "LSI Interview",
    subtitle: "Your interview conversations",

    newSessionButton: "New AI Interview",

    dialog: {
      title: "Create New AI Interview",
      label: "AI Interview Title",
      placeholder: "e.g., User LSI Interview",
      creating: "Creating...",
      createButton: "Create AI Interview",
    },

    empty: {
      title: "No sessions yet",
      description: "Create your first interview session to get started",
      button: "Create First AI Interview"
    },

    sessionCard: {
      untitled: "Untitled AI Interview",
      justNow: "Just now",
      messages: "messages",
    },

    deleteDialog: {
      button: "Delete interview",
      title: "Delete this interview?",
      description: "The transcript, summary, recordings, whiteboard videos and images will all be deleted. This cannot be undone.",
      confirm: "Delete permanently",
      cancel: "Cancel",
      deleting: "Deleting...",
      failed: "Delete failed, please try again",
    }
  },

  sessionPage: {
    back: "Back",
    fullTranscript: "Full Transcript",
    generateSummary: "Generate Summary",
    startTitle: "Start your interview",
    startSubtitle: "Press the microphone to begin",
    sending: "Sending...",
    textPlaceholder: "Type your message (non-live)...",

    liveStatus: {
      connected: "Listening... tap to stop",
      connecting: "Connecting...",
      error: "Error occurred. Tap to retry",
      idle: "Tap to start live interview"
    },

    whiteboard: "Whiteboard",
    materials: "Materials",
    connectFailed: "Could not start the voice connection. Please try again later",
    uploadImage: "Upload image",
    recordingNotice: "The interview is recorded and stored while it is live",
    uploading: "Uploading media…",
    uploadFailed: "Some media failed to upload",
    imageInvalid: "Only JPG / PNG / WebP / GIF images up to 15MB are supported",
  },

  consent: {
    title: "Before you start: recording",
    items: [
      "During a live interview, the voices of you and the AI interviewer are recorded throughout.",
      "When you use the whiteboard, the drawing process and your explanation are recorded as a video.",
      "Recordings, videos, images and transcripts are stored in this service's cloud storage.",
      "Conversation content is sent to AI services (Google Gemini, OpenAI) to run the interview and generate summaries.",
      "You can delete an interview from the interview list at any time; its recordings and media are deleted with it.",
    ],
    agree: "I understand and agree",
    cancel: "Not now",
    failed: "Could not record your consent, please try again",
  },

  materialsPage: {
    back: "Back to Session",
    title: "Materials",
    empty: "This interview has no materials yet",
    whiteboards: "Whiteboards",
    images: "Images",
    recording: "Interview recording",
    segment: "Part {n}",
    downloadVideo: "Download video",
    downloadImage: "Download image",
    download: "Download",
    delete: "Delete",
    deleteConfirm: "Delete this item? This cannot be undone.",
    deleteFailed: "Delete failed, please try again",
  },

  whiteboard: {
    title: "Whiteboard",
    titlePlaceholder: "Title (optional)",
    recording: "Recording",
    noMic: "Microphone unavailable — the video will have no sound",
    aiWatching: "The AI interviewer can see the whiteboard",
    pen: "Pen",
    eraser: "Eraser",
    undo: "Undo",
    clear: "Clear",
    insertImage: "Insert image",
    finish: "Finish & save",
    discard: "Discard",
    discardConfirm: "Discard this whiteboard recording?",
    saving: "Saving…",
    saveFailed: "Save failed",
    retry: "Retry",
  },

  summaryPage: {
    back: "Back",
    regenerate: "Regenerate",
    downloadJson: "Download JSON",
    loading: "Loading summary...",
    empty: "No summary generated yet.",
    generateNow: "Generate Summary",

    title: "Life Story Summary",

    sections: {
      life_theme: "Life Theme",
      motifs: "Motifs",
      turning_points: "Turning Points",
      high_points: "High Points",
      low_points: "Low Points",
      future_script: "Future Script",
      psychological_insights: "Psychological Insights",
      strengths: "Strengths",
      growth_edges: "Growth Edges",
      action_items: "Action Items",
    }
  },

  transcriptPage: {
    back: "Back to Session",
    title: "Full Transcript",
    noMessages: "No messages yet",
    goInterview: "Go to Interview",

    stats: {
      messages: "messages",
      words: "words",
      duration: "duration",
    },

    copyAll: "Copy All",
    copied: "Copied!",
    downloadTxt: "Download TXT",

    user: "User",
    ai: "AI Interviewer",

    end: "End of transcript",

    recording: "Interview recording",
    playFromHere: "Play from here",
    whiteboard: "Whiteboard",
    image: "Image",
    download: "Download",
  }

};
