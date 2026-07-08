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

function showLogin(message) {
  appRoot.hidden = true;
  loginScreen.hidden = false;
  if (message) document.getElementById("login-msg").textContent = message;
}

// always wired, so the form works both on first visit and after a failed boot
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
    showLogin();
  } finally {
    btn.disabled = false; btn.textContent = "Sign in";
  }
};

const session = await currentSession();
if (session) {
  try {
    await boot(session);
  } catch (e) {
    // surface boot failures (network, uninitialised app) instead of a blank page
    showLogin("Couldn't load the app: " + (e.message || e) + " — try signing in again.");
  }
} else {
  showLogin();
}
