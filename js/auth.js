const form = document.getElementById("auth-form");
const title = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const toggleBtn = document.getElementById("toggle-mode");
const nameField = document.getElementById("name-field");
const roleField = document.getElementById("role-field");
const errorMsg = document.getElementById("error-msg");
const infoMsg = document.getElementById("info-msg");

let mode = "signin"; // or "signup"

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
  infoMsg.classList.add("hidden");
}

function showInfo(msg) {
  infoMsg.textContent = msg;
  infoMsg.classList.remove("hidden");
  errorMsg.classList.add("hidden");
}

toggleBtn.addEventListener("click", () => {
  mode = mode === "signin" ? "signup" : "signin";
  const isSignup = mode === "signup";
  title.textContent = isSignup ? "Create an account" : "Sign in";
  submitBtn.textContent = isSignup ? "Sign up" : "Sign in";
  toggleBtn.textContent = isSignup
    ? "Already have an account? Sign in"
    : "Need an account? Sign up";
  nameField.classList.toggle("hidden", !isSignup);
  roleField.classList.toggle("hidden", !isSignup);
  errorMsg.classList.add("hidden");
  infoMsg.classList.add("hidden");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  try {
    if (mode === "signup") {
      const full_name = document.getElementById("full_name").value.trim();
      const role = document.getElementById("role").value;
      if (!full_name) { showError("Please enter your full name."); return; }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name, role } }
      });
      if (error) throw error;

      if (data.session) {
        window.location.href = "dashboard.html";
      } else {
        showInfo("Account created. Check your email to confirm, then sign in.");
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    showError(err.message || "Something went wrong.");
  } finally {
    submitBtn.disabled = false;
  }
});

// If already signed in, skip straight to the dashboard
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) window.location.href = "dashboard.html";
})();
