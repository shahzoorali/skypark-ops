import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "skyparkInvoices",
  access: (allow) => ({
    // invoice photos, keyed invoices/YYYY-MM/D/...
    "invoices/*": [allow.groups(["admin", "manager"]).to(["read", "write", "delete"])],
    // vendor bill photos/PDFs for the Stock page, keyed stock/YYYY-MM/...
    "stock/*": [allow.groups(["admin", "manager"]).to(["read", "write", "delete"])],
  }),
});
