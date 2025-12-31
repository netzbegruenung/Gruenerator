export const parseSearchQuery = (searchString) => {
  if (!searchString?.trim()) return { textQuery: '', tags: [] };

  const tagPattern = /#([\w-]+)/g;
  const tags = [];
  let match;
  while ((match = tagPattern.exec(searchString)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }

  const textQuery = searchString.replace(tagPattern, '').replace(/\s+/g, ' ').trim();
  return { textQuery, tags };
};

export const addTagToSearch = (currentSearch, tag) => {
  const { tags } = parseSearchQuery(currentSearch);
  if (tags.includes(tag.toLowerCase())) return currentSearch;
  return `${currentSearch.trim()} #${tag.toLowerCase()}`.trim();
};
