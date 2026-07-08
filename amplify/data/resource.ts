import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { ocrInvoice } from "../functions/ocr-invoice/resource";

/**
 * Documents mirror the frontend's state shape so the data layer swap is thin:
 *  - DayRecord: one item per outlet-day (hours, expenses, sales, details, invoice keys)
 *  - MonthAdjustments: one item per month (loans/penalties/incentives per employee)
 *  - AppConfig: single item ("config") — staff list, rates, expense categories
 * Managers and admins read/write operational data; only admins may change AppConfig.
 */
const schema = a.schema({
  DayRecord: a
    .model({
      // id convention: "YYYY-MM#D" e.g. "2026-07#5"
      id: a.id().required(),
      month: a.string().required(), // "YYYY-MM", for listing a whole month
      day: a.integer().required(),
      payload: a.json().required(), // { hours, expenses, sales, details, invoices }
    })
    .secondaryIndexes((index) => [index("month")])
    .authorization((allow) => [allow.groups(["admin", "manager"]).to(["read", "create", "update", "delete"])]),

  MonthAdjustments: a
    .model({
      id: a.id().required(), // "YYYY-MM"
      payload: a.json().required(), // { [employeeId]: {loanTaken, loanDeducted, penalties, incentives} }
    })
    .authorization((allow) => [allow.groups(["admin", "manager"]).to(["read", "create", "update", "delete"])]),

  // One goods-received bill from a vendor. Bills are independent records
  // (not folded into DayRecord) so concurrent edits can't clobber each other
  // and a month can hold many bills per vendor.
  StockBill: a
    .model({
      id: a.id().required(),
      month: a.string().required(), // "YYYY-MM", for listing a whole month
      date: a.string().required(), // "YYYY-MM-DD" bill/delivery date
      vendor: a.string().required(),
      status: a.string().required(), // "pending" | "verified"
      payload: a.json().required(), // { lines: [{item,qty,unit,rate,amount}], files: [s3 keys], payment: {status, dueDate, paidDate}, notes }
    })
    .secondaryIndexes((index) => [index("month")])
    .authorization((allow) => [allow.groups(["admin", "manager"]).to(["read", "create", "update", "delete"])]),

  AppConfig: a
    .model({
      id: a.id().required(), // always "config"
      payload: a.json().required(), // { employees: [...], categories: [...] }
    })
    .authorization((allow) => [
      allow.groups(["manager"]).to(["read"]),
      allow.groups(["admin"]).to(["read", "create", "update"]),
    ]),

  // Reads the given S3 invoice photo(s) via Bedrock (Claude Haiku 4.5 vision)
  // and returns extracted {item, amount} line items as a JSON string.
  ocrExtractInvoice: a
    .mutation()
    .arguments({
      bucket: a.string().required(),
      keys: a.string().array().required(),
      section: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.groups(["admin", "manager"])])
    .handler(a.handler.function(ocrInvoice)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
