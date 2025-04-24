const vscode = require("vscode");

/**
 * Removes surrounding whitespace (spaces or tabs) around the cursor position.
 * @param {vscode.TextEditor} editor - The active text editor.
 * @param {vscode.TextEditorEdit} editBuilder - The edit builder for modifying the document.
 * @returns {vscode.Position} The new cursor position after whitespace removal.
 */
function removeSurroundingWhitespace(editor, editBuilder) {
  const document = editor.document;
  const startPos = editor.selection.start;
  const endPos = editor.selection.end;
  let newStartLine = startPos.line;
  let newStartCharacter = startPos.character;
  let newEndLine = endPos.line;
  let newEndCharacter = endPos.character;
  const startLine = document.lineAt(startPos.line);
  const startText = startLine.text;
  const isStartWhitespace = /^[\s\t]*$/.test(startText.substring(0, startPos.character));
  if (isStartWhitespace && (newStartCharacter === newEndCharacter || newStartLine !== newEndLine)) {
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
 * Retrieves the indentation unit (spaces or tabs) based on the editor's current file settings.
 * @param {vscode.TextEditor} editor - The active text editor.
 * @returns {string} The indentation unit (e.g., "  " or "\t").
 */
function getIndentUnit(editor) {
  const { tabSize, insertSpaces } = editor.options;
  return insertSpaces ? " ".repeat(tabSize) : "\t";
}

/**
 * Determines the base indentation level for the current selection.
 * @param {vscode.TextEditor} editor - The active text editor.
 * @param {vscode.Selection} selection - The current selection in the editor.
 * @param {string} indentUnit - The indentation unit (spaces or tabs).
 * @returns {number} The base indentation level in units.
 */
function getBaseIndentLevel(editor, selection, indentUnit) {
  const position = selection.start;
  const currentLine = editor.document.lineAt(position.line);
  const currentIndent = currentLine.text.match(/^\s*/)[0];
  if (
    selection.isEmpty &&
    currentIndent.length > 0 &&
    currentIndent.length % indentUnit.length === 0
  ) {
    return currentIndent.length / indentUnit.length;
  } else if (!selection.isEmpty && position.character % indentUnit.length !== 0) {
    return currentIndent.length / indentUnit.length;
  } else if (!selection.isEmpty && position.character % indentUnit.length === 0 && position.character !== 0) {
    return position.character / indentUnit.length;
  }
  const prevLineNumber = position.line - 1;
  if (prevLineNumber < 0) return 0;
  const prevLine = editor.document.lineAt(prevLineNumber);
  if (prevLine.text.trim() === "") return 0;
  const prevIndent = prevLine.text.match(/^\s*/)[0];
  const prevIndentLevel = prevIndent.length / indentUnit.length;
  return prevLine.text.trim().endsWith(":")
    ? prevIndentLevel + 1
    : prevIndentLevel;
}

/**
 * Determines the indentation unit used in a given set of lines, limited to 1-4 spaces.
 * Analyzes lines starting from the second line to infer the smallest number of leading spaces.
 * Returns the default of 4 spaces if no valid indent is found or if the indent exceeds 4 spaces.
 * @param {string[]} lines - An array of lines from the input text.
 * @returns {string} The inferred indentation unit (e.g., "  " for 2 spaces) or "    " as default.
 */
function getGuessedIndentUnit(lines) {
  const linesWithIndent = lines.slice(1).filter((line) => /^\s+/.test(line));
  const defaultIndent = "    ";
  if (linesWithIndent.length === 0) {
    return defaultIndent;
  }
  const spaceCounts = linesWithIndent.map((line) => {
    const match = line.match(/^ +/);
    return match ? match[0].length : 0;
  });
  const minSpaceCount = Math.min(...spaceCounts);
  return minSpaceCount > 0 && minSpaceCount <= 4
    ? " ".repeat(minSpaceCount)
    : defaultIndent;
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
    !firstLine.startsWith("#") && /[:({[]$/.test(firstLine) ? 1 : 0;
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
      if (!trimmedLine.startsWith("#") && trimmedLine.endsWith(":")) {
        currentIndentLevel += 1;
      }
    } else {
      const currentIndent = line.match(/^\s*/)[0];
      if (!isPreviousLineIndentSet) {
        previousLineIndent = currentIndent;
        const firstIndent = firstLine.match(/^\s*/)[0];
        if (
          firstIndent.length > 0 &&
          firstIndent.length % indentUnit.length === 0
        ) {
          previousLineIndent = firstIndent;
          if (/[:({[]$/.test(firstLine))
            previousLineIndent += indentUnit.repeat(1);
        }
        isPreviousLineIndentSet = true;
      }
      const indentDiff =
        (currentIndent.length - previousLineIndent.length) / indentUnit.length;
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
 * Performs a cut operation, adjusting indentation of subsequent lines if needed.
 * @param {vscode.TextEditor} editor - The active text editor.
 */
async function cut(editor) {
  if (!editor || editor.document.languageId !== "python") return;
  const selection = editor.selection;
  if (selection.isEmpty) return;
  await editor.edit((editBuilder) => {
    const selectedText = editor.document
      .getText(new vscode.Range(selection.start, selection.end))
      .trim();
    editBuilder.delete(selection);
    vscode.env.clipboard.writeText(selectedText);
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const endChar = selection.end.character;
    const isSingleLine = startLine === endLine;
    const isSingleLineWithNewline = startLine + 1 === endLine && endChar === 0;
    if (
      !((isSingleLine || isSingleLineWithNewline) && selectedText.endsWith(":"))
    ) {
      return;
    }
    const totalLines = editor.document.lineCount;
    const baseLine = editor.document.lineAt(startLine);
    const indentUnit = getIndentUnit(editor);
    const baseIndent = baseLine.text.match(/^\s*/)?.[0] || "";
    const baseIndentLevel = baseIndent.length / indentUnit.length;

    // Determine the range of lines to dedent
    let startLineToDedent = startLine + 1;
    let endLineToDedent = startLineToDedent;
    while (endLineToDedent < totalLines) {
      const currentLine = editor.document.lineAt(endLineToDedent);
      endLineToDedent++;
      if (!currentLine.text.trim()) continue;
      const currentIndent = currentLine.text.match(/^\s*/)?.[0] || "";
      const currentIndentLevel = currentIndent.length / indentUnit.length;
      if (currentIndentLevel <= baseIndentLevel) break;
    }

    // Dedent following lines if cutting a single line ending with a colon
    if (startLineToDedent < totalLines) {
      for (let i = startLineToDedent; i < endLineToDedent - 1; i++) {
        const line = editor.document.lineAt(i);
        const currentIndent = line.text.match(/^\s+/)?.[0] || "";
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
  const selection = editor.selection;
  const indentUnit = getIndentUnit(editor);
  const baseIndentLevel = getBaseIndentLevel(editor, selection, indentUnit);
  const lineEndingPattern = clipboardText.includes("\r\n") ? "\\r\\n" : "\\n";
  const processedText = clipboardText
    .trimEnd()
    .replace(new RegExp(`^(?:${lineEndingPattern})+`), '')
    .replace(/^(>>> |\.\.\. )/m, '');
  const separator = clipboardText.includes("\r\n") ? "\r\n" : "\n";
  const lines = processedText.split(separator);
  const hasLostIndent = lines.every((line) => !/^\s+/.test(line));
  const guessedIndentUnit = getGuessedIndentUnit(lines);
  const normalizedLines = lines.map((line) =>
    line.replaceAll(guessedIndentUnit, indentUnit)
  );
  const indentedLines = indentLines(
    normalizedLines,
    baseIndentLevel,
    indentUnit,
    hasLostIndent
  );
  let insertText = indentedLines.join(separator);
  await editor.edit((editBuilder) => {
    let finalInsertText = insertText;
    const pos = selection.start;
    const startLine = selection.start.line;
    const endLine = selection.end.line;
    const endChar = selection.end.character;
    const isSingleLine = startLine === endLine;
    const isSingleLineWithNewline = startLine + 1 === endLine && endChar === 0;
    if (pos.character > 0) {
      const line = editor.document.lineAt(pos.line).text;
      const textBefore = line.substring(0, pos.character);
      const textAfter = line.substring(pos.character);
      if (
        isSingleLine &&
        (!/^\s*$/.test(textBefore) || !/^\s*$/.test(textAfter))
      ) {
        finalInsertText = finalInsertText.replace(/^\s+/, "");
      }
    }
    if (isSingleLineWithNewline) finalInsertText += "\n";
    let newPosition = removeSurroundingWhitespace(editor, editBuilder);
    editBuilder.insert(newPosition, finalInsertText);
  });
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
