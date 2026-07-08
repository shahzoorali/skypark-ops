import { defineBackend } from "@aws-amplify/backend";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";
import { ocrInvoice } from "./functions/ocr-invoice/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
  ocrInvoice,
});

// Bedrock: allow invoking only Claude Haiku 4.5, and only via its inference
// profile (profile-only in ap-south-1). The foundation-model ARN is still
// required: invoking through a profile also authorizes against the underlying
// model in whichever region the profile routes to.
backend.ocrInvoice.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["bedrock:InvokeModel"],
    resources: [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-*",
      "arn:aws:bedrock:*:*:inference-profile/*.anthropic.claude-haiku-4-5-*",
    ],
  })
);

// S3: read-only access to the photos/PDFs this function is asked to OCR.
backend.storage.resources.bucket.grantRead(backend.ocrInvoice.resources.lambda, "invoices/*");
backend.storage.resources.bucket.grantRead(backend.ocrInvoice.resources.lambda, "stock/*");
