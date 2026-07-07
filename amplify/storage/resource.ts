import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "skyparkInvoices",
  access: (allow) => ({
    // invoice photos, keyed invoices/YYYY-MM/D/...
    "invoices/*": [allow.groups(["admin", "manager"]).to(["read", "write", "delete"])],
  }),
});
