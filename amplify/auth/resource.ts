import { defineAuth } from "@aws-amplify/backend";

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ["admin", "manager"],
  userAttributes: {
    preferredUsername: { required: false, mutable: true },
  },
});
