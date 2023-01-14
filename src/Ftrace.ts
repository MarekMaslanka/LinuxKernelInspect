import * as vscode from "vscode";

import { DEKUConfig } from "./DekuIntegration";

export class TracedFunction
{
	funName = "";
	count = 0;
	parents = new Map<string, number>();

	constructor(funName: string, count?: number)
	{
		this.funName = funName;
		if (count != undefined)
			this.count = count;
	}

}

export class Ftrace
{
	public histogram = new Map<string, TracedFunction>();
	public avaiableTraces = new Map<string, TracedFunction[]>();
	public onFunctionTraced?: (fun: string, trace: TracedFunction) => void;
	public onUpdated?: () => void;
	private listenerProc: any = undefined;

	public async init()
	{
	}

	public reload()
	{
		vscode.window.showInformationMessage("Please reload VSCode to apply new settings.");
	}

	public isTracing(path: string)
	{
		return this.avaiableTraces.has(path);
	}

	public traceFunctions(funcs: IterableIterator<string>, path: string, onProgress: (fun: string, success: boolean) => void, onFinish: (success: boolean) => void)
	{
		let funcsList = "";
		let fun;
		this.avaiableTraces.set(path, []);
		while ((fun = funcs.next()) && fun.done != true) {
			funcsList += fun.value + "\n";
		}
		// this.listenerProc.kill('SIGHUP');

		this.runCommand("echo function > /sys/kernel/tracing/current_tracer;" +
						"cat > /tmp/functions_to_trace << EOF\n" + funcsList + "EOF",
						(success) => {
			if (!success && onFinish)
				onFinish(false)
			if (success) {
				this.runCommand("echo 0 > /sys/kernel/tracing/tracing_on;" +
								"while read fun; do " +
								"echo $fun 2>/dev/null >> /sys/kernel/tracing/set_ftrace_filter && echo \"O:$fun\" || echo \"N:$fun\";" +
								"done < /tmp/functions_to_trace;" +
								"echo 1 > /sys/kernel/tracing/tracing_on", (success) => {
									if (success) {
										if (this.listenerProc == undefined)
											this.runListenenServer(0);
									}
									onFinish(success);
								}, (fun) => {
									const isOk = fun[0] == "O";
									fun = fun.substring(2);
									if (isOk) {
										const traces = this.avaiableTraces.get(path);
										const trace = new TracedFunction(fun);
										traces?.push(trace);
										this.histogram.set(fun, trace);
									}
									onProgress(fun, isOk);
								});
			}
		});
	}

	private async runCommand(cmd: string, onFinish?: (success: boolean) => void, onTrace?: (line: string) => void) {
		const conf = new DEKUConfig();
		const cproc = await require('child_process');
		const spawn = cproc.spawn;

		const args = ["-i", conf.workdir + "/testing_rsa",
					"-o StrictHostKeyChecking=no", "-o UserKnownHostsFile=/dev/null",
					"-o ControlPath=/tmp/ssh-deku-%r@%h:%p", "-o ControlMaster=auto",
					"-T", conf.address, "-p", conf.port,
					cmd];
		const child = spawn("ssh", args);

		const buffer = Buffer.alloc(1024 * 100);
		let bufferIndex = 0;
		child.stdout.on('data', (data: Buffer) => {
			if (onTrace) {
				for (let i = 0; i < data.length; i++) {
					if (data[i] == 10) {
						onTrace(buffer.slice(0, bufferIndex).toString().trim());
						bufferIndex = 0;
						continue;
					}
					buffer[bufferIndex++] = data[i];
				}
			}
		});

		child.stderr.on('data', (data: string) => {
			console.log('stderr: ' + data);
		});

		child.on('close', (code: string) => {
			// console.log('exit code: ' + code);
			if (onFinish)
				onFinish(code == "0");
		});
	}

	private parseFtraceLine(line: string){
		let regexp = new RegExp(".* (\\d+\\.\\d+): (.+) <-(.+)$", "g");
		let match = regexp.exec(line);
		if (match != null) {
			const fun = match[2];
			const parent = match[3];

			const trace = this.histogram.get(fun)!;
			if (trace != undefined) {
				trace.count++;
				let parentsCount = trace.parents.get(parent);
				if (parentsCount == undefined)
					parentsCount = 0;
				trace.parents.set(parent, parentsCount + 1);

				if (this.onFunctionTraced)
					this.onFunctionTraced(fun, trace);
			}
			return;
		}
		regexp = new RegExp(".* \\[LOST (\\d+) EVENTS\\]$", "g");
		match = regexp.exec(line);
		if (match != null) {
			const lost = match[1];
			vscode.window.showWarningMessage(`Losing ${lost} events for histogram statistics.\n` +
										   "Increase trace buffer on the device using command:\n" +
										   "echo 1000 > /sys/kernel/debug/tracing/buffer_size_kb");
			return;
		}
		if (line != "")
			console.log("Unknown trace: " + line);
	}

	private async runListenenServer(iter: number) {
		const conf = new DEKUConfig();
		const cproc = await require('child_process');
		const spawn = cproc.spawn;

		const args = ["-i", conf.workdir + "/testing_rsa",
					"-o StrictHostKeyChecking=no", "-o UserKnownHostsFile=/dev/null",
					"-o ControlPath=/tmp/ssh-deku-%r@%h:%p", "-o ControlMaster=auto",
					"-tt", conf.address, "-p", conf.port,
					"cat", "/sys/kernel/tracing/trace_pipe"];
		this.listenerProc = spawn("ssh", args);

		const buffer = Buffer.alloc(1024*100);
		let bufferIndex = 0;
		this.listenerProc!.stdout.on('data', (data: Buffer) => {
			for (let i = 0; i < data.length; i++) {
				if (data[i] == 10 || data[i] == 13) {
					const line = buffer.slice(0, bufferIndex).toString().trim();
					this.parseFtraceLine(line);
					bufferIndex = 0;
					if (data[i + 1] == 10)
						i++;
					continue;
				}
				buffer[bufferIndex++] = data[i];
			}
			if (this.onUpdated)
				this.onUpdated();
		});

		this.listenerProc.stderr.on('data', (data: string) => {
			if (data.includes("Warning: Permanently added ")) {
				iter = 0;
				return;
			}
			console.log('stderr: ' + data);
		});

		this.listenerProc.on('close', (code: string) => {
			if (iter == 0) {
				vscode.window.showErrorMessage("Daemon to track the functions has disconnected!");
				console.log('exit code: ' + code);
				this.listenerProc = undefined;
			}
		});
	}
}