import * as vscode from "vscode";

import { addInspectInformation, InspectOutlineProvider, KernelInspectTreeProvider, LensInspectionAtTime, LensInspectionRoot } from "./outline";
import { DEKUConfig, execDekuDeploy, InspectFiles } from "./DekuIntegration";
import { generateFunctionList } from "./parser";
import { setupStatusbar } from "./statusbar";
// import { CodelensProvider } from './CodelensProvider';

const inspectFiles = new InspectFiles();
let functionsMap = new Map<number, string>();

const decorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: "rgba(0, 150, 0, 0.2)",
	// outline: "2px solid white",
	// opacity: "0.3",
	after: {
		contentText: "Random text",
		color: "gray",
		fontStyle: "italic"
	},
	isWholeLine: true,
});

const window = vscode.window;
const workspace = vscode.workspace;

const inspects = new LensInspectionRoot();

const treeProvider = new InspectOutlineProvider(undefined);
const kernelInspectTreeProvider = new KernelInspectTreeProvider(undefined);

export function activate(context: vscode.ExtensionContext) {
	let activeEditor = vscode.window.activeTextEditor;

	// const codelensProvider = new CodelensProvider();
	// vscode.languages.registerCodeLensProvider("*", codelensProvider);
	inspectFiles.read();
	kernelInspectTreeProvider.refresh(inspectFiles.inspections);
	workspace.onWillSaveTextDocument(event => {
		const openEditor = vscode.window.visibleTextEditors.filter(
			editor => editor.document.uri === event.document.uri
		)[0];
		decorate(openEditor);
	});

	window.onDidChangeActiveTextEditor(function (editor) {
		activeEditor = editor;
		if (editor) {
			functionsMap.clear();
			decorate(editor);
			refreshOutline();
			showInspectsForCurrentEditor();
		}
	}, null, context.subscriptions);

	workspace.onDidChangeTextDocument(function (event) {
		if (activeEditor && event.document === activeEditor.document) {
			functionsMap.clear();
			decorate(activeEditor);
		}
	}, null, context.subscriptions);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ language: "c", scheme: "file" }, new LinuxKernelInspector(), {
			providedCodeActionKinds: LinuxKernelInspector.providedCodeActionKinds
		}));

	vscode.commands.registerCommand('kernelinspect.inspect_function', (path: string, fun: string, pattern: string) => {
		inspectFiles.addInspect(path, fun, pattern);
		kernelInspectTreeProvider.refresh(inspectFiles.inspections);
		// startInspecting();
	});

	vscode.commands.registerCommand('outliner.outline', () => {
		refreshOutline();
	});

	vscode.commands.registerCommand('kernelinspect.remove_inspect_function', (path: string, fun: string) => {
		inspectFiles.removeInspect(path, fun);
		kernelInspectTreeProvider.refresh(inspectFiles.inspections);
	});

	vscode.commands.registerCommand('kernelinspect.show_inspect_for', (time: LensInspectionAtTime) => {
		showInspectInformation(time.lines);
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

	setupStatusbar(context.subscriptions, activeEditor);
	runListenenServer();
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

function decorate(editor: vscode.TextEditor) {
	// const sourceCode = editor.document.getText();
	// const regex = /(console\.log)/;

	// const decorationsArray: vscode.DecorationOptions[] = [];
	// {
	//   const range = new vscode.Range(0, 0, 10, 0);
	//   decorationsArray.push({ range });
	// }

	// editor.setDecorations(decorationType, decorationsArray);
}

function refreshOutline() {
	for(const file of inspects.files) {
		if (file.file == vscode.workspace.asRelativePath(vscode.window.activeTextEditor!.document.uri)) {
			treeProvider.refresh(file);
			return;
		}
	}
	treeProvider.refresh(undefined);
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

async function runListenenServer() {
	const cproc = await require('child_process');
	const spawn = cproc.spawn;

	const args = ["-i", DEKUConfig.workdir + "/testing_rsa", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "root@"+DEKUConfig.address, "-p", DEKUConfig.port, "dmesg", "-w"];
	const child = spawn("ssh", args);

	child.stdout.on('data', function (data: string) {
		let refreshInspects = false;
		data.toString().split("\n").forEach((line) => {
			// console.log(line);
			let regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: (.+):(\\d+) (.+ =)? (.+)$", "g");
			let match = regexp.exec(line);
			if (match != null) {
				let key = "";
				let msg = "";
				const file = match[2];
				const line = Number.parseInt(match[3]);
				if (match.length == 6) {
					key = match[4];
					msg = match[5];
					key = key.substring(0, key.length - 2);
					msg = key + " = " + msg;
				}
				else {
					msg = match[4];
				}
				addInspectInformation(inspects, file, line, msg);
				refreshInspects = true;
			} else {
				regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function: (.+):(.+):(\\d+):(\\d+)$", "g");
				match = regexp.exec(line);
				if (match != null) {
					const func = inspects.getOrCreateFunc(match[2], match[3], Number.parseInt(match[4]), Number.parseInt(match[5]));
					func.times.push(new LensInspectionAtTime(match[1]));
				}
				refreshInspects = true;
			}
		});
		if (refreshInspects) {
			refreshOutline();
			showInspectsForCurrentEditor();
		}
	});

	child.stderr.on('data', function (data: string) {
		if (data.includes("Warning: Permanently added "))
			vscode.window.showInformationMessage("Connected to Chromebook succesfully");
		console.log('stderr: ' + data);
	});

	child.on('close', function (code: string) {
		vscode.window.showErrorMessage("SSH Disconnected.");
		console.log('exit code: ' + code);
		process.exit();
	});
}

function startInspecting() {
	execDekuDeploy();
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
