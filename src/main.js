import "./styles.css";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { currentSession, login } from "./store.js";

Amplify.configure(outputs);

const loginScreen = document.getElementById("login-screen");
const appRoot = document.getElementById("app-root");
const errBox = document.getElementById("login-error");

async function boot(session) {
  loginScreen.hidden = true;
  appRoot.hidden = false;
  const { startApp } = await import("./app.js");
  await startApp(session);
}

const session = await currentSession();
if (session) {
  await boot(session);
} else {
  loginScreen.hidden = false;
  document.getElementById("login-form").onsubmit = async (ev) => {
    ev.preventDefault();
    errBox.hidden = true;
    const btn = document.getElementById("login-btn");
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      const newPw = document.getElementById("login-new-password").value || undefined;
      const result = await login(email, password, newPw);
      if (result?.needNewPassword) {
        document.getElementById("new-password-fields").hidden = false;
        document.getElementById("login-msg").textContent =
          "First sign-in: choose a new password (min 8 characters).";
      } else {
        await boot(result);
      }
    } catch (e) {
      errBox.textContent = e.message || String(e);
      errBox.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "Sign in";
    }
  };
}
