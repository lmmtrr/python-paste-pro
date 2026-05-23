const vscode = require("vscode");
const {
  getIndentUnit,
  getCodePart,
  getGuessedIndentUnit,
  indentLines,
  calculateIndentedLines,
  preprocessClipboardText,
  getBaseIndentLevel,
  adjustInsertTextForMidLinePaste,
  calculateDedentsForCut
} = require('./logic');

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
  const endLine = document.lineAt(endPos.line);
  const endText = endLine.text;
  const isEndWhitespace = /^[\s\t]*$/.test(endText.substring(endPos.character));
  if (isStartWhitespace) {
    if (selection.isEmpty) {
      if (isEndWhitespace) newStartCharacter = 0;
    } else if (newStartLine !== newEndLine || (newStartLine === newEndLine && newEndCharacter === startText.length)) {
      newStartCharacter = 0;
    }
  }
  if (isEndWhitespace) newEndCharacter = endText.length;
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
  let targetSelection = selection;
  if (selection.isEmpty) {
    const lineIndex = selection.start.line;
    if (lineIndex < editor.document.lineCount - 1) {
      targetSelection = new vscode.Selection(lineIndex, 0, lineIndex + 1, 0);
    } else {
      const line = editor.document.lineAt(lineIndex);
      targetSelection = new vscode.Selection(lineIndex, 0, lineIndex, line.text.length);
    }
  }
  await editor.edit((editBuilder) => {
    const selectedText = editor.document
      .getText(new vscode.Range(targetSelection.start, targetSelection.end));
    editBuilder.delete(targetSelection);
    vscode.env.clipboard.writeText(selectedText);
    const startLine = targetSelection.start.line;
    const endLine = targetSelection.end.line;
    const endChar = targetSelection.end.character;
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
    const baseIndent = baseLine.text.match(/^\s*/)?.[0] || "";
    const baseIndentLevel = Math.floor(baseIndent.length / indentUnit.length);
    if (startLine + 1 >= totalLines) return;
    const rangeRemaining = new vscode.Range(startLine + 1, 0, totalLines, 0);
    const textRemaining = editor.document.getText(rangeRemaining);
    const separator = textRemaining.includes("\r\n") ? "\r\n" : "\n";
    const linesRemaining = textRemaining.split(separator);
    const { lines: dedentedLines, count } = calculateDedentsForCut(linesRemaining, baseIndentLevel, indentUnit);
    for (let i = 0; i < count; i++) {
      const lineIndex = startLine + 1 + i;
      const newText = dedentedLines[i];
      const line = editor.document.lineAt(lineIndex);
      editBuilder.replace(line.range, newText);
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

module.exports = {
  activate,
  deactivate,
  getIndentUnit,
  getCodePart,
  getGuessedIndentUnit,
  indentLines,
  calculateIndentedLines,
  preprocessClipboardText,
  getBaseIndentLevel,
  adjustInsertTextForMidLinePaste
};
