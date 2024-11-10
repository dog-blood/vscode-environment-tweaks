import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

interface EnvTag {
    index: number;
    type: 'begin' | 'end';
    name: string;
    braceEnd: number;
}

interface TagBoundary {
    start: number;
    end: number;
    braceStart: number;
    braceEnd: number;
}

// Separate listeners for navigation and snippet functionality
let disposableListener: vscode.Disposable | undefined;
let tempHandler: vscode.Disposable | undefined;
let selectionHandler: vscode.Disposable | undefined;

function isOutsideTag(cursorOffset: number, tagStart: number, tagEnd: number, buffer: number = 0): boolean {
    return cursorOffset < tagStart || cursorOffset > tagEnd;
}

// First, let's create a shared function for the cursor movement listener
function createCursorMovementListener(editor: vscode.TextEditor): vscode.Disposable {
    return vscode.window.onDidChangeTextEditorSelection((e: vscode.TextEditorSelectionChangeEvent) => {
        console.log('Selection change event triggered');
        console.log('Number of selections:', editor.selections.length);
        
        if (editor.selections.length > 1 && e.textEditor === editor) {
            const text = editor.document.getText();
            
            // Get positions of both cursors
            const cursor1Offset = editor.document.offsetAt(e.selections[0].active);
            const cursor2Offset = editor.document.offsetAt(e.selections[1].active);
            
            console.log('DEBUG - Cursor positions:', {
                cursor1: cursor1Offset,
                cursor2: cursor2Offset
            });
            
            // Find the complete tag boundaries for both cursors
            const tag1Start = text.lastIndexOf('\\', cursor1Offset);
            if (tag1Start >= 0) {
                const braceStart = text.indexOf('{', tag1Start);
                const braceEnd = text.indexOf('}', braceStart);
                
                console.log('DEBUG - Tag boundaries:', {
                    tag1: {start: tag1Start, braceStart, braceEnd}
                });
                
                // Check if PRIMARY cursor moved outside its original braces
                const primaryCursorOutside = isOutsideTag(cursor1Offset, braceStart, braceEnd);
                
                if (primaryCursorOutside) {
                    console.log('DEBUG - Primary cursor moved outside braces, removing second cursor');
                    editor.selection = new vscode.Selection(
                        e.selections[0].active,
                        e.selections[0].active
                    );
                    disposableListener?.dispose();
                    disposableListener = undefined;
                    return;
                }
            }
        }
    });
}

// Helper function to get the text selection range for a tag
function getTagSelectionRange(text: string, tagStart: number): { start: number, end: number } | null {
    const braceStart = text.indexOf('{', tagStart);
    if (braceStart === -1) return null;
    
    const braceEnd = text.indexOf('}', braceStart);
    if (braceEnd === -1) return null;
    
    return {
        start: braceStart + 1, // Right after {
        end: braceEnd        // Right before }
    };
}

