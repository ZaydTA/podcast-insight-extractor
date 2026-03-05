// Theme toggle
const toggle = document.getElementById("theme-toggle");
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.setAttribute("data-theme", saved);

toggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});

// Elements
const form = document.getElementById("extract-form");
const textarea = document.getElementById("transcript");
const btn = document.getElementById("extract-btn");
const charCount = document.getElementById("char-count");
const resultsSection = document.getElementById("results");
const resultsContent = document.getElementById("results-content");
const copyBtn = document.getElementById("copy-btn");
const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");

let rawMarkdown = "";

// Character count
textarea.addEventListener("input", () => {
  const len = textarea.value.length;
  charCount.textContent = len > 0 ? `${len.toLocaleString()} chars` : "";
});

// Markdown to HTML
function markdownToHtml(md) {
  let html = "";
  const lines = md.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      html += `<h2>${esc(line.slice(3))}</h2>`;
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      html += "<ul>";
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        html += `<li>${inline(lines[i].slice(2))}</li>`;
        i++;
      }
      html += "</ul>";
      i--;
      continue;
    }

    if (line.trim() === "") continue;

    html += `<p>${inline(line)}</p>`;
  }

  return html;
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  s = esc(s);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return s;
}

// Copy results
copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(rawMarkdown).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
  });
});

// Form submit — stream results
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const transcript = textarea.value.trim();
  if (!transcript) return;

  btn.disabled = true;
  btn.textContent = "Extracting...";
  errorSection.hidden = true;
  resultsSection.hidden = false;
  copyBtn.hidden = true;
  resultsContent.innerHTML =
    '<div class="loading-indicator"><div class="spinner"></div>Analyzing transcript...</div>';

  rawMarkdown = "";

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Request failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;

        const payload = JSON.parse(line.slice(6));

        if (payload.type === "text") {
          rawMarkdown += payload.text;
          resultsContent.innerHTML =
            markdownToHtml(rawMarkdown) + '<span class="cursor"></span>';
        }

        if (payload.type === "error") {
          throw new Error(payload.message);
        }

        if (payload.type === "done") {
          resultsContent.innerHTML = markdownToHtml(rawMarkdown);
          copyBtn.hidden = false;
        }
      }
    }

    if (rawMarkdown) {
      resultsContent.innerHTML = markdownToHtml(rawMarkdown);
      copyBtn.hidden = false;
    }
  } catch (err) {
    errorSection.hidden = false;
    errorMessage.textContent = err.message || "Something went wrong.";
    if (!rawMarkdown) resultsSection.hidden = true;
  } finally {
    btn.disabled = false;
    btn.textContent = "Extract Insights";
  }
});
