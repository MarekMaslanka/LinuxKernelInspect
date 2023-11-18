import * as vscode from "vscode";

import * as outline from "./outline";
import { Deku, InspectFiles } from "./DekuIntegration";
import { generateFunctionList } from "./parser";
import { setupStatusbar } from "./statusbar";
import { Database } from "./db";
import TreeDecorationProvider from "./TreeDecorationProvider";
import SqlSideViewProvider from "./SqlSideView";
import { decorateChanges } from "./outline";
import { Ftrace } from "./Ftrace";
// import { CodelensProvider } from './CodelensProvider';

const inspectFiles = new InspectFiles();
let functionsMap = new Map<number, string>();

const window = vscode.window;
const workspace = vscode.workspace;

const DB = new Database();

const fileInspectsTreeProvider = new outline.InspectsTreeProvider(DB);
const kernelInspectTreeProvider = new outline.RegisteredInspectTreeProvider(DB);
const functionReturnsTreeProvider = new outline.ReturnsTreeProvider(DB);
const stacktraceTreeProvider = new outline.StacktraceTreeProvider(DB);

const deku = new Deku();
const ftrace = new Ftrace();
const treeDecorator = new TreeDecorationProvider();

const histogramTreeProvider = new outline.HistogramTreeProvider(ftrace);

const editorInspects = new Map<string, Map<number, number>>();

export function activate(context: vscode.ExtensionContext) {
	let activeEditor = vscode.window.activeTextEditor;
	deku.showInspectsForCurrentEditor = showInspectsForCurrentEditor;
	deku.refreshSideViews = refreshSideViews;

	// const codelensProvider = new CodelensProvider();
	// vscode.languages.registerCodeLensProvider("*", codelensProvider);
	inspectFiles.read(DB);
	kernelInspectTreeProvider.refresh();
	workspace.onWillSaveTextDocument(event => {
		const openEditor = vscode.window.visibleTextEditors.filter(
			editor => editor.document.uri === event.document.uri
		)[0];
		decorateChanges(openEditor);
	});

	window.onDidChangeActiveTextEditor(function (editor) {
		activeEditor = editor;
		if (editor) {
			functionsMap.clear();
			decorateChanges(editor);
			refreshSideViews();
			showInspectsForCurrentEditor();
			sqlProvider.activatedFile(vscode.workspace.asRelativePath(editor.document.uri));
		}
	}, null, context.subscriptions);

	workspace.onDidChangeTextDocument(function (event) {
		if (activeEditor && event.document === activeEditor.document) {
			functionsMap.clear();
			decorateChanges(activeEditor);
		}
	}, null, context.subscriptions);

	const sqlProvider = new SqlSideViewProvider(context.extensionUri, DB, rawTime => {
		DB.getTrialByTime(rawTime, row => {
			let inspects = editorInspects.get(row.path);
			if (!inspects) {
				inspects = new Map<number, number>();
				editorInspects.set(row.path, inspects);
			}
			inspects.set(row.function_id, row.trial_id);

			const workspaceFolder = workspace.workspaceFolders![0];
			workspace.openTextDocument(workspaceFolder.uri.path + "/" + row.path).then(doc =>
			{
				window.showTextDocument(doc).then(editor =>
				{
					showInspectsForCurrentEditor();

					const visibleLines = editor.visibleRanges;
					const range = new vscode.Range(row.line_start - 1, 0, row.line_end, 0);
					if (!visibleLines![0].intersection(range)) {
						editor!.revealRange(range);
					}
				});
			});
		});
	});
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"kernelInspect-sqlSidebar",
			sqlProvider
		)
	);

	context.subscriptions.push(
		treeDecorator,
		vscode.languages.registerCodeActionsProvider({ language: "c", scheme: "file" }, new LinuxKernelInspector(), {
			providedCodeActionKinds: LinuxKernelInspector.providedCodeActionKinds
		}));

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(cfg => {
			if (cfg.affectsConfiguration("dekuinspect.path"))
				deku.reload();
		}));

	vscode.commands.registerCommand('kernelinspect.inspect_function', (path: string, fun: string, pattern: string) => {
		inspectFiles.addInspect(path, fun, pattern);
		kernelInspectTreeProvider.refresh();
		startInspecting();
	});

	vscode.commands.registerCommand('outliner.outline', () => {
		refreshSideViews();
	});

	vscode.commands.registerCommand('kernelinspect.remove_inspect_function', (path: string, fun: string) => {
		inspectFiles.removeInspect(path, fun);
		kernelInspectTreeProvider.refresh();
	});

	vscode.commands.registerCommand('kernelinspect.show_inspect_for_trial', (funId: number, trialId: number) => {
		const uri = workspace.asRelativePath(window.activeTextEditor!.document.uri);
		let inspects = editorInspects.get(uri);
		if (!inspects) {
			inspects = new Map<number, number>();
			editorInspects.set(uri, inspects);
		}
		inspects.set(funId, trialId);

		showInspectsForCurrentEditor();

		DB.getFunction(funId, row => {
			const editor = window.activeTextEditor;
			const visibleLines = editor?.visibleRanges;
			const range = new vscode.Range(row.line_start - 1, 0, row.line_end, 0);
			if (!visibleLines![0].intersection(range)) {
				editor!.revealRange(range);
			}
		});
	});

	vscode.commands.registerCommand('kernelinspect.open_file_fun', (file: string, funcName: string) => {
        const workspaceFolder = vscode.workspace.workspaceFolders![0];
		const path = workspaceFolder.uri.path + "/" + file;
		vscode.window.showTextDocument(vscode.Uri.file(path), { preview: false }).then(editor => {
			vscode.commands.executeCommand('deku.gotoFunction', file, funcName);
		});
	});

	vscode.commands.registerCommand('deku.ftrace.recordall', () => {
		trackFunctions();
	});

	vscode.commands.registerCommand('deku.gotoFunction', (file: string, funName: string) => {
		const editor = vscode.window.activeTextEditor;
		const visibleLines = editor?.visibleRanges;
		const functions = getCurrentFunctionsList();
		let line = -1;
		functions.forEach((name, lineno) => {
			if (funName === name)
				line = lineno;
		});
		if (line != -1) {
			const range = new vscode.Range(line - 1, 0, line + 999, 0);
			editor!.revealRange(range);
		}
	});

	vscode.window.registerTreeDataProvider(
		"documentOutline",
		fileInspectsTreeProvider
	);
	vscode.window.registerTreeDataProvider(
		"inspects.file",
		kernelInspectTreeProvider
	);
	vscode.window.registerTreeDataProvider(
		"functionReturnsTreeProvider",
		functionReturnsTreeProvider
	);
	vscode.window.registerTreeDataProvider(
		"functionStacktraceTreeProvider",
		stacktraceTreeProvider
	);
	vscode.window.registerTreeDataProvider(
		"histogram",
		histogramTreeProvider
	);

	// vscode.languages.registerHoverProvider('c', {
	// 	provideHover(document, position, token) {
	// 		const range = document.getWordRangeAtPosition(position);
	// 		const word = document.getText(range);
	// 		const fun = inspects.findFunction(vscode.workspace.asRelativePath(document.uri), position.line + 1);
	// 		if (!fun || fun.range[0] != position.line + 1/* && fun!.name != word*/)
	// 			return undefined;
	// 		// https://stackoverflow.com/questions/54792391/vs-code-hover-extension-implement-hoverprovider
	// 		const markdown = new vscode.MarkdownString(`<span style="color:#fff;background-color:#666;">&nbsp;&nbsp;&nbsp;Stack trace:&nbsp;&nbsp;&nbsp;</span>`);
	// 		markdown.appendText("\n");
	// 		// markdown.appendText("\n______________________________\n");
	// 		// markdown.appendMarkdown(`**Stack trace:**\n`);
	// 		fun.showInspectFor.stacktrace.forEach(line => {
	// 			markdown.appendMarkdown(`* ${line}\n`);
	// 		});
	// 		markdown.isTrusted = true;
	// 		return new vscode.Hover(markdown, new vscode.Range(position, position));
	// 	}
	// });

	setupStatusbar(deku, context.subscriptions, activeEditor);
	deku.init(DB);
	ftrace.init();
	ftrace.onUpdated = () => {
		debouncedSideViews();
	};

	refreshSideViews();
}

