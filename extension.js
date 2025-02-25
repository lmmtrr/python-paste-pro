const vscode = require('vscode');

function pythonPastePro() {
	const editor = vscode.window.activeTextEditor;
	if (!editor || editor.document.languageId !== 'python') return;
	const position = editor.selection.isEmpty ? editor.selection.start : editor.selection.end;
	const currentLine = editor.document.lineAt(position.line).text;
	const currentIndent = currentLine.match(/^\s*/)[0];
	vscode.env.clipboard.readText().then((s) => {
		const trimmedInput = s.trim();
		if (!trimmedInput) return;
		let sep = '\n';
		if (trimmedInput.indexOf('\r\n') !== -1) sep = '\r\n';
		const originalLines = trimmedInput.split(sep);
		const config = vscode.workspace.getConfiguration('editor', editor.document.uri);
		const indentUnit = currentIndent.startsWith('\t') && !config.get('insertSpaces')
			? '\t'
			: ' '.repeat(config.get('tabSize'));
		let insertText = '';
		const firstLine = originalLines[0].trimLeft();
		const isFirstLineColon = firstLine.trimRight().endsWith(':') && !firstLine.startsWith('#');
		let currentIndentLevel = isFirstLineColon ? 1 : 0;
		const indentedLines = [firstLine];
		let prevBaseIndent = '';
		let fallbackIndentLevel = 0;
		let fallbackFlag = hasLostIndentation(trimmedInput);
		for (let i = 1; i < originalLines.length; i++) {
			const line = originalLines[i];
			const trimmedLine = line.trim();
			if (!trimmedLine) {
				indentedLines.push(currentIndent);
				continue;
			}
			let baseIndent = line.match(/^\s*/)[0];
			if (i === 1) prevBaseIndent = baseIndent;
			let indentDiff = (baseIndent.length - prevBaseIndent.length) / indentUnit.length;
			currentIndentLevel += indentDiff;
			let newIndentLevel = (currentIndent.length / indentUnit.length) + currentIndentLevel;
			if (fallbackFlag && fallbackIndentLevel > 0 && newIndentLevel === 0) {
				newIndentLevel = fallbackIndentLevel;
			}
			if (fallbackFlag && trimmedLine.endsWith(':') && !line.trimLeft().startsWith('#')) {
				fallbackIndentLevel++;
			}
			let newIndent = indentUnit.repeat(Math.max(0, newIndentLevel));
			indentedLines.push(newIndent + trimmedLine);
			prevBaseIndent = baseIndent;
		}
		insertText = indentedLines.join(sep);
		editor.edit(editBuilder => {
			if (editor.selection.isEmpty) {
				editBuilder.insert(position, insertText);
			} else {
				editBuilder.replace(editor.selection, insertText);
			}
		}).then(success => {
			if (success) {
				const newPosition = position.translate(0, insertText.length);
				editor.selection = new vscode.Selection(newPosition, newPosition);
			}
		});
	});
}

function hasLostIndentation(code) {
	const lines = code.split('\n')
		.map(line => line.match(/^\s*/)[0].length)
		.filter((_, i, arr) => arr[i] !== '' && !code.split('\n')[i].trim().startsWith('#'));
	if (lines.length === 0) return false;
	return lines.every(indent => indent === lines[0]);
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