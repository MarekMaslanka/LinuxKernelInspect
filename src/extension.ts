import * as vscode from "vscode";
import * as CRC32 from "crc-32";

import * as outline from "./outline";
import { DEKUConfig, execDekuDeploy, InspectFiles } from "./DekuIntegration";
import { generateFunctionList } from "./parser";
import { setupStatusbar } from "./statusbar";
import { Database } from "./db";
import TreeDecorationProvider from "./TreeDecorationProvider";
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

const inspects = new outline.LensInspectionRoot();

const treeProvider = new outline.InspectOutlineProvider(undefined);
const kernelInspectTreeProvider = new outline.KernelInspectTreeProvider(undefined);
const functionReturnsTreeProvider = new outline.ReturnsOutlineProvider(undefined);

const DB = new Database();

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
		new TreeDecorationProvider(),
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

	vscode.languages.registerHoverProvider('c', {
		provideHover(document, position, token) {
			const range = document.getWordRangeAtPosition(position);
			const word = document.getText(range);
			const fun = inspects.findFunction(vscode.workspace.asRelativePath(document.uri), position.line + 1);
			if (!fun/* && fun!.name != word*/)
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

	setupStatusbar(context.subscriptions, activeEditor);
	runListenenServer(0);
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
			functionReturnsTreeProvider.refresh(file);
			return;
		}
	}
	treeProvider.refresh(undefined);
	functionReturnsTreeProvider.refresh(undefined);
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

function decimalHexTwosComplement(decimal: number) {
	const size = 8;

	if (decimal >= 0) {
		let hexadecimal = decimal.toString(16);

		while ((hexadecimal.length % size) != 0)
			hexadecimal = "" + 0 + hexadecimal;

		return hexadecimal;
	} else {
		let hexadecimal = Math.abs(decimal).toString(16);
		while ((hexadecimal.length % size) != 0)
			hexadecimal = "" + 0 + hexadecimal;

		let output = '';
		for (let i = 0; i < hexadecimal.length; i++)
			output += (0x0F - parseInt(hexadecimal[i], 16)).toString(16);

		output = (0x01 + parseInt(output, 16)).toString(16);
		return output;
	}
}

async function runListenenServer(iter: number) {
	const cproc = await require('child_process');
	const spawn = cproc.spawn;

	const args = ["-i", DEKUConfig.workdir + "/testing_rsa", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "root@"+DEKUConfig.address, "-p", DEKUConfig.port, "dmesg", "-w"];
	const child = spawn("ssh", args);

	child.stdout.on('data', function (data: string) {
		let refreshInspects = false;
		let refreshOutlineTree = false;
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
					const regexp = new RegExp("^\\-\\d+$", "g");
					if (regexp.exec(msg) != null) {
						const val = Number.parseInt(msg);
						if (val < 100000) {
							msg = "0x"+decimalHexTwosComplement(val);
						}
					}
					key = key.substring(0, key.length - 2);
					msg = key + ": " + msg;
					DB.addLineInspect(file, "", line, key, msg);
				}
				else {
					msg = match[4];
					DB.addLineInspect(file, "", line, msg);
				}
				outline.addInspectInformation(inspects, file, line, msg);
				refreshInspects = true;
			}
			regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function: (.+):(.+):(\\d+):(\\d+)$", "g");
			match = regexp.exec(line);
			if (match != null) {
				const time = parseFloat(match[1]);
				const file = match[2];
				const funName = match[3];
				const line = Number.parseInt(match[4]);
				const lineEnd = Number.parseInt(match[5]);
				const func = inspects.getOrCreateFunc(file, funName, line, lineEnd);
				func.times.push(new outline.LensInspectionAtTime(func, time, match[1]));
				if (func.showInspectFor.time == 0)
					func.showInspectFor = func.times[0];
				DB.startTrial(file, line, lineEnd, funName, time);
			}
			regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function Pointer: (.+):(\\d+):(.+):(.+)$", "g");
			match = regexp.exec(line);
			if (match != null) {
				const file = match[2];
				const line = Number.parseInt(match[3]);
				const varName = match[4];
				const val = match[5].split("+")[0];
				const msg = varName + ": " + val;
				outline.addInspectInformation(inspects, file, line, msg);
				DB.addLineInspect(file, "", line, varName, val);
				refreshInspects = true;
			}
			regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function return value: (.+):(\\d+):(.+) (.+) = (.+)$", "g");
			match = regexp.exec(line);
			if (match != null) {
				let time = parseFloat(match[1]);
				const file = match[2];
				const line = Number.parseInt(match[3]);
				const funName = match[4];
				const msg = "return here: "+match[5] + ": " + match[6];
				outline.addInspectInformation(inspects, file, line, msg);
				const func = inspects.getFunction(file, funName);
				const currFunTime = func!.currentTime();
				currFunTime.returnAtLine = line;
				currFunTime.returnTime = time;
				const t1 = currFunTime.time;
				time -= t1;
				let textTime = time.toFixed(3)+"s";
				if (time < 0.000001)
					textTime = (time * 1000000).toFixed(3)+"µs";
				else if (time < 0.001)
					textTime = (time * 1000000).toFixed(0)+"µs";
				else if (time < 0.0)
					textTime = (time * 1000).toFixed(0)+"ms";

				outline.addInspectInformation(inspects, file, func!.range[0], "execute time: "+textTime);
				DB.functionReturn(line, funName, time, match[5], match[6]);
				refreshInspects = true;
			}
			regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function (return|finish): (.+):(\\d+):(.+)$", "g");
			match = regexp.exec(line);
			if (match != null) {
				let time = parseFloat(match[1]);
				const file = match[3];
				const funName = match[5];
				const func = inspects.getFunction(file, funName);
				const currFunTime = func!.currentTime();
				let line;
				if (match[2] == "return") {
					line = Number.parseInt(match[4]);
					outline.addInspectInformation(inspects, file, line, "return here");
					currFunTime.returnAtLine = line;
				}
				currFunTime.returnTime = time;
				const t1 = currFunTime.time;
				time -= t1;
				let textTime = time.toFixed(3)+"s";
				if (time < 0.000001)
					textTime = (time * 1000000).toFixed(3)+"µs";
				else if (time < 0.001)
					textTime = (time * 1000000).toFixed(0)+"µs";
				else if (time < 0.0)
					textTime = (time * 1000).toFixed(0)+"ms";

				outline.addInspectInformation(inspects, file, func!.range[0], "execute time: "+textTime);
				DB.functionReturn(time, funName, line);
				refreshInspects = true;
			}
			regexp = new RegExp("^\\[\\s*(\\d+\\.\\d+)\\] DEKU Inspect: Function stacktrace:(.+):(\\w+) (.+)$", "g");
			match = regexp.exec(line);
			if (match != null) {
				const file = match[2];
				const funName = match[3];
				const func = inspects.getFunction(file, funName);
				const text = match[4];
				const currFunTime = func!.currentTime();
				currFunTime!.stacktraceSum = CRC32.str(text);
				text.split(',').forEach(line => {
					if (line.length > 0)
						currFunTime!.stacktrace.push(line.split(" ")[0]);
				});
				DB.addStacktrace(file, funName, text);
				refreshOutlineTree = true;
			}
		});
		if (refreshInspects) {
			refreshOutline();
			showInspectsForCurrentEditor();
		} else if (refreshOutlineTree) {
			refreshOutline();
		}
	});

	child.stderr.on('data', function (data: string) {
		if (data.includes("Warning: Permanently added ")) {
			vscode.window.showInformationMessage("Connected to Chromebook succesfully");
			iter = 0;
		}
		console.log('stderr: ' + data);
	});

	child.on('close', function (code: string) {
		if (iter == 0) {
			vscode.window.showErrorMessage("SSH Disconnected.");
			console.log('exit code: ' + code);
		}
		// setTimeout(runListenenServer, 1000 * iter <= 3 ? 1 : 10, iter + 1);
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
			action = new vscode.CodeAction(`Remove inspection from the ${funName} function`, vscode.CodeActionKind.Empty);
			action.command = { command: 'kernelinspect.remove_inspect_function', title: 'Remove-LinuxKernelInspect-Title', tooltip: 'Remove-LinuxKernelInspect-Tooltip.', arguments: [path, funName] };
		} else {
			const line = document.lineAt(range.start).text;
			action = new vscode.CodeAction(`Inspect the ${funName} function`, vscode.CodeActionKind.Empty);
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