function getCurrentFunctionsList(uri?: vscode.Uri) {
	if (!uri)
		uri = vscode.window.activeTextEditor?.document.uri;
	if (functionsMap.size == 0)
		functionsMap = generateFunctionList(uri!.fsPath);
	return functionsMap;
}

function getDecorationMessage(msg: any) {
	const text = (s: any) => ({
		after: {
			contentText: s,
			margin: `0 0 0 2rem`,
			fontStyle: "italic",
		},
	});
	return text(msg);
}

function getDecorationColor() {
	const color = (old: string, dark: string, light: string) => ({
		dark: { after: { color: old || dark } },
		light: { after: { color: old || light } },
	});
	return color(
		"gray",
		"gray",
		"gray",
	);
}

const decorationTypeX = window.createTextEditorDecorationType({});
function decorationX(line: number, msg: string) {
	return {
		renderOptions: {
			...getDecorationColor(),
			...getDecorationMessage(msg),
		},
		range: new vscode.Range(
			new vscode.Position(line - 1, 1024),
			new vscode.Position(line - 1, 1024),
		),
	};
}

const debounce = (fn: Function, ms = 250) => {
	let timeoutId: ReturnType<typeof setTimeout>;
	return function (this: any, ...args: any[]) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn.apply(this, args), ms);
	};
};

const debouncedSideViews = debounce(refreshSideViews);

