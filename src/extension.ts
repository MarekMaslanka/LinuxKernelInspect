import * as vscode from "vscode";

import * as outline from "./outline";
import { Deku, InspectFiles } from "./DekuIntegration";
import { generateFunctionList } from "./parser";
import { setupStatusbar } from "./statusbar";
import { Database } from "./db";
import TreeDecorationProvider from "./TreeDecorationProvider";
import SqlSideViewProvider from "./SqlSideView";
import { decorateChanges } from "./outline";
// import { CodelensProvider } from './CodelensProvider';

const inspectFiles = new InspectFiles();
let functionsMap = new Map<number, string>();

const window = vscode.window;
const workspace = vscode.workspace;

const inspects = new outline.LensInspectionRoot();

const treeProvider = new outline.InspectOutlineProvider(undefined);
const kernelInspectTreeProvider = new outline.KernelInspectTreeProvider(undefined);
const functionReturnsTreeProvider = new outline.ReturnsOutlineProvider(undefined);
const stacktraceTreeProvider = new outline.StacktraceTreeProvider(undefined);

const DB = new Database();
const deku = new Deku();

export function activate(context: vscode.ExtensionContext) {
	let activeEditor = vscode.window.activeTextEditor;
	deku.inspects = inspects;
	deku.showInspectsForCurrentEditor = showInspectsForCurrentEditor;
	deku.refreshOutline = refreshOutline;

	// const codelensProvider = new CodelensProvider();
	// vscode.languages.registerCodeLensProvider("*", codelensProvider);
	inspectFiles.read();
	kernelInspectTreeProvider.refresh(inspectFiles.inspections);
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
			refreshOutline();
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
		const time = inspects.findTrial(vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri), rawTime);
		if (!time) {
			vscode.window.showErrorMessage("Unknown error");
			return;
		}

		///////////////

		time.fun.showInspectFor = time;
		const lines = new Map<number, string[]>();
		inspects.files.forEach(file => {
			if (file.file == vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri))
				file.functions.forEach(func => {
					func.showInspectFor.lines.forEach((values, line) => {
						lines.set(line, values);
					});
				});
		});
		showInspectInformation(lines);
		const editor = vscode.window.activeTextEditor;
		const visibleLines = editor?.visibleRanges;
		const range = new vscode.Range(time.fun.range[0] - 1, 0, time.fun.range[1], 0);
		if (!visibleLines![0].intersection(range))
			editor!.revealRange(range);
	});
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"kernelInspect-sqlSidebar",
			sqlProvider
		)
	);

	context.subscriptions.push(
		new TreeDecorationProvider(),
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
		kernelInspectTreeProvider.refresh(inspectFiles.inspections);
		startInspecting();
	});

	vscode.commands.registerCommand('outliner.outline', () => {
		refreshOutline();
	});

	vscode.commands.registerCommand('kernelinspect.remove_inspect_function', (path: string, fun: string) => {
		inspectFiles.removeInspect(path, fun);
		kernelInspectTreeProvider.refresh(inspectFiles.inspections);
	});

	vscode.commands.registerCommand('kernelinspect.show_inspect_for', (time: outline.LensInspectionAtTime) => {
		time.fun.showInspectFor = time;
		const lines = new Map<number, string[]>();
		inspects.files.forEach(file => {
			if (file.file == vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri))
				file.functions.forEach(func => {
					func.showInspectFor.lines.forEach((values, line) => {
						lines.set(line, values);
					});
				});
		});
		showInspectInformation(lines);
		const editor = vscode.window.activeTextEditor;
		const visibleLines = editor?.visibleRanges;
		const range = new vscode.Range(time.fun.range[0] - 1, 0, time.fun.range[1], 0);
		if (!visibleLines![0].intersection(range))
			editor!.revealRange(range);
	});

	vscode.commands.registerCommand('kernelinspect.open_file_fun', (file: string, funcName: string) => {
		vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
	});

	vscode.window.registerTreeDataProvider(
		"documentOutline",
		treeProvider
	);
	vscode.window.registerTreeDataProvider(
		"documentOutline2",
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

	vscode.languages.registerHoverProvider('c', {
		provideHover(document, position, token) {
			const range = document.getWordRangeAtPosition(position);
			const word = document.getText(range);
			const fun = inspects.findFunction(vscode.workspace.asRelativePath(document.uri), position.line + 1);
			if (!fun || fun.range[0] != position.line + 1/* && fun!.name != word*/)
				return undefined;
			// https://stackoverflow.com/questions/54792391/vs-code-hover-extension-implement-hoverprovider
			const markdown = new vscode.MarkdownString(`<span style="color:#fff;background-color:#666;">&nbsp;&nbsp;&nbsp;Stack trace:&nbsp;&nbsp;&nbsp;</span>`);
			markdown.appendText("\n");
			// markdown.appendText("\n______________________________\n");
			// markdown.appendMarkdown(`**Stack trace:**\n`);
			fun.showInspectFor.stacktrace.forEach(line => {
				markdown.appendMarkdown(`* ${line}\n`);
			});
			markdown.isTrusted = true;
			return new vscode.Hover(markdown, new vscode.Range(position, position));
		}
	});

	setupStatusbar(deku, context.subscriptions, activeEditor);
	deku.init(DB);

	DB.getAllTrials(row => {
		// console.log(row);
		const func = inspects.getOrCreateFunc(row.path, row.name, row.line_start, row.line_end);
		const time = row.time as number;
		const timeStr = time.toString();
		const trial = new outline.LensInspectionAtTime(func, time, timeStr);
		trial.returnAtLine = row.return_line ? row.return_line : row.line_end;
		trial.returnTime = row.return_time;
		trial.stacktrace = row.stacktrace;
		trial.stacktraceSum = row.stacktraceSum;
		const trialIndex = func.times.length;
		func.times.push(trial);
		addInspectForTrial(trial, row.line_start, "execute time: "+"execTime");
		if (row.return_line) {
			addInspectForTrial(trial, row.line_end, "return here");
		}
		DB.getInspects(row.trial_id, row => {
			// console.log(row);
			const msg = row.var_name + ": " + row.var_value;

			addInspectForTrial(trial, row.line, msg);
		});
	});
}

