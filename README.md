# Python Paste Pro

Enhances Python pasting in Visual Studio Code with smart indentation, inspired by PyCharm's intelligent paste behavior.

## Features

- **Smart Indentation**: Automatically adjusts indentation when pasting Python code, preserving relative structure and aligning with the current cursor position.
- **Seamless Integration**: Overrides the default `Ctrl+V` (Windows/Linux) or `Cmd+V` (Mac) paste action in Python files, making it effortless to use.
- **Context-Aware**: Works only in Python files, leaving other languages unaffected.

## Installation

1. Open Visual Studio Code.
2. Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X` on Mac).
3. Search for `Python Paste Pro`.
4. Click **Install**.

Alternatively, download the `.vsix` file from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/vscode) and install it manually via "Install from VSIX" in the Extensions view.

## Usage

- Open a Python file (`.py`).
- Copy any Python code to your clipboard.
- Press `Ctrl+V` (Windows/Linux) or `Cmd+V` (Mac) where you want to paste.
- The code will be inserted with smart indentation based on your cursor's position.

No additional configuration is needed `Python Paste Pro` works out of the box!

## Requirements

- Visual Studio Code version 1.97.0 or higher.
- Works with any Python file recognized by VSCode's language identifier (`python`).

## Known Issues

- Complex nested code with inconsistent indentation might require manual adjustment after pasting.
- Report any bugs or suggestions on the [GitHub Issues page](https://github.com/lmmtrr/python-paste-pro/issues).

## Contributing

Contributions are welcome! If you'd like to improve `Python Paste Pro`:
1. Fork the repository (replace with your repo URL).
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit your changes (`git commit -m "Add some feature"`).
4. Push to the branch (`git push origin feature-name`).
5. Open a Pull Request.

## License

This extension is licensed under the [MIT License](https://github.com/lmmtrr/python-paste-pro/blob/main/LICENSE).