// Add this helper function at the top level
function debugCursorPosition(editor: vscode.TextEditor, label: string) {
    const position = editor.selection.active;
    const offset = editor.document.offsetAt(position);
    console.log(`DEBUG [${label}] - Cursor position:`, {
        offset,
        line: position.line,
        character: position.character
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 LaTeX Helper is now active - DEBUG MODE');
    
    // Start Python process for navigation
    const pythonScriptPath = path.join(__dirname, 'keylogger.py');
    const pythonProcess = spawn('python', [pythonScriptPath]);
    
    // SNIPPET FUNCTIONALITY
    const provider = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file', language: 'latex' },
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const snippets = [
                    {
                        label: '\\begin',
                        insertText: 'begin{${1:environment}}\n    ${2:content}\n\\end{$1}',
                        kind: vscode.CompletionItemKind.Snippet,
                        detail: 'Create LaTeX environment'
                    }
                ];

                return snippets.map(item => {
                    const completion = new vscode.CompletionItem(item.label, item.kind);
                    completion.insertText = new vscode.SnippetString(item.insertText);
                    completion.detail = item.detail;
                    completion.sortText = '!';
                    completion.preselect = true;
                    
                    completion.command = {
                        command: 'latex-helper.environmentInserted',
                        title: 'Environment inserted'
                    };

                    return completion;
                });
            }
        }
    );

    let environmentInserted = vscode.commands.registerCommand('latex-helper.environmentInserted', () => {
        console.log('🎯 Environment snippet inserted');
        
        // Remove any existing handlers
        if (tempHandler) {
            console.log('🧹 Cleaning up old temp handler');
            tempHandler.dispose();
        }
        if (selectionHandler) {
            console.log('🧹 Cleaning up old selection handler');
            selectionHandler.dispose();
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.log('❌ No active editor found');
            return;
        }
        
        const beginLineNumber = editor.selection.active.line;
        console.log(`📍 Begin line number: ${beginLineNumber}`);

        // Create selection change listener
        selectionHandler = vscode.window.onDidChangeTextEditorSelection((event) => {
            const editor = event.textEditor;
            const position = editor.selection.active;
            
            if (position.line !== beginLineNumber && position.line !== beginLineNumber + 1) {
                editor.selections = [new vscode.Selection(position, position)];
                
                if (selectionHandler) {
                    selectionHandler.dispose();
                    selectionHandler = undefined;
                }
                if (tempHandler) {
                    tempHandler.dispose();
                    tempHandler = undefined;
                }
            }
        });

        // Create new temporary handler for Ctrl+Right Arrow
        tempHandler = vscode.commands.registerCommand('cursorWordEndRight', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const position = editor.selection.active;
            
            if (position.line === beginLineNumber) {
                const nextLine = editor.document.lineAt(position.line + 1);
                const contentStart = nextLine.firstNonWhitespaceCharacterIndex;
                const contentEnd = nextLine.range.end.character;
                
                const contentStartPos = new vscode.Position(position.line + 1, contentStart);
                const contentEndPos = new vscode.Position(position.line + 1, contentEnd);
                
                editor.selection = new vscode.Selection(contentStartPos, contentEndPos);
                
                if (tempHandler) {
                    tempHandler.dispose();
                    tempHandler = undefined;
                }
                return;
            }
        });
    });

    // NAVIGATION FUNCTIONALITY
    let navRight = vscode.commands.registerCommand('latex-helper.navEnvRight', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        debugCursorPosition(editor, 'NavRight Start');

        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();
        const cursorOffset = document.offsetAt(position);

        // Find all environment tags with their type and nesting level
        const envTags: EnvTag[] = [];
        const envRegex = /\\(begin|end)\{([^}]*)\}/g;
        let match;

        while ((match = envRegex.exec(text)) !== null) {
            const braceIndex = text.indexOf('{', match.index);
            envTags.push({
                index: braceIndex,
                type: match[1] as 'begin' | 'end',
                name: match[2],
                braceEnd: text.indexOf('}', braceIndex)
            });
        }

        // Find the appropriate next tag
        let targetTag = null;
        for (let i = 0; i < envTags.length; i++) {
            const tag = envTags[i];
            // Skip if this is the tag we're currently inside
            if (cursorOffset > tag.index && cursorOffset <= tag.braceEnd) {
                continue;
            }
            // Skip if this tag is before our cursor
            if (tag.index <= cursorOffset) {
                continue;
            }
            targetTag = tag;
            break;
        }

        console.log('DEBUG - Target tag selected:', targetTag);

        if (targetTag) {
            // Find matching tag using the same function as navLeft
            const matchingTag = findMatchingTag(targetTag, envTags);
            
            console.log('DEBUG - Matching tag found:', matchingTag);

            setTimeout(() => {
                // Get selection ranges for both tags
                const primaryRange = getTagSelectionRange(text, targetTag.index - 1);
                if (!primaryRange) return;
                
                let selections = [new vscode.Selection(
                    document.positionAt(primaryRange.start),
                    document.positionAt(primaryRange.end)
                )];
                
                if (matchingTag) {
                    const secondaryRange = getTagSelectionRange(text, matchingTag.index - 1);
                    if (secondaryRange) {
                        selections.push(new vscode.Selection(
                            document.positionAt(secondaryRange.start),
                            document.positionAt(secondaryRange.end)
                        ));
                    }
                }
                
                editor.selections = selections;
                editor.revealRange(new vscode.Range(
                    document.positionAt(primaryRange.start),
                    document.positionAt(primaryRange.end)
                ));

                // Update the cursor movement listener
                if (disposableListener) {
                    disposableListener.dispose();
                }

                disposableListener = createCursorMovementListener(editor);
            }, 10);
        }
    });

    let navLeft = vscode.commands.registerCommand('latex-helper.navEnvLeft', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        debugCursorPosition(editor, 'NavLeft Start');

        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();
        const cursorOffset = document.offsetAt(position);

        // Find all environment tags with their type and nesting level
        const envTags: EnvTag[] = [];
        const envRegex = /\\(begin|end)\{([^}]*)\}/g;
        let match;

        while ((match = envRegex.exec(text)) !== null) {
            const braceIndex = text.indexOf('{', match.index);
            const braceEnd = text.indexOf('}', braceIndex);
            envTags.push({
                index: braceIndex,
                type: match[1] as 'begin' | 'end',
                name: match[2],
                braceEnd: braceEnd
            });
        }

        // Find the appropriate previous tag
        let targetTag = null;
        for (let i = envTags.length - 1; i >= 0; i--) {
            const tag = envTags[i];
            // Skip if this is the tag we're currently inside
            if (cursorOffset > tag.index && cursorOffset <= tag.braceEnd) {
                continue;
            }
            // Skip if this tag is after our cursor
            if (tag.index >= cursorOffset) {
                continue;
            }
            targetTag = tag;
            break;
        }

        console.log('DEBUG - Target tag selected:', targetTag);

        if (targetTag) {
            // Find matching tag by considering nesting
            const matchingTag = findMatchingTag(targetTag, envTags);
            
            console.log('DEBUG - Matching tag found:', matchingTag);

            // Dispose of any existing listener first
            if (disposableListener) {
                disposableListener.dispose();
                disposableListener = undefined;
            }

            // Set selections immediately
            const primaryRange = getTagSelectionRange(text, targetTag.index - 1);
            if (!primaryRange) return;
            
            let selections = [new vscode.Selection(
                document.positionAt(primaryRange.start),
                document.positionAt(primaryRange.end)
            )];
            
            if (matchingTag) {
                const secondaryRange = getTagSelectionRange(text, matchingTag.index - 1);
                if (secondaryRange) {
                    selections.push(new vscode.Selection(
                        document.positionAt(secondaryRange.start),
                        document.positionAt(secondaryRange.end)
                    ));
                }
            }

            // Set selections and reveal range
            editor.selections = selections;
            editor.revealRange(new vscode.Range(
                document.positionAt(primaryRange.start),
                document.positionAt(primaryRange.end)
            ));

            console.log('DEBUG - Selections set:', selections.map(s => ({
                start: document.offsetAt(s.start),
                end: document.offsetAt(s.end)
            })));

            // Create new listener after a short delay
            setTimeout(() => {
                disposableListener = createCursorMovementListener(editor);
            }, 50);
        }
    });

    // Register do-nothing command to override Ctrl+E
    let doNothing = vscode.commands.registerCommand('latex-helper.doNothing', () => {
        // Intentionally empty
    });
    
    // Python keylogger listener
    pythonProcess.stdout.on('data', (data) => {
        const message = data.toString().trim();
        console.log('🐍 Python:', message);
        
        if (message.startsWith('COMMAND:')) {
            const command = message.split(':')[1];
            if (command === 'right') {
                vscode.commands.executeCommand('latex-helper.navEnvRight');
            } else if (command === 'left') {
                vscode.commands.executeCommand('latex-helper.navEnvLeft');
            }
        }
    });

    // Add this to your activate function, before the command registrations
    let generalCursorListener = vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) {
            debugCursorPosition(e.textEditor, 'General Movement');
        }
    });

    // Register everything
    context.subscriptions.push(
        {
            dispose: () => pythonProcess.kill()
        },
        provider,           // Snippet provider
        environmentInserted, // Snippet command
        navRight,          // Navigation commands
        navLeft,
        doNothing,
        generalCursorListener
    );
}

export function deactivate() {
    console.log('👋 LaTeX Helper deactivated');
}

// Add this helper function to find the matching tag
function findMatchingTag(targetTag: EnvTag, allTags: EnvTag[]): EnvTag | undefined {
    const isBegin = targetTag.type === 'begin';
    const searchTags = isBegin ? 
        allTags.slice(allTags.indexOf(targetTag)) : // search forward from begin
        allTags.slice(0, allTags.indexOf(targetTag)).reverse(); // search backward from end
    
    let nestLevel = 0;
    
    for (const tag of searchTags) {
        if (tag === targetTag) continue;
        
        if (tag.name === targetTag.name) {
            if (isBegin && tag.type === 'end') {
                if (nestLevel === 0) return tag;
                nestLevel--;
            } else if (!isBegin && tag.type === 'begin') {
                if (nestLevel === 0) return tag;
                nestLevel--;
            }
        }
        
        // Track nesting of same-named environments
        if (tag.name === targetTag.name) {
            if (isBegin && tag.type === 'begin') nestLevel++;
            else if (!isBegin && tag.type === 'end') nestLevel++;
        }
    }
    
    return undefined;
}