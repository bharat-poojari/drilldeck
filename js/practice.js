const BOOKMARKS_KEY = "drilldeck.question-bookmarks.v1";

export function selectRevisionQuestions(questions, answers) {
  return questions.filter((question, index) => {
    const answer = answers[index];
    return answer && (answer.review || (answer.selected && answer.selected !== question.correctAnswer));
  });
}

export function createBookmarkStore(storage) {
  function read() {
    let raw;
    try {
      raw = storage.getItem(BOOKMARKS_KEY);
    } catch (error) {
      throw new Error(`Bookmarks could not be read: ${error.message}`);
    }
    if (raw === null) return [];
    try {
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids) || !ids.every(id => typeof id === "string" && id.trim())) {
        throw new Error("Saved bookmarks have an invalid format.");
      }
      return [...new Set(ids)];
    } catch (error) {
      throw new Error(`Bookmarks could not be loaded: ${error.message}`);
    }
  }

  function write(ids) {
    try {
      storage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
    } catch (error) {
      throw new Error(`Bookmarks could not be saved: ${error.message}`);
    }
  }

  return {
    getIds:read,
    has(id) {
      return read().includes(id);
    },
    toggle(id) {
      if (typeof id !== "string" || !id.trim()) throw new Error("A question ID is required to bookmark it.");
      const ids = read();
      const index = ids.indexOf(id);
      if (index >= 0) ids.splice(index, 1);
      else ids.push(id);
      write(ids);
      return index < 0;
    }
  };
}