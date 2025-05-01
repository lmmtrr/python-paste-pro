const vscode = require("vscode");

/**
 * Retrieves the indentation unit (spaces or tabs) based on the editor's current file settings.
 * @param {vscode.TextEditor} editor - The active text editor.
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
 * @param {string[]} processedLines - Lines after preprocessing.
 * @param {number} baseIndentLevel - The base indentation level for pasting.
 * @param {string} indentUnit - The indentation unit ("  ", "\t", etc.).
 * @returns {string[]} The array of lines with correct indentation applied.
 */
function calculateIndentedLines(processedLines, baseIndentLevel, indentUnit) {
  const hasLostIndent = processedLines.every((line) => !/^\s+/.test(line));
  const guessedIndentUnit = getGuessedIndentUnit(processedLines, indentUnit);
  const normalizedLines = processedLines.map((line) =>
    line.replaceAll(guessedIndentUnit, indentUnit)
  );
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
 * @param {vscode.TextEditor} editor - The active text editor.
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
 * @param {vscode.TextEditor} editor - The active text editor.
 * @param {vscode.Selection} selection - The current selection.
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
 * Removes surrounding whitespace (spaces or tabs) around the cursor position.
 * @param {vscode.TextEditor} editor - The active text editor.
 * @param {vscode.TextEditorEdit} editBuilder - The edit builder for modifying the document.
 * @returns {vscode.Position} The new cursor position after whitespace removal.
 */
function removeSurroundingWhitespace(editor, editBuilder) {
  const document = editor.document;
  const selection = editor.selection;
  const startPos = selection.start;
  const endPos = selection.end;
  const newStartLine = startPos.line;
  let newStartCharacter = startPos.character;
  const newEndLine = endPos.line;
  let newEndCharacter = endPos.character;
  const startLine = document.lineAt(startPos.line);
  const startText = startLine.text;
  const isStartWhitespace = /^[\s\t]*$/.test(startText.substring(0, startPos.character));
  if (isStartWhitespace && (selection.isEmpty || newStartLine !== newEndLine || (newStartLine === newEndLine && newEndCharacter === startText.length))) {
    newStartCharacter = 0;
  }
  const endLine = document.lineAt(endPos.line);
  const endText = endLine.text;
  const isEndWhitespace = /^[\s\t]*$/.test(endText.substring(endPos.character));
  if (isEndWhitespace) {
    newEndCharacter = endText.length;
  }
  const rangeToDelete = new vscode.Range(
    newStartLine,
    newStartCharacter,
    newEndLine,
    newEndCharacter
  );
  editBuilder.delete(rangeToDelete);
  return new vscode.Position(newStartLine, newStartCharacter);
}

/**
 * Inserts the final processed and indented text into the editor.
 * Handles removing surrounding whitespace and adjusting insertion based on cursor position.
 * @param {vscode.TextEditor} editor - The active text editor.
 * @param {string} insertText - The text to insert.
 * @param {string} separator - The line separator used.
 */
async function insertPastedText(editor, insertText, separator) {
  await editor.edit((editBuilder) => {
    const selection = editor.selection;
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const endChar = selection.end.character;
    const isSingleLineWithNewline = startLine + 1 === endLine && endChar === 0;
    let adjustedInsertText = adjustInsertTextForMidLinePaste(editor, selection, insertText);
    if (isSingleLineWithNewline) adjustedInsertText += separator;
    let newPosition = removeSurroundingWhitespace(editor, editBuilder);
    editBuilder.insert(newPosition, adjustedInsertText);
  });
}

/**
 * Performs a cut operation, adjusting indentation of subsequent lines if needed.
 * @param {vscode.TextEditor} editor - The active text editor.
 */
async function cut(editor) {
  if (!editor || editor.document.languageId !== "python") return;
  const selection = editor.selection;
  if (selection.isEmpty) return;
  await editor.edit((editBuilder) => {
    const selectedText = editor.document
      .getText(new vscode.Range(selection.start, selection.end));
    editBuilder.delete(selection);
    vscode.env.clipboard.writeText(selectedText);
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const endChar = selection.end.character;
    const isSingleLine = startLine === endLine;
    const isSingleLineWithNewline = startLine + 1 === endLine && endChar === 0;
    if (
      !((isSingleLine || isSingleLineWithNewline) && getCodePart(selectedText).endsWith(':'))
    ) {
      return;
    }
    const totalLines = editor.document.lineCount;
    const baseLine = editor.document.lineAt(startLine);
    const indentUnit = getIndentUnit(editor);
    const baseIndent = baseLine.text.match(/^\s*/)?.[0] || ""; // Already updated, ensure it stays
    const baseIndentLevel = Math.floor(baseIndent.length / indentUnit.length);

    // Determine the range of lines to dedent
    let startLineToDedent = startLine + 1;
    let endLineToDedent = startLineToDedent;
    while (endLineToDedent < totalLines) {
      const currentLine = editor.document.lineAt(endLineToDedent);
      endLineToDedent++;
      if (!currentLine.text.trim()) continue;
      const currentIndent = currentLine.text.match(/^\s*/)?.[0] || ""; // Added ?. and fallback
      const currentIndentLevel = Math.floor(currentIndent.length / indentUnit.length);
      if (currentIndentLevel <= baseIndentLevel) break;
    }

    // Dedent following lines if cutting a single line ending with a colon
    if (startLineToDedent < totalLines) {
      for (let i = startLineToDedent; i < endLineToDedent - 1; i++) {
        const line = editor.document.lineAt(i);
        const currentIndent = line.text.match(/^\s+/)?.[0] || ""; // Added ?. and fallback
        if (currentIndent.length >= indentUnit.length) {
          const newIndent = currentIndent.slice(indentUnit.length);
          const range = new vscode.Range(i, 0, i, currentIndent.length);
          editBuilder.replace(range, newIndent);
        }
      }
    }
  });
}

/**
 * Performs a paste operation with proper indentation adjustment for Python code.
 * @param {vscode.TextEditor} editor - The active text editor.
 */
async function paste(editor) {
  if (!editor || editor.document.languageId !== "python") return;
  const clipboardText = await vscode.env.clipboard.readText();
  if (!clipboardText.trim()) return;
  const { lines: processedLines, separator } = preprocessClipboardText(clipboardText);
  const indentUnit = getIndentUnit(editor);
  const baseIndentLevel = getBaseIndentLevel(editor, indentUnit);
  const indentedLines = calculateIndentedLines(processedLines, baseIndentLevel, indentUnit);
  const insertText = indentedLines.join(separator);
  await insertPastedText(editor, insertText, separator);
}

/**
 * Activates the extension.
 * @param {vscode.ExtensionContext} context - The extension context.
 */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand("pythonPastePro.cut", cut),
    vscode.commands.registerTextEditorCommand("pythonPastePro.paste", paste)
  );
}

/**
 * Deactivates the extension.
 */
function deactivate() { }

module.exports = { activate, deactivate };