function addInspectForTrial(trial: outline.LensInspectionAtTime, line: number, value: string, name?: string) {
	const vars = trial.lines.get(line) != undefined ? trial.lines.get(line) : trial.lines.set(line, []).get(line);
	vars!.push(value);
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

function refreshOutline() {
	for(const file of inspects.files) {
		if (file.file == vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri)) {
			treeProvider.refresh(file);
			functionReturnsTreeProvider.refresh(file);
			stacktraceTreeProvider.refresh(file);
			return;
		}
	}
	treeProvider.refresh(undefined);
	functionReturnsTreeProvider.refresh(undefined);
	stacktraceTreeProvider.refresh(undefined);
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

function clearCodeLensInspections(file: string, start: number, end: number) {
	inspects.files = [];
	vscode.window.activeTextEditor?.setDecorations(decorationTypeX, []);
}

function showInspectsForCurrentEditor() {
	const lines = new Map<number, string[]>();
	inspects.files.forEach(file => {
		if (file.file == vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri))
			file.functions.forEach(func => {
				if (func.times.length)
					func.times[func.times.length - 1].lines.forEach((values, line) => {
						lines.set(line, values);
					});
			});
	});
	showInspectInformation(lines);
}

function startInspecting() {
	deku.execDekuDeploy();
}

//////////////////////////////////////////////////////

export class LinuxKernelInspector implements vscode.CodeActionProvider {

	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.Empty
	];

	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
		if (functionsMap.size == 0)
			functionsMap = generateFunctionList(document.uri.path);
		const actoins = [];
		const fun = functionsMap.get(range.start.line + 1);
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
			action.command = { command: 'kernelinspect.remove_inspect_function', title: 'Remove-LinuxKernelInspect-Title', tooltip: 'Remove-LinuxKernelInspect-Tooltip.', arguments: [path, funName] };
		} else {
			const line = document.lineAt(range.start).text;
			action = new vscode.CodeAction(`Inspect the function`, vscode.CodeActionKind.Empty);
			action.command = { command: 'kernelinspect.inspect_function', title: 'LinuxKernelInspect-Title', tooltip: 'LinuxKernelInspect-Tooltip.', arguments: [path, funName, line] };
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
