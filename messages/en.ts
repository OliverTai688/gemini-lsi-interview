import { systemPrompt } from "./system";

export default {
  system: {
    prompt: systemPrompt,
  },

  home: {
    admin: "Researcher console",
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
    endInterview: "End interview",
    endConfirmTitle: "End this interview?",
    endConfirmBody: "You can still come back with the same link to add more.",
    endConfirm: "End interview",
    endCancel: "Keep going",
    notFound: "Interview not found",
    reconnecting: "Connection lost — reconnecting…",
    micDenied: "Can't access the microphone. Allow microphone access from the browser's address bar, then tap start again.",
    connectFailed: "Could not start the voice connection. Please try again later",
    uploadImage: "Upload image",
    recordingNotice: "The interview is recorded and stored while it is live",
    uploading: "Uploading media…",
    uploadFailed: "Some media failed to upload",
    imageInvalid: "Only JPG / PNG / WebP / GIF images up to 15MB are supported",
  },

  invitePage: {
    brand: "Life Story Interview",
    loading: "Loading…",
    invalidTitle: "This link can't be used",
    invalidBody: "The link may have expired or is incomplete. Please contact the researcher who sent it to you.",

    inAppTitle: "Please open in your browser",
    inAppBody: "You're in an app's built-in browser, where the microphone may not work. Use the menu at the top right to open in your default browser, or copy the link into Chrome / Safari.",

    welcome: "Welcome to the Life Story Interview",
    welcomeBack: "Welcome back, {name}",
    intro: "This is a voice interview guided by an AI interviewer. You'll be invited to talk about the chapters of your life, a few key moments, and how you imagine the future.",
    points: [
      "The whole interview takes about 60–90 minutes. You can finish it over several sittings and pause at any time.",
      "Find a quiet place where you won't be interrupted. Headphones are recommended.",
      "There are no right answers — say whatever comes to mind, and skip any question you'd rather not answer.",
      "You can draw on a whiteboard or upload photos to help explain.",
    ],

    nameLabel: "What should the interviewer call you?",
    namePlaceholder: "e.g. Alex, Ms. Wang",
    nameError: "Please enter a name",

    consentTitle: "About recording and your data",
    consentCheckbox: "I understand the above and agree to take part and be recorded",

    micTest: "Test microphone",
    micTesting: "Say a few words…",
    micOk: "Microphone is working",
    micSilent: "No sound detected. Please check that your microphone isn't muted",
    micDenied: "Can't access the microphone. Allow microphone access from the browser's address bar and try again.",

    start: "Start interview",
    resume: "Continue interview",
    viewCompleted: "View my interview",
    starting: "Getting ready…",
    startFailed: "Couldn't start. Please refresh the page and try again",
    completedNote: "You have already completed this interview.",
    startedNote: "Your progress is saved — you can pick up where you left off.",
  },

  donePage: {
    title: "Interview complete — thank you",
    body: "Thank you for sharing your story. Your interview has been saved.",
    transcript: "Review transcript",
    materials: "View materials",
    continue: "I'd like to add more",
    saveLinkNote: "To come back later, just open your personal link again.",
    deleteTitle: "Delete my interview data",
    deleteBody: "The transcript, recordings, whiteboard videos and images will be permanently deleted. This cannot be undone.",
    deleteButton: "Delete my interview data",
    deleteConfirm: "Permanently delete all data for this interview?",
    deleting: "Deleting…",
    deleted: "Your interview data has been deleted.",
    deleteFailed: "Delete failed, please try again",
  },

  adminPage: {
    title: "Researcher console",
    subtitle: "Participants and invite links",
    backHome: "My interviews",
    forbidden: "This account does not have console access",
    newInvite: "Add participant",
    labelLabel: "Participant code / name",
    labelPlaceholder: "e.g. P01, Ms. Wang",
    create: "Create personal link",
    creating: "Creating…",
    linkReadyTitle: "Personal link created",
    linkReadyBody: "Copy it now and send it to the participant. Once you leave this screen the link can't be shown again — you can only regenerate it.",
    copy: "Copy link",
    copied: "Copied!",
    close: "Close",
    empty: "No participants yet — add the first one",
    columns: {
      participant: "Participant",
      status: "Status",
      progress: "Progress",
      lastActivity: "Last activity",
      actions: "Actions",
    },
    status: {
      notOpened: "Not opened",
      opened: "Opened",
      inProgress: "In progress",
      completed: "Completed",
      revoked: "Revoked",
    },
    turns: "messages",
    calledAs: "Goes by",
    transcript: "Transcript",
    materials: "Materials",
    summary: "AI summary",
    regenerate: "Regenerate link",
    regenerateConfirm: "The old link stops working immediately and you'll need to send the new one. Continue?",
    revoke: "Revoke link",
    restore: "Restore link",
    delete: "Delete participant",
    deleteConfirm: "Delete \"{label}\" and all of their interview data? Transcripts, recordings and materials will be permanently deleted.",
    actionFailed: "Action failed, please try again",
  },

  consent: {
    title: "Before you start: recording",
    items: [
      "During a live interview, the voices of you and the AI interviewer are recorded throughout.",
      "When you use the whiteboard, the drawing process and your explanation are recorded as a video.",
      "Recordings, videos, images and transcripts are stored in this service's cloud storage.",
      "Conversation content is sent to AI services (Google Gemini, OpenAI) to run the interview and generate summaries.",
      "You can delete an interview at any time (from the page shown after you end it, or from the interview list); its recordings and media are deleted with it.",
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
    backAdmin: "Back to console",
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
