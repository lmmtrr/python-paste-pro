/**
 * Retrieves the indentation unit (spaces or tabs) based on the editor's current file settings.
 * @param {object} editor - The active text editor (or mock).
 * @returns {string} The indentation unit (e.g., "  " or "\t").
 */
function getIndentUnit(editor) {
  const { tabSize, insertSpaces } = editor.options;
  return insertSpaces ? " ".repeat(tabSize) : "\t";
}

/**
 * Extracts the code part of a line, removing comments and trailing whitespace.
 * @param {string} line - The input line of text.
 * @returns {string} The code part of the line, with comments removed and trailing whitespace trimmed.
 */
function getCodePart(line) {
  const index = line.indexOf('#');
  const codePart = index >= 0 ? line.substring(0, index) : line;
  return codePart.trimEnd();
}

/**
 * Determines the indentation unit used in a given set of lines, limited to 1-4 spaces.
 * Analyzes lines starting from the second line to infer the smallest number of leading spaces.
 * Returns the default of 4 spaces if no valid indent is found or if the indent exceeds 4 spaces.
 * @param {string[]} lines - An array of lines from the input text.
 * @param {string} indentUnit - The indentation unit (spaces or tabs).
 * @returns {string} The inferred indentation unit (e.g., "  " for 2 spaces) or "    " as default.
 */
function getGuessedIndentUnit(lines, indentUnit) {
  const linesWithIndent = lines.slice(1).filter((line) => /^\s+/.test(line));
  if (linesWithIndent.length === 0) {
    return indentUnit;
  }
  const spaceCounts = linesWithIndent.map((line) => {
    const match = line.match(/^ +/);
    return match ? match[0].length : 0;
  });
  const minSpaceCount = Math.min(...spaceCounts);
  return minSpaceCount > 0 && minSpaceCount <= 4
    ? " ".repeat(minSpaceCount)
    : indentUnit;
}

/**
 * Applies proper indentation to an array of text lines based on Python code structure.
 * @param {string[]} lines - The array of text lines to indent.
 * @param {number} baseIndentLevel - The base indentation level in units.
 * @param {string} indentUnit - The indentation unit (spaces or tabs).
 * @param {boolean} hasLostIndent - Indicates if the lines have lost their original indentation.
 * @returns {string[]} The array of indented lines.
 */
