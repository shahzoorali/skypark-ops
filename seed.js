// Seed data extracted from "Skypark - july 26  (1).xlsx" (updated: days 1-7)
// SEED_MONTH is the only month with real historical data; all other months
// are generated empty on the fly (see monthKey/monthMeta in app.js).
const SEED_MONTH = "2026-07";

const SEED = {
  // staff & rates are global — not reset each month (mid-month rate changes
  // aren't modeled yet; would need per-month rate history for that)
  employees: [
    { id:  1, name: "Mannan", rate: 140 },
    { id:  2, name: "Deepak", rate: 88.8 },
    { id:  3, name: "Anuj", rate: 100 },
    { id:  4, name: "Alok", rate: 111.11 },
    { id:  5, name: "Rakesh", rate: 100 },
    { id:  6, name: "Jeetu", rate: 88.89 },
    { id:  7, name: "Souvik", rate: 83.33 },
    { id:  8, name: "Vishwajeet", rate: 66 },
    { id:  9, name: "Sangram", rate: 66 },
    { id: 10, name: "Pratap", rate: 61 },
    { id: 11, name: "Sanju", rate: 61 },
    { id: 12, name: "Vinod", rate: 61 },
    { id: 13, name: "Mukesh", rate: 61 },
    { id: 14, name: "Gagan", rate: 55 },
    { id: 15, name: "Kishan", rate: 55 },
    { id: 16, name: "Litu", rate: 55 },
    { id: 17, name: "Sarat", rate: 94 },
    { id: 18, name: "Karthik", rate: 82 },
    { id: 19, name: "Prakash", rate: 77 },
    { id: 20, name: "Sanat", rate: 77 },
    { id: 21, name: "Sudanshu", rate: 88 },
    { id: 22, name: "Celia", rate: 66 },
    { id: 23, name: "Shashank", rate: 66 },
    { id: 24, name: "Sarfaraz", rate: 66 },
    { id: 25, name: "Haroon", rate: 66 },
  ],
  expenseCategories: [
    "Garlic Bread", "GB Transport", "Paratha", "Buns & cakes", "B.Transport",
    "Beef", "Ice", "Icecream", "Gas", "Asif", "Valet", "Tips", "Blinkit",
    "Instamart", "Tins", "Brownie Bites", "Jhango", "Rapido", "Eggs", "Sugar",
    "Sprite", "Misc",
  ],

  // everything below is scoped to SEED_MONTH (July 2026)
  months: {
    [SEED_MONTH]: {
      // hours[day][employeeId] = hours worked
      hours: {
        1: { 1: 9, 2: 18, 3: 9, 4: 18, 5: 9, 6: 9, 7: 18, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 0, 14: 18, 15: 9, 16: 9, 17: 9, 18: 9, 19: 9, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
        2: { 1: 18, 2: 9, 3: 9, 4: 9, 5: 18, 6: 9, 7: 9, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 9, 19: 18, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
        3: { 1: 9, 2: 9, 3: 18, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 0, 19: 9, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
        4: { 1: 14, 2: 9, 3: 11, 4: 9, 5: 0, 6: 9, 7: 9, 8: 18, 9: 12, 10: 9, 11: 9, 12: 14, 13: 9, 14: 9, 15: 9, 16: 9, 17: 9, 18: 13, 19: 9, 20: 9, 21: 9, 22: 9, 23: 9, 24: 9, 25: 9 },
        5: { 1: 9, 2: 9, 3: 9, 4: 9, 6: 9, 7: 9, 8: 10, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 17: 9, 18: 0, 19: 9, 20: 9, 21: 9, 22: 9, 23: 9 },
        6: { 1: 13, 2: 9, 3: 13, 4: 9, 6: 9, 7: 9, 8: 18, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 9, 15: 9, 17: 9, 18: 0, 19: 9, 20: 18, 21: 18, 22: 9, 23: 9 },
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
        ],
        2: [
          { item: "Garlic Bread", amount: 605 },
          { item: "Paratha", amount: 940 },
          { item: "Beef", amount: 1560 },
          { item: "Gas", amount: 6734 },
          { item: "Asif", amount: 200 },
          { item: "Valet", amount: 800 },
          { item: "mannan", amount: 100 },
        ],
        3: [
          { item: "Garlic Bread", amount: 515 },
          { item: "GB Transport", amount: 90 },
          { item: "Paratha", amount: 860 },
          { item: "Buns & cakes", amount: 4300 },
          { item: "B.Transport", amount: 203 },
          { item: "Ice", amount: 300 },
          { item: "Gas", amount: 3191 },
          { item: "Asif", amount: 200 },
          { item: "Valet", amount: 800 },
          { item: "Tins", amount: 3000 },
          { item: "Jhango", amount: 1900 },
          { item: "Rapido", amount: 200 },
        ],
        4: [
          { item: "Garlic Bread", amount: 2895 },
          { item: "GB Transport", amount: 140 },
          { item: "Paratha", amount: 1715 },
          { item: "Buns & cakes", amount: 825 },
          { item: "B.Transport", amount: 110 },
          { item: "Ice", amount: 150 },
          { item: "Gas", amount: 3191 },
          { item: "Asif", amount: 200 },
          { item: "Eggs", amount: 1050 },
          { item: "Instamart", amount: 240 },
          { item: "Sprite", amount: 200 },
          { item: "Jhango", amount: 1900 },
          { item: "Rapido", amount: 360 },
          { item: "New Arife", amount: 660 },
          { item: "Ghmc", amount: 1000 },
          { item: "Party Saber bhai", amount: 1000 },
        ],
        5: [
          { item: "Paratha", amount: 1950 },
          { item: "Buns & cakes", amount: 4200 },
          { item: "B.Transport", amount: 220 },
          { item: "Ice", amount: 300 },
          { item: "Gas", amount: 3191 },
          { item: "Asif", amount: 200 },
          { item: "Jhango", amount: 1900 },
          { item: "Eggs", amount: 1050 },
        ],
        6: [
          { item: "Garlic Bread", amount: 375 },
          { item: "GB Transport", amount: 82 },
          { item: "Paratha", amount: 1560 },
          { item: "Buns & cakes", amount: 3600 },
          { item: "B.Transport", amount: 242 },
          { item: "Beef", amount: 760 },
          { item: "Icecream", amount: 3600 },
          { item: "Gas", amount: 6382 },
          { item: "Asif", amount: 200 },
          { item: "Valet", amount: 800 },
          { item: "Sugar", amount: 100 },
        ],
        7: [
          { item: "Paratha", amount: 1090 },
          { item: "Ice", amount: 150 },
        ],
      },
      // sales[day] = { totalSale, card, upi, due, swiggy, zomato, cashInHand }
      sales: {
        1: { totalSale: 96564, card: 8493, upi: 40482, due: 420, swiggy: 11700, zomato: 13350, cashInHand: 22119 },
        2: { totalSale: 99263, card: 3458, upi: 50336, due: 161, swiggy: 10483, zomato: 13539, cashInHand: 21286 },
        3: { totalSale: 118413, card: 1608, upi: 52503, due: 236, swiggy: 12939, zomato: 14235, cashInHand: 36892 },
        4: { totalSale: 149559, card: 9608, upi: 87306, due: 497, swiggy: 14707, zomato: 12700, cashInHand: 24741 },
        5: { totalSale: 110282, card: 6439, upi: 42569, due: 4092, swiggy: 16653, zomato: 8160, cashInHand: 32369 },
        6: { totalSale: 133732, card: 9622, upi: 52334, due: 1371, swiggy: 16346, zomato: 15415, cashInHand: 38644 },
      },
      // monthly adjustments per employee
      adjustments: {
        14: { loanTaken: 0, loanDeducted: 0, penalties: 1100, incentives: 0 }, // Gagan
      },
      // details[day][section] = [{item, amount}] — blinkit/instamart/due/discounts
      details: {
        2: {
          due: [{ item: "Sultan", amount: 161 }],
          discounts: [{ item: "Swiggy", amount: 2554 }, { item: "Zomato", amount: 3517 }],
        },
        3: {
          due: [{ item: "Haroon", amount: 236 }, { item: "Jango", amount: 687 }],
          discounts: [{ item: "Swiggy", amount: 12939 }, { item: "Zomato", amount: 14235 }],
        },
        4: {
          instamart: [{ item: "Parsely", amount: 140 }, { item: "Pudina", amount: 100 }],
          discounts: [{ item: "Swiggy", amount: 3083 }, { item: "Zomato", amount: 2974 }],
        },
        5: {
          due: [{ item: "Irfan bhai", amount: 383 }, { item: "Hasim bhai", amount: 628 }, { item: "Shahzor bhai", amount: 628 }, { item: "Jango", amount: 2453 }],
          discounts: [{ item: "Swiggy", amount: 4142 }, { item: "Zomato", amount: 2478 }],
        },
        6: {
          due: [{ item: "fauzan bhai", amount: 2158 }, { item: "Haroon", amount: 236 }, { item: "Jango", amount: 427 }],
          discounts: [{ item: "Swiggy", amount: 3805 }, { item: "Zomato", amount: 3232 }],
        },
      },
      invoices: {},
    },
  },
};