function refreshSideViews() {
	const uri = vscode.window.activeTextEditor!.document.uri;
	const path = vscode.workspace.asRelativePath(uri);
	if (ftrace.isTracing(path)) {
		const functions = getCurrentFunctionsList();
		const funcs: string[] = [];
		functions.forEach(fun => {
			funcs.push(fun);
		});
		histogramTreeProvider.updatePath(path, funcs);
	} else {
		histogramTreeProvider.updatePath("", []);
	}

	fileInspectsTreeProvider.refresh(path);
	functionReturnsTreeProvider.refresh(path);
	stacktraceTreeProvider.refresh(path);
}

function showInspectInformation(lines: Map<number, string[]>) {
	const allinspects: vscode.DecorationOptions[] = [];
	lines.forEach((values, line) => {
		values.forEach(varVal => {
			allinspects.push(decorationX(line, varVal));
		});
	});
	vscode.window.activeTextEditor?.setDecorations(decorationTypeX, allinspects);
}

function showInspectsForCurrentEditor() {
	const lines = new Map<number, string[]>();

	const uri = workspace.asRelativePath(window.activeTextEditor!.document.uri);
	let inspects = editorInspects.get(uri);
	if (!inspects) {
		inspects = new Map<number, number>();
		editorInspects.set(uri, inspects);
	}
	inspects.forEach((trialId: number, funId: number) => {
		DB.getInspects(funId, trialId, row => {
			const text = row.var_name + ": " + row.var_value;
			const values = lines.get(row.line);
				if (values) {
					values.push(text);
				} else {
					lines.set(row.line, [text]);
				}
			}, (_err: Error | null): void => {
				showInspectInformation(lines);
			});
	});
}

function startInspecting() {
	deku.execDekuDeploy(true);
}

function trackFunctions() {
	const activeEditor = vscode.window.activeTextEditor;
	const uri = activeEditor!.document.uri;
	if (!uri.path.endsWith(".c") && !uri.path.endsWith(".h")) {
		vscode.window.showWarningMessage("Current file is invalid.");
		return;
	}

	const functions = getCurrentFunctionsList();
	if (functions.size == 0) {
		vscode.window.showWarningMessage("Current file does not contain valid functions.");
		return;
	}
	const relPath = vscode.workspace.asRelativePath(uri);
	histogramTreeProvider.updatePath(relPath, []);
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Configure the functions to be tracked",
		cancellable: false
	}, (progress, _token) => {
		const p = new Promise<void>(resolve => {
			ftrace.traceFunctions(functions.values(), relPath, (fun, _success) => {
				const step = 100 / functions.size;
				progress.report({ increment: step, message: ` ${fun}` });
			}, (success) => {
				resolve();
				if (success) {
					const functions = getCurrentFunctionsList();
					const funcs: string[] = [];
					functions.forEach(fun => {
						funcs.push(fun);
					});
					const path = vscode.window.activeTextEditor?.document.uri.fsPath!;
					histogramTreeProvider.updatePath(path, funcs);
					vscode.window.showInformationMessage("Functions are ready to track");
				} else {
					vscode.window.showWarningMessage("Can't track the functions. Unknown error.");
				}
			});
		});
		return p;
	});
}

//////////////////////////////////////////////////////

export class LinuxKernelInspector implements vscode.CodeActionProvider {

	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.Empty
	];

	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
		const functions = getCurrentFunctionsList();
		const actoins = [];
		const fun = functions.get(range.start.line + 1);
		if (fun) {
			actoins.push(this.createInspectAction(document, range, fun));
			actoins.push(this.createInvokeAction(document, range, fun));
		}
		return actoins;
	}

	private createInspectAction(document: vscode.TextDocument, range: vscode.Range, funName: string): vscode.CodeAction {
		let action: vscode.CodeAction;
		const path = vscode.workspace.asRelativePath(document.uri);
		if (inspectFiles.isInspected(path, funName)) {
			action = new vscode.CodeAction(`Remove inspection from the function`, vscode.CodeActionKind.Empty);
			action.command = {
				command: 'kernelinspect.remove_inspect_function',
				title: 'Remove-LinuxKernelInspect-Title',
				tooltip: 'Remove-LinuxKernelInspect-Tooltip.',
				arguments: [path, funName]
			};
		} else {
			const line = document.lineAt(range.start).text;
			action = new vscode.CodeAction(`Inspect the function`, vscode.CodeActionKind.Empty);
			action.command = {
				command: 'kernelinspect.inspect_function',
				title: 'LinuxKernelInspect-Title',
				tooltip: 'LinuxKernelInspect-Tooltip.',
				arguments: [path, funName, line]
			};
		}
		return action;
	}

	private createInvokeAction(document: vscode.TextDocument, range: vscode.Range, funName: string): vscode.CodeAction {
		const fix = new vscode.CodeAction(`Invoke the function`, vscode.CodeActionKind.Empty);
		// fix.edit = new vscode.WorkspaceEdit();
		// fix.edit.replace(document.uri, new vscode.Range(range.start, range.start.translate(0, 2)), emoji);
		return fix;
	}

}
