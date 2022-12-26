import * as vscode from 'vscode';
import * as path from 'path';
import { Database } from './db';

export default class SqlSideViewProvider implements vscode.WebviewViewProvider
{
	public static readonly viewType = 'kernelinspect.sqlView';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly DB: Database,
		private readonly showTrialCb: (trial: any) => void
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	)
	{
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'trialSelected':
				{
					this.showTrialCb(data.value);
					// vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
					break;
				}
				case 'execSqlQuery':
				{
					this.clearSqlResults();
					this.DB.execSelectQuery(data.value, row => {
						this.addRow(row);
					});
					break;
				}
			}
		});
	}

	public addRow(row: any)
	{
		// const row = { id: 32, time: 21, path: "sadffsd" };
		if (this._view) {
			this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
			this._view.webview.postMessage({ type: 'addRow', data: row });
		}
	}

	public clearSqlResults()
	{
		if (this._view) {
			this._view.webview.postMessage({ type: 'clearSqlResults' });
		}
	}

	public activatedFile(path: string)
	{
		if (this._view) {
			this._view.webview.postMessage({ type: 'showQuery', data: `SELECT * FROM variables WHERE path = "${path}"` });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview)
	{
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(joinPath(this._extensionUri, 'resources', 'sqlsideview', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(joinPath(this._extensionUri, 'resources', 'sqlsideview', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(joinPath(this._extensionUri, 'resources', 'sqlsideview', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(joinPath(this._extensionUri, 'resources', 'sqlsideview', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				<script>
					function bar() {
						//do stuff
					}
				</script>
				<title>DEKU SQL</title>
			</head>
			<body>
				<input type=text onKeyUp="return bar()" value="SELECT * FROM variables" />
				<button class="exec-sql-query">Run query</button>
				<div class="res-table"></div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function joinPath(uri: vscode.Uri, ...pathFragment: string[]): vscode.Uri {
	// Reimplementation of
	// https://github.com/microsoft/vscode/blob/b251bd952b84a3bdf68dad0141c37137dac55d64/src/vs/base/common/uri.ts#L346-L357
	// with Node.JS path. This is a temporary workaround for https://github.com/eclipse-theia/theia/issues/8752.
	if (!uri.path) {
		throw new Error('[UriError]: cannot call joinPaths on URI without path');
	}
	return uri.with({ path: vscode.Uri.file(path.join(uri.fsPath, ...pathFragment)).path });
}