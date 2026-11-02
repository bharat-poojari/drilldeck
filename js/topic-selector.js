export function createTopicSelection() {
  let groups = [];
  const knownTopics = new Set();
  const selectedTopics = new Set();

  function getTopicKey(parent, topic) {
    return `${parent}\u0000${topic}`;
  }

  function getAvailableTopics() {
    return groups.flatMap(group => group.topics.map(topic => ({
      parent:group.parent,
      topic
    })));
  }

  return {
    setGroups(nextGroups) {
      groups = nextGroups.map(group => ({
        parent:group.parent,
        topics:[...new Set(group.topics)].sort((left, right) => left.localeCompare(right))
      }));
      for (const { parent, topic } of getAvailableTopics()) {
        const key = getTopicKey(parent, topic);
        if (!knownTopics.has(key)) selectedTopics.add(key);
        knownTopics.add(key);
      }
    },
    getGroups(search = "") {
      const query = search.trim().toLocaleLowerCase();
      return groups.flatMap(group => {
        const topics = group.topics.filter(topic =>
          !query || topic.toLocaleLowerCase().includes(query) ||
            group.parent.toLocaleLowerCase().includes(query)
        );
        return topics.length ? [{ parent:group.parent, topics }] : [];
      });
    },
    getAvailableTopics,
    getSelectedTopics() {
      return [...new Set(getAvailableTopics()
        .filter(({ parent, topic }) => selectedTopics.has(getTopicKey(parent, topic)))
        .map(({ topic }) => topic))];
    },
    getSelectedTopicsByGroup() {
      return Object.fromEntries(groups.map(group => [
        group.parent,
        group.topics.filter(topic => selectedTopics.has(getTopicKey(group.parent, topic)))
      ]).filter(([, topics]) => topics.length));
    },
    isSelected(topic, parent) {
      return selectedTopics.has(getTopicKey(parent, topic));
    },
    setSelected(topic, selected, parent) {
      const key = getTopicKey(parent, topic);
      if (selected) selectedTopics.add(key);
      else selectedTopics.delete(key);
    },
    setGroupSelected(parent, selected) {
      const group = groups.find(item => item.parent === parent);
      if (!group) return;
      group.topics.forEach(topic => {
        const key = getTopicKey(parent, topic);
        if (selected) selectedTopics.add(key);
        else selectedTopics.delete(key);
      });
    },
    selectAll() {
      getAvailableTopics().forEach(({ parent, topic }) =>
        selectedTopics.add(getTopicKey(parent, topic))
      );
    },
    clear() {
      selectedTopics.clear();
    },
    selectedCount() {
      return getAvailableTopics().filter(({ parent, topic }) =>
        selectedTopics.has(getTopicKey(parent, topic))
      ).length;
    }
  };
}
