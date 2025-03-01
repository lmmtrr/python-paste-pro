const vscode = require('vscode');

function pythonPastePro() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'python') return;
	const selection = editor.selection;
	const position = selection.isEmpty ? editor.selection.start : editor.selection.end;
	const referenceLine = selection.isEmpty ? editor.document.lineAt(position.line) : editor.document.lineAt(selection.start.line);
	const currentIndent = referenceLine.text.match(/^\s*/)[0];
	vscode.env.clipboard.readText().then((clipboardText) => {
		const trimmedInput = clipboardText.trim();
		if (!trimmedInput) return;
		const sep = clipboardText.includes('\r\n') ? '\r\n' : '\n';
		const originalLines = trimmedInput.split(sep);
		const config = vscode.workspace.getConfiguration('editor', editor.document.uri);
		const indentUnit = config.get('insertSpaces') ? ' '.repeat(config.get('tabSize')) : '\t';
		const firstLine = originalLines[0].trim();
		const isFirstLineIndentTrigger = !firstLine.startsWith('#') && firstLine.match(/[:({[]$/);
		let currentIndentLevel = isFirstLineIndentTrigger ? 1 : 0;
		let prevLineIndentLevel = 0;
		const prevLineNumber = Math.max(0, position.line - 1);
		const prevLine = editor.document.lineAt(prevLineNumber);
		if (prevLine.text.trim() !== '' && currentIndent.length === 0) {
			const prevIndent = prevLine.text.match(/^\s*/)[0];
			prevLineIndentLevel = prevIndent.length / indentUnit.length;
		}
		const indentedLines = [indentUnit.repeat(prevLineIndentLevel) + firstLine];
		currentIndentLevel += prevLineIndentLevel;
		let prevBaseIndent = '';
		let fallbackIndentLevel = 0;
		let fallbackFlag = hasLostIndentation(trimmedInput);
		let isPrevBaseIndentSet = false;
		for (let i = 1; i < originalLines.length; i++) {
			const line = originalLines[i];
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				indentedLines.push(currentIndent);
				continue;
			}
			let baseIndent = line.match(/^\s*/)[0];
			if (!isPrevBaseIndentSet) {
				prevBaseIndent = baseIndent;
				isPrevBaseIndentSet = true;
			}
			let indentDiff = (baseIndent.length - prevBaseIndent.length) / indentUnit.length;
			currentIndentLevel += indentDiff;
			let newIndentLevel = (currentIndent.length / indentUnit.length) + currentIndentLevel;
			if (fallbackFlag && fallbackIndentLevel > 0 && newIndentLevel === 0) {
				newIndentLevel = fallbackIndentLevel;
			}
			if (fallbackFlag && !line.trimLeft().startsWith('#') && trimmedLine.endsWith(':')) {
				fallbackIndentLevel++;
			}
			let newIndent = indentUnit.repeat(Math.max(0, newIndentLevel));
			indentedLines.push(newIndent + trimmedLine);
			prevBaseIndent = baseIndent;
		}
		const insertText = indentedLines.join(sep);
		editor.edit(editBuilder => {
			if (editor.selection.isEmpty) {
				editBuilder.insert(position, insertText);
			} else {
				const selectionStart = editor.selection.start;
				const selectionEnd = editor.selection.end;
				const isSingleLineSelection = (selectionEnd.line === selectionStart.line);
				const currentLine = editor.document.lineAt(selectionStart.line);
				const isFullLineSelected = isSingleLineSelection &&
					selectionStart.character === 0 &&
					selectionEnd.character === currentLine.text.length;
				if (isSingleLineSelection && !isFullLineSelected) {
					editBuilder.replace(selection, insertText);
				} else {
					const selectionStart = editor.selection.start;
					const selectionEnd = editor.selection.end;
					const startLineBegin = new vscode.Position(selectionStart.line, 0);
					const replaceRange = new vscode.Range(startLineBegin, selectionEnd);
					const isSingleLineSelection2 = (selectionEnd.line - selectionStart.line === 1) &&
						(selectionEnd.character === 0);
					const newInsertText = currentIndent + insertText + (isSingleLineSelection2 ? '\n' : '');
					editBuilder.replace(replaceRange, newInsertText);
				}
			}
			const newPosition = editor.selection.end
			editor.selection = new vscode.Selection(newPosition, newPosition);
		});
	});
}

function hasLostIndentation(code) {
	const lines = code.split('\n')
		.filter(line => line.trim() !== '')
		.filter(line => !line.trim().startsWith('#'));
	if (lines.length === 0) return true;
	return lines.every(line => !/^[ \t]/.test(line));
}

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('pythonPastePro.paste', pythonPastePro)
	);
}

function deactivate() { }

module.exports = {
	activate,
	deactivate
};