// AskUserQuestion is a built-in SDK tool with a strict input schema. We
// don't register a custom MCP version anymore; instead AgentClient
// intercepts the tool in its canUseTool callback, asks the host UI for
// answers, and returns them as `updatedInput.answers`. The SDK then
// formats the result text for the model on its own.
//
// This file is types-only: the wire format the UI implements.

export type AskOption = {
  label: string;
  description: string;
};

export type AskQuestion = {
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
};

// answers maps questionText -> answer string. For multiSelect questions
// the answer is a comma-joined list of picked labels (and/or free text).
export type AskAnswer = {
  answers: Record<string, string>;
  cancelled?: boolean;
};

export type AskRequester = (questions: AskQuestion[]) => Promise<AskAnswer>;
