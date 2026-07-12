import { authMessage, getCurrentSession, getSupabaseClient } from "./auth-client.js";

const MIN_PASSWORD_LENGTH = 8;

function qs(selector) {
  return document.querySelector(selector);
}

function setMessage(element, message, type) {
  if (!element) return;
  element.textContent = message || "";
  element.classList.remove("is-error", "is-success", "is-info");
  if (message) element.classList.add("is-" + type);
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.defaultText;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password, confirmPassword) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return "Use at least 8 characters for your password.";
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return "The passwords do not match.";
  }
  return "";
}

async function redirectIfSignedIn() {
  try {
    const session = await getCurrentSession();
    if (session) window.location.href = "dashboard.html";
  } catch (error) {
    setMessage(qs("[data-auth-message]"), error.message, "error");
  }
}

function showMode(mode) {
  const isSignup = mode === "signup";
  qs("[data-login-panel]").classList.toggle("hidden", isSignup);
  qs("[data-signup-panel]").classList.toggle("hidden", !isSignup);
  qs("[data-mode-login]").setAttribute("aria-pressed", String(!isSignup));
  qs("[data-mode-signup]").setAttribute("aria-pressed", String(isSignup));
  setMessage(qs("[data-auth-message]"), "", "info");
}

async function initLoginPage() {
  const params = new URLSearchParams(window.location.search);
  showMode(params.get("mode") === "signup" ? "signup" : "login");

  qs("[data-mode-login]").addEventListener("click", () => showMode("login"));
  qs("[data-mode-signup]").addEventListener("click", () => showMode("signup"));

  qs("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = qs("[data-auth-message]");
    const button = qs("[data-login-submit]");
    const email = qs("#loginEmail").value.trim();
    const password = qs("#loginPassword").value;

    if (!validEmail(email)) {
      setMessage(message, "Enter a valid email address.", "error");
      return;
    }
    if (!password) {
      setMessage(message, "Enter your password.", "error");
      return;
    }

    setBusy(button, true, "Logging in...");
    setMessage(message, "Checking your account...", "info");

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "dashboard.html";
    } catch (error) {
      setMessage(message, authMessage(error, "Login failed. Please try again."), "error");
      setBusy(button, false);
    }
  });

  qs("[data-signup-form]").addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = qs("[data-auth-message]");
    const button = qs("[data-signup-submit]");
    const email = qs("#signupEmail").value.trim();
    const password = qs("#signupPassword").value;
    const confirmPassword = qs("#signupPasswordConfirm").value;

    if (!validEmail(email)) {
      setMessage(message, "Enter a valid email address.", "error");
      return;
    }

    const passwordError = validatePassword(password, confirmPassword);
    if (passwordError) {
      setMessage(message, passwordError, "error");
      return;
    }

    setBusy(button, true, "Creating account...");
    setMessage(message, "Creating your account...", "info");

    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/dashboard.html"
        }
      });
      if (error) throw error;

      if (data.session) {
        window.location.href = "dashboard.html";
        return;
      }

      setMessage(message, "Account created. Check your email to confirm your account before logging in.", "success");
      setBusy(button, false);
    } catch (error) {
      setMessage(message, authMessage(error, "Could not create the account. Please try again."), "error");
      setBusy(button, false);
    }
  });

  await redirectIfSignedIn();
}

async function initForgotPasswordPage() {
  qs("[data-forgot-form]").addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = qs("[data-auth-message]");
    const button = qs("[data-forgot-submit]");
    const email = qs("#resetEmail").value.trim();

    if (!validEmail(email)) {
      setMessage(message, "Enter a valid email address.", "error");
      return;
    }

    setBusy(button, true, "Sending...");
    setMessage(message, "Sending reset instructions...", "info");

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password.html"
      });
      if (error) throw error;
      setMessage(message, "If an account exists for that email, password reset instructions will be sent.", "success");
    } catch (error) {
      setMessage(message, "If an account exists for that email, password reset instructions will be sent.", "success");
    } finally {
      setBusy(button, false);
    }
  });
}

async function initResetPasswordPage() {
  const message = qs("[data-auth-message]");

  try {
    const session = await getCurrentSession();
    if (!session) {
      setMessage(message, "This reset link is invalid or has expired. Please request a new password reset email.", "error");
    }
  } catch (error) {
    setMessage(message, "This reset link is invalid or has expired. Please request a new password reset email.", "error");
  }

  qs("[data-reset-form]").addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = qs("[data-reset-submit]");
    const password = qs("#newPassword").value;
    const confirmPassword = qs("#newPasswordConfirm").value;
    const passwordError = validatePassword(password, confirmPassword);

    if (passwordError) {
      setMessage(message, passwordError, "error");
      return;
    }

    setBusy(button, true, "Updating...");
    setMessage(message, "Updating your password...", "info");

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage(message, "Your password has been updated. You can continue to your member page.", "success");
      qs("[data-after-reset]").classList.remove("hidden");
    } catch (error) {
      setMessage(message, authMessage(error, "That reset link is invalid or has expired. Please request a new one."), "error");
    } finally {
      setBusy(button, false);
    }
  });
}

async function initDashboardPage() {
  const message = qs("[data-auth-message]");
  const emailEl = qs("[data-user-email]");
  const logoutButton = qs("[data-logout]");

  try {
    const session = await getCurrentSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }
    emailEl.textContent = session.user && session.user.email ? session.user.email : "Signed in";
    qs("[data-dashboard-content]").classList.remove("hidden");
  } catch (error) {
    setMessage(message, "Could not confirm your account session. Please log in again.", "error");
  }

  logoutButton.addEventListener("click", async () => {
    setBusy(logoutButton, true, "Logging out...");
    setMessage(message, "", "info");
    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = "login.html";
    } catch (error) {
      setMessage(message, "Logout failed. Please try again.", "error");
      setBusy(logoutButton, false);
    }
  });
}

const page = document.body.dataset.authPage;

if (page === "login") initLoginPage();
if (page === "forgot-password") initForgotPasswordPage();
if (page === "reset-password") initResetPasswordPage();
if (page === "dashboard") initDashboardPage();
