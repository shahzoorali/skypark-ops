import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});

const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "Line item description" },
          amount: { type: "number", description: "Line item amount (numeric, no currency symbol)" },
        },
        required: ["item", "amount"],
      },
    },
  },
  required: ["items"],
};

async function streamToBytes(stream: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

function inferFormat(key: string): "jpeg" | "png" | "webp" {
  if (key.endsWith(".png")) return "png";
  if (key.endsWith(".webp")) return "webp";
  return "jpeg";
}

export const handler = async (event: { arguments: { bucket: string; keys: string[]; section: string } }) => {
  const { bucket, keys, section } = event.arguments;
  if (!keys?.length) return JSON.stringify({ items: [] });

  const images = await Promise.all(
    keys.map(async (key) => {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await streamToBytes(obj.Body);
      return { format: inferFormat(key), source: { bytes } };
    })
  );

  const command = new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({ image: img })),
          {
            text:
              `These are photos of a ${section} invoice/receipt from a restaurant outlet in India. ` +
              "Extract every line item with its price. Ignore totals, taxes, and headers — only individual purchased items. " +
              "Amounts are in Indian Rupees; return the numeric value only (no currency symbol, no commas).",
          },
        ],
      },
    ],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: "extract_line_items",
            description: "Return the extracted invoice line items",
            inputSchema: { json: ITEMS_SCHEMA },
          },
        },
      ],
      toolChoice: { tool: { name: "extract_line_items" } },
    },
  });

  const response = await bedrock.send(command);
  const toolUse = response.output?.message?.content?.find((b: any) => b.toolUse)?.toolUse as
    | { input: { items: { item: string; amount: number }[] } }
    | undefined;

  const items = (toolUse?.input?.items || []).filter(
    (i) => i && typeof i.item === "string" && typeof i.amount === "number" && i.amount > 0
  );
  return JSON.stringify({ items });
};
