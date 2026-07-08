import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient({});
const s3 = new S3Client({});

// Simple mode (daily-closing detail sections): item + amount per line.
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

// Stock mode (vendor goods-received bills): full line detail plus bill header.
const BILL_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: "string", description: "Vendor/supplier name printed on the bill, if visible" },
    date: { type: "string", description: "Bill date as YYYY-MM-DD, if visible" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string", description: "Item/product description" },
          qty: { type: "number", description: "Quantity (numeric)" },
          unit: { type: "string", description: "Unit e.g. kg, g, L, pcs, box, dozen; empty if not shown" },
          rate: { type: "number", description: "Rate per unit (numeric, no currency symbol)" },
          amount: { type: "number", description: "Line total = qty x rate (numeric, no currency symbol)" },
        },
        required: ["item", "amount"],
      },
    },
  },
  required: ["lines"],
};

async function streamToBytes(stream: any): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return new Uint8Array(Buffer.concat(chunks));
}

function imageFormat(key: string): "jpeg" | "png" | "webp" {
  if (key.endsWith(".png")) return "png";
  if (key.endsWith(".webp")) return "webp";
  return "jpeg";
}

// Build a Converse content block per file: PDF -> document block, else image block.
function contentBlock(key: string, bytes: Uint8Array, docIndex: number) {
  if (key.endsWith(".pdf")) {
    return { document: { format: "pdf" as const, name: `bill-${docIndex}`, source: { bytes } } };
  }
  return { image: { format: imageFormat(key), source: { bytes } } };
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);

export const handler = async (event: { arguments: { bucket: string; keys: string[]; section: string } }) => {
  const { bucket, keys, section } = event.arguments;
  const stockMode = section === "stock";
  if (!keys?.length) return JSON.stringify(stockMode ? { lines: [] } : { items: [] });

  const blocks = await Promise.all(
    keys.map(async (key, i) => {
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return contentBlock(key, await streamToBytes(obj.Body), i + 1);
    })
  );

  const prompt = stockMode
    ? "These are photos/scans of a supplier bill (goods received) for a restaurant in India. " +
      "Extract the vendor name and bill date if visible, and every purchased line item with quantity, " +
      "unit, per-unit rate, and line total. Ignore bill totals, taxes, discounts, and headers. " +
      "Indian bills write dates day-first: 08-07-2026 or 08/07/2026 means 8 July 2026 — convert to YYYY-MM-DD accordingly. " +
      "Amounts are in Indian Rupees; return numeric values only (no currency symbols, no commas)."
    : `These are photos of a ${section} invoice/receipt from a restaurant outlet in India. ` +
      "Extract every line item with its price. Ignore totals, taxes, and headers — only individual purchased items. " +
      "Amounts are in Indian Rupees; return the numeric value only (no currency symbol, no commas).";

  const toolName = stockMode ? "extract_bill" : "extract_line_items";
  const command = new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    messages: [{ role: "user", content: [...blocks, { text: prompt }] as any }],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: toolName,
            description: stockMode ? "Return the extracted bill" : "Return the extracted invoice line items",
            inputSchema: { json: stockMode ? BILL_SCHEMA : ITEMS_SCHEMA },
          },
        },
      ],
      toolChoice: { tool: { name: toolName } },
    },
  });

  const response = await bedrock.send(command);
  const toolUse = response.output?.message?.content?.find((b: any) => b.toolUse)?.toolUse as
    | { input: any }
    | undefined;

  if (stockMode) {
    const input = toolUse?.input || {};
    const lines = (Array.isArray(input.lines) ? input.lines : [])
      .filter((l: any) => l && typeof l.item === "string" && num(l.amount) !== undefined && l.amount > 0)
      .map((l: any) => ({
        item: l.item,
        qty: num(l.qty) ?? null,
        unit: typeof l.unit === "string" ? l.unit : "",
        rate: num(l.rate) ?? null,
        amount: l.amount,
      }));
    return JSON.stringify({
      vendor: typeof input.vendor === "string" ? input.vendor : null,
      date: typeof input.date === "string" ? input.date : null,
      lines,
    });
  }

  const items = (toolUse?.input?.items || []).filter(
    (i: any) => i && typeof i.item === "string" && typeof i.amount === "number" && i.amount > 0
  );
  return JSON.stringify({ items });
};
