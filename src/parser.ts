import fs = require("fs");

export function generateFunctionList(path: string)
{
	const functionsMap = new Map<number, string>();

	let content = "";
	const buffer = fs.readFileSync(path, "utf-8");
	let prevChar = '\n';
	let lines = 0;
	for (let i = 0; i < buffer.length-1; i++)
	{
		const c = buffer[i];
		if (c == '/' && buffer[i+1] == '/') { // single line comment
			for (; i < buffer.length && buffer[i] != '\n'; i++);
			prevChar = buffer[i];
			content += '\n';
			lines++;
			continue;
		}
		if (c == '/' && buffer[i+1] == '*') { // multi line comment
			for (; i < buffer.length - 1 && !(buffer[i-1] == '*' && buffer[i] == '/'); i++) {
				if (buffer[i] == '\n') {
					content += '\n';
					lines++;
				}
			}
			prevChar = buffer[i];
			continue;
		}
		if (c == '#' && prevChar == '\n') { // pre-processor
			for (; i < buffer.length - 1 && !(buffer[i-1] != '\\' && buffer[i] == '\n'); i++) {
				if (buffer[i] == '\n') {
					content += '\n';
					lines++;
				}
			}
			content += '\n';
			lines++;
			prevChar = buffer[i];
			continue;
		}
		if (c == '{') {
			content += c;
			let cnt = 0;
			for (; i < buffer.length - 1; i++) {
				if (buffer[i] == '\n') {
					content += '\n';
					lines++;
				}
				if (buffer[i] == '{') cnt++;
				if (buffer[i] == '}') {
					cnt--;
					if (cnt == 0)
						break;
				}
			}
			content += '}';
			prevChar = buffer[i];
			continue;
		}
		content += c;

		if (c == '\n') { lines++; prevChar = buffer[i]; continue; }
		prevChar = buffer[i];
	}

	const regex = /\w+[\s\\*]*\s+(\w+)\([\w\s,\\*]*\)\s*{\s+}/g;
	let arr;
	while ((arr = regex.exec(content)) !== null) {
		let lineNo = 1;
		const funDef = arr[0];
		const fun = arr[1];
		for(let i = 0; i < arr.index; i++)
			if (content[i] == '\n') lineNo++;
		// check if function name is in further line
		const index = funDef.indexOf(fun);
		for(let i = 0; i < index; i++)
			if (funDef[i] == '\n') lineNo++;
		functionsMap.set(lineNo, fun);
		// console.log(`Found ${fun}, at ${lineNo} / ${regex.lastIndex}.`);
	}
	// fs.writeFileSync(path+"1", out);
	return functionsMap;
}