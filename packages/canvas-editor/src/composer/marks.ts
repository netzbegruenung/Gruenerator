/** A text without its inline marks (`**bold**`, `==accent==`, `++marker++` …) and hand-mark sentinels. */
export const stripMarks = (text: string) => text.replace(/\*\*|__|==|\+\+|[\u2061-\u2064]/g, '');