function indentLines(lines, baseIndentLevel, indentUnit, hasLostIndent) {
  const firstLine = lines[0];
  const indentedLines = [indentUnit.repeat(baseIndentLevel) + firstLine.trim()];
  let currentIndentLevel =
    !firstLine.startsWith("#") && /[:({[]$/.test(getCodePart(firstLine)) ? 1 : 0;
  let previousLineIndent = "";
  let isPreviousLineIndentSet = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      indentedLines.push("");
      continue;
    }
    let newIndentLevel;
    if (hasLostIndent) {
      newIndentLevel = baseIndentLevel + currentIndentLevel;
      indentedLines.push(indentUnit.repeat(newIndentLevel) + trimmedLine);
      if (!trimmedLine.startsWith("#") && getCodePart(trimmedLine).endsWith(':')) {
        currentIndentLevel += 1;
      }
      const codePart = getCodePart(trimmedLine);
      if (/^(return(\s+.*)?|pass|break|continue|raise(\s+.*)?|yield(\s+.*)?)$/.test(codePart)) {
        currentIndentLevel = Math.max(0, currentIndentLevel - 1);
      }
    } else {
      const currentIndent = line.match(/^\s*/)[0];
      if (!isPreviousLineIndentSet) {
        previousLineIndent = currentIndent;
        const firstIndent = firstLine.match(/^\s*/)[0];
        if (
          firstIndent.length % indentUnit.length === 0 &&
          firstIndent.length > currentIndent.length &&
          !getCodePart(firstLine).endsWith(':')
        ) {
          previousLineIndent = firstIndent;
          if (/[:({[]$/.test(getCodePart(firstLine)))
            previousLineIndent += indentUnit.repeat(1);
        }
        isPreviousLineIndentSet = true;
      }
      const indentDiff =
        Math.floor((currentIndent.length - previousLineIndent.length) / indentUnit.length);
      currentIndentLevel += indentDiff;
      newIndentLevel = baseIndentLevel + currentIndentLevel;
      indentedLines.push(
        indentUnit.repeat(Math.max(0, newIndentLevel)) + trimmedLine
      );
      previousLineIndent = currentIndent;
    }
  }
  return indentedLines;
}

/**
 * Calculates the properly indented lines for pasting.
 * normalization logic handles mixed indentation widths by using a stack
 * to track indentation levels relative to the structure.
 * @param {string[]} processedLines - Lines after preprocessing.
 * @param {number} baseIndentLevel - The base indentation level for pasting.
 * @param {string} indentUnit - The indentation unit ("  ", "\t", etc.).
 * @returns {string[]} The array of lines with correct indentation applied.
 */
function calculateIndentedLines(processedLines, baseIndentLevel, indentUnit) {
  const normalizedLines = [];
  const indentStack = [];
  let maxLevel = 0;
  for (const line of processedLines) {
    if (!line.trim()) {
      normalizedLines.push("");
      continue;
    }
    const currentIndentStr = line.match(/^\s*/)[0];
    const currentIndentLen = currentIndentStr.length;
    if (indentStack.length === 0) {
      indentStack.push(currentIndentLen);
    } else {
      let top = indentStack[indentStack.length - 1];
      if (currentIndentLen > top) {
        const unitLen = indentUnit.length;
        let nextExpected = top + unitLen;
        while (currentIndentLen > nextExpected) {
          indentStack.push(nextExpected);
          nextExpected += unitLen;
        }
        indentStack.push(currentIndentLen);
      } else if (currentIndentLen < top) {
        while (indentStack.length > 0 && indentStack[indentStack.length - 1] > currentIndentLen) {
          indentStack.pop();
        }
        if (indentStack.length === 0 || indentStack[indentStack.length - 1] < currentIndentLen) {
          indentStack.push(currentIndentLen);
        }
      }
    }
    const level = Math.max(0, indentStack.length - 1);
    if (level > maxLevel) {
      maxLevel = level;
    }
    const normalizedLine = indentUnit.repeat(level) + line.trim();
    normalizedLines.push(normalizedLine);
  }
  const hasLostIndent = maxLevel === 0 && normalizedLines.length > 1;
  return indentLines(
    normalizedLines,
    baseIndentLevel,
    indentUnit,
    hasLostIndent
  );
}

/**
 * Preprocesses the clipboard text for pasting.
 * Removes leading/trailing whitespace, handles Python REPL prompts, and splits into lines.
 * @param {string} clipboardText - The raw text from the clipboard.
 * @returns {{lines: string[], separator: string}} An object containing the processed lines and the detected line separator.
 */
function preprocessClipboardText(clipboardText) {
  const lineEndingPattern = clipboardText.includes("\r\n") ? "\\r\\n" : "\\n";
  const processedText = clipboardText
    .trimEnd()
    .replace(new RegExp(`^(?:${lineEndingPattern})+`), '')
    .replace(/^(>>> |\.\.\. )/gm, '');
  const separator = clipboardText.includes("\r\n") ? "\r\n" : "\n";
  const lines = processedText.split(separator);
  return { lines, separator };
}

/**
 * Determines the base indentation level for the current selection.
 * @param {object} editor - The active text editor.
 * @param {string} indentUnit - The indentation unit (spaces or tabs).
 * @returns {number} The base indentation level in units.
 */
function getBaseIndentLevel(editor, indentUnit) {
  const selection = editor.selection;
  const startPos = selection.start;
  const startLine = startPos.line;
  const startCharacter = startPos.character;
  const currentLine = editor.document.lineAt(startLine);
  const currentIndent = currentLine.text.match(/^\s*/)[0];
  if (
    selection.isEmpty &&
    currentIndent.length > 0 &&
    currentIndent.length % indentUnit.length === 0
  ) {
    return Math.floor(currentIndent.length / indentUnit.length);
  } else if (!selection.isEmpty && startCharacter === 0) {
    return Math.floor(currentIndent.length / indentUnit.length);
  } else if (startCharacter % indentUnit.length !== 0) {
    return Math.floor(currentIndent.length / indentUnit.length);
  } else if (startCharacter % indentUnit.length === 0 && startCharacter !== 0) {
    return Math.floor(startCharacter / indentUnit.length);
  }
  const prevLineNumber = startLine - 1;
  if (prevLineNumber < 0) return 0;
  const prevLine = editor.document.lineAt(prevLineNumber);
  if (prevLine.text.trim() === "") return 0;
  const prevIndent = prevLine.text.match(/^\s*/)[0];
  const prevIndentLevel = Math.floor(prevIndent.length / indentUnit.length);
  return getCodePart(prevLine.text).endsWith(':')
    ? prevIndentLevel + 1
    : prevIndentLevel;
}

/**
 * Adjusts the text to be inserted if pasting mid-line under specific conditions.
 * Removes leading indent from the first line if pasting into non-whitespace content.
 * @param {object} editor - The active text editor.
 * @param {object} selection - The current selection.
 * @param {string} insertText - The text intended for insertion.
 * @returns {string} The potentially adjusted insert text.
 */
function adjustInsertTextForMidLinePaste(editor, selection, insertText) {
  const pos = selection.start;
  const startLine = selection.start.line;
  const endLine = selection.end.line;
  const endChar = selection.end.character;
  const isSingleLine = startLine === endLine;
  if (pos.character > 0) {
    const line = editor.document.lineAt(pos.line).text;
    const textBefore = line.substring(0, pos.character);
    const textAfter = line.substring(pos.character);
    const textBeforeIsWhitespace = /^\s*$/.test(textBefore);
    const textAfterIsWhitespace = /^\s*$/.test(textAfter);
    if (
      isSingleLine &&
      (!textBeforeIsWhitespace || (endChar !== line.length && !textAfterIsWhitespace))
    ) {
      return insertText.replace(/^\s+/, "");
    }
  }
  return insertText;
}

/**
 * Calculates the lines to be dedented after a cut operation.
 * @param {string[]} lines - The lines following the cut line.
 * @param {number} baseIndentLevel - The base indentation level of the cut line.
 * @param {string} indentUnit - The indentation unit.
 * @returns {{lines: string[], count: number}} The dedented lines and the count of processed lines.
 */
function calculateDedentsForCut(lines, baseIndentLevel, indentUnit) {
  const dedentedLines = [];
  let count = 0;
  for (const line of lines) {
    if (!line.trim()) {
      dedentedLines.push(line);
      count++;
      continue;
    }
    const currentIndent = line.match(/^\s*/)[0];
    const currentIndentLevel = Math.floor(currentIndent.length / indentUnit.length);
    if (currentIndentLevel <= baseIndentLevel) {
      break;
    }
    const newIndent = currentIndent.slice(indentUnit.length);
    dedentedLines.push(newIndent + line.slice(currentIndent.length));
    count++;
  }
  return { lines: dedentedLines, count };
}

module.exports = {
  getIndentUnit,
  getCodePart,
  getGuessedIndentUnit,
  indentLines,
  calculateIndentedLines,
  preprocessClipboardText,
  getBaseIndentLevel,
  calculateIndentedLines,
  preprocessClipboardText,
  getBaseIndentLevel,
  adjustInsertTextForMidLinePaste,
  calculateDedentsForCut
};
