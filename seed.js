// Seed data extracted from "Skypark - july 26 .xlsx"
// SEED_MONTH is the only month with real historical data; all other months
// are generated empty on the fly (see monthKey/monthMeta in app.js).
const SEED_MONTH = "2026-07";

const SEED = {
  // staff & rates are global — not reset each month (mid-month rate changes
  // aren't modeled yet; would need per-month rate history for that)
  employees: [
    { id: 1,  name: "Mannan",     rate: 140 },
    { id: 2,  name: "Deepak",     rate: 88.8 },
    { id: 3,  name: "Anuj",       rate: 100 },
    { id: 4,  name: "Alok",       rate: 111.11 },
    { id: 5,  name: "Rakesh",     rate: 100 },
    { id: 6,  name: "Jeetu",      rate: 88.89 },
    { id: 7,  name: "Souvik",     rate: 83.33 },
    { id: 8,  name: "Vishwajeet", rate: 66 },
    { id: 9,  name: "Sangram",    rate: 66 },
    { id: 10, name: "Pratap",     rate: 61 },
    { id: 11, name: "Sanju",      rate: 61 },
    { id: 12, name: "Vinod",      rate: 61 },
    { id: 13, name: "Mukesh",     rate: 61 },
    { id: 14, name: "Gagan",      rate: 55 },
    { id: 15, name: "Kishan",     rate: 55 },
    { id: 16, name: "Litu",       rate: 55 },
    { id: 17, name: "Sarat",      rate: 94 },
    { id: 18, name: "Karthik",    rate: 82 },
    { id: 19, name: "Prakash",    rate: 77 },
    { id: 20, name: "Sanat",      rate: 77 },
    { id: 21, name: "Sudanshu",   rate: 88 },
    { id: 22, name: "Celia",      rate: 66 },
    { id: 23, name: "Shashank",   rate: 66 },
    { id: 24, name: "Sarfaraz",   rate: 66 },
    { id: 25, name: "Haroon",     rate: 66 },
  ],
  expenseCategories: [
    "Garlic Bread", "GB Transport", "Paratha", "Buns & cakes", "B.Transport",
    "Beef", "Ice", "Icecream", "Gas", "Asif", "Valet", "Tips", "Blinkit",
    "Instamart", "Tins", "Brownie Bites", "Jhango", "Rapido", "Misc",
  ],

  // everything below is scoped to SEED_MONTH (July 2026)
  months: {
    [SEED_MONTH]: {
      // hours[day][employeeId] = hours worked
      hours: {
        1: { 1: 9, 2: 18, 3: 9, 4: 18, 5: 9, 6: 9, 7: 18, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 0, 14: 18, 15: 9, 16: 9, 17: 9, 18: 9, 19: 9, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
        2: { 1: 18, 2: 9, 3: 9, 4: 9, 5: 18, 6: 9, 7: 9, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 9, 19: 18, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
      },
      expenses: {
        1: [
          { item: "Garlic Bread", amount: 457 },
          { item: "Paratha", amount: 1094 },
          { item: "Buns & cakes", amount: 2900 },
          { item: "B.Transport", amount: 280 },
          { item: "Beef", amount: 1560 },
          { item: "Ice", amount: 300 },
          { item: "Icecream", amount: 3600 },
          { item: "Gas", amount: 3367 },
          { item: "Asif", amount: 200 },
          { item: "Valet", amount: 800 },
          { item: "Tips", amount: 150 },
          { item: "Blinkit", amount: 340 },
          { item: "Rapido", amount: 320 },
          { item: "Misc", amount: 30 },
        ],
        2: [
          { item: "Garlic Bread", amount: 605 },
          { item: "Paratha", amount: 940 },
          { item: "Beef", amount: 1560 },
          { item: "Gas", amount: 6734 },
          { item: "Asif", amount: 200 },
          { item: "Valet", amount: 800 },
          { item: "Misc", amount: 100 },
        ],
      },
      // sales[day] = { totalSale, card, upi, due, swiggy, zomato, cashInHand }
      sales: {
        1: { totalSale: 96564, card: 8493, upi: 40482, due: 420, swiggy: 11700, zomato: 13350, cashInHand: 22119 },
      },
      // monthly adjustments per employee
      adjustments: {
        14: { loanTaken: 0, loanDeducted: 0, penalties: 1100, incentives: 0 }, // Gagan
      },
      details: {},
      invoices: {},
    },
  },
};
