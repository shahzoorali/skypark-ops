import { defineFunction } from "@aws-amplify/backend";

export const ocrInvoice = defineFunction({
  name: "ocr-invoice",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  environment: {
    // Claude Haiku 4.5 is inference-profile-only in ap-south-1 — the bare
    // model id is not invocable on demand; the global profile routes it.
    BEDROCK_MODEL_ID: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  },
});
