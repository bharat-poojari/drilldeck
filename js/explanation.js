function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character])
  );
}

export function renderQuestionExplanation(question) {
  const optionExplanations = question.optionExplanations &&
    typeof question.optionExplanations === "object" &&
    !Array.isArray(question.optionExplanations)
    ? Object.entries(question.optionExplanations)
      .filter(([key, text]) => ["A", "B", "C", "D"].includes(key) &&
        key !== question.correctAnswer && typeof text === "string" && text.trim())
    : [];
  const facts = Array.isArray(question.importantFacts)
    ? question.importantFacts.filter(fact => typeof fact === "string" && fact.trim())
    : typeof question.importantFact === "string" && question.importantFact.trim()
      ? [question.importantFact]
      : [];
  const sourceUrl = typeof question.source === "string" && /^https?:\/\//i.test(question.source)
    ? question.source
    : "";
  const source = question.source
    ? `<small>Source: ${sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(question.source)}</a>`
      : escapeHtml(question.source)}</small>`
    : "";

  return `<p>${escapeHtml(question.explanation || "No explanation is available for this question.")}</p>
    ${optionExplanations.length
      ? `<div class="option-explanations"><strong>Why the other options are incorrect</strong><ul>${optionExplanations.map(([key, text]) =>
        `<li><b>${key}.</b> ${escapeHtml(text)}</li>`
      ).join("")}</ul></div>`
      : ""}
    ${facts.length
      ? `<div class="important-facts"><strong>Important facts to remember</strong><ul>${facts.map(fact =>
        `<li>${escapeHtml(fact)}</li>`
      ).join("")}</ul></div>`
      : ""}
    ${source}`;
}
