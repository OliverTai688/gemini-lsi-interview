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
    }
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
  }

};
