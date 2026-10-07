/** A text without its inline marks: `**bold**`, `__underline__`, `==accent==`, `++marker++`. */
export const stripMarks = (text: string) => text.replace(/\*\*|__|==|\+\+/g, '');
