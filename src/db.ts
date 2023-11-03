import * as sqlite from "sqlite3";

export class Database {
	private db = new sqlite.Database(':memory:');

	public constructor() {
		this.db.serialize();
		this.db.run('DROP TABLE IF EXISTS file;', this.insertCb);
		this.db.run('DROP TABLE IF EXISTS function;', this.insertCb);
		this.db.run('DROP TABLE IF EXISTS trial;', this.insertCb);
		this.db.run('DROP TABLE IF EXISTS stacktrace;', this.insertCb);
		this.db.run('DROP TABLE IF EXISTS inspect;', this.insertCb);
		this.db.run('DROP VIEW IF EXISTS variables;', this.insertCb);

		this.db.run('CREATE TABLE "file" (\
			"id"	INTEGER NOT NULL UNIQUE,\
			"path"	TEXT NOT NULL,\
			"source"	TEXT NOT NULL,\
			"commit_hash"	TEXT NOT NULL,\
			PRIMARY KEY("id" AUTOINCREMENT),\
			UNIQUE(path, source, commit_hash)\
			)', this.insertCb);
		this.db.run('CREATE TABLE "function" (\
			"id"	INTEGER NOT NULL UNIQUE,\
			"file_id"	INTEGER NOT NULL,\
			"name"	TEXT NOT NULL,\
			"line_start"	INTEGER NOT NULL,\
			"line_end"	INTEGER NOT NULL,\
			FOREIGN KEY("file_id") REFERENCES "file"("id") ON UPDATE CASCADE ON DELETE CASCADE,\
			PRIMARY KEY("id" AUTOINCREMENT),\
			UNIQUE(file_id, name)\
			)', this.insertCb);
		this.db.run('CREATE TABLE "trial" (\
			"id"	INTEGER NOT NULL,\
			"time"	INTEGER NOT NULL,\
			"return_time"	INTEGER NOT NULL,\
			"return_line"	INTEGER NOT NULL,\
			"function_id"	INTEGER NOT NULL,\
			"stacktrace"	INTEGER,\
			FOREIGN KEY("function_id") REFERENCES "function"("id")\
			)', this.insertCb);
		this.db.run('CREATE TABLE "stacktrace" (\
			"id"	INTEGER NOT NULL UNIQUE,\
			"stacktrace"	TEXT NOT NULL,\
			"sum"	INTEGER NOT NULL UNIQUE,\
			PRIMARY KEY("id" AUTOINCREMENT)\
			)', this.insertCb);
		this.db.run('CREATE TABLE "inspect" (\
			"id"	INTEGER NOT NULL UNIQUE,\
			"trial_id"	INTEGER NOT NULL,\
			"function_id"	INTEGER NOT NULL,\
			"line"	INTEGER NOT NULL,\
			"var_name"	TEXT,\
			"var_value"	TEXT,\
			"msg"	TEXT,\
			FOREIGN KEY("trial_id") REFERENCES "trial"("id"),\
			PRIMARY KEY("id" AUTOINCREMENT),\
			FOREIGN KEY("function_id") REFERENCES "function"("id")\
			)', this.insertCb);
		this.db.run('CREATE VIEW variables AS\
			SELECT time, var_name, var_value, line, path FROM inspect\
			INNER JOIN trial ON trial.id = inspect.trial_id\
			INNER JOIN function ON function.id = trial.function_id\
			INNER JOIN file ON file.id = function.file_id',
			this.insertCb);
	}

	public getAllTrials(callbackfn: (row: any) => void) {
		// this.db.each("SELECT * FROM stacktrace INNER JOIN trial ON trial.id = stacktrace.trial_id INNER JOIN function ON function.id = trial.function_id INNER JOIN file ON file.id = function.file_id", (err, row) => {
		// 	callbackfn(row);
		// });
	}

	public getInspects(trialId: number, callbackfn: (row: any) => void) {
		this.db.each("SELECT * FROM inspect INNER JOIN trial ON trial.id = inspect.trial_id INNER JOIN function ON function.id = trial.function_id INNER JOIN file ON file.id = function.file_id WHERE inspect.trial_id = " + trialId, (err, row) => {
			callbackfn(row);
		});
	}

	public execSelectQuery(query: string, callbackfn: (row: any) => void) {
		this.db.each(query, (err, row) => {
			if (err) {
				callbackfn(err);
			}
			else {
				callbackfn(row);
			}
		});
	}

	public startTrial(trialId: number, file: string, line: number, endLine: number, funName: string, time: number, calledFrom: string): void {
		this.db.serialize(() => {
			this.db.run("INSERT OR IGNORE INTO file (path, source, commit_hash) VALUES ($path, $source, $commit)", {
				$path: file,
				$source: "",
				$commit: ""
			}, this.insertCb);
			this.db.run("INSERT OR IGNORE INTO function (name, line_start, line_end, file_id) VALUES ($name, $lineStart, $lineEnd, (SELECT id FROM file WHERE path = $path LIMIT 1))", {
				$name: funName,
				$lineStart: line,
				$lineEnd: endLine,
				$path: file
			}, this.insertCb);
			this.db.run("INSERT INTO trial (id, time, return_time, return_line, function_id) VALUES ($id, $time, 0, 0, (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1))", {
				$id: trialId,
				$time: time,
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
	}

	public addStacktrace(trialId: number, file: string, funName: string, stacktrace: string, sum: number) {
		this.db.serialize(() => {
			this.db.run("INSERT OR IGNORE INTO stacktrace (stacktrace, sum) VALUES ($stacktrace, $sum)", {
				$stacktrace: stacktrace,
				$sum: sum,
			}, this.insertCb);
			this.db.run("UPDATE trial SET stacktrace = $sum WHERE id = $trialId AND function_id = (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1)", {
				$trialId: trialId,
				$sum: sum,
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
	}

	public addLineInspect(trialId: number, file: string, line: number, key: string, value?: string) {
		let varName = key;
		let varValue = "";
		let msg = "";
		if (value) {
			varValue = value;
		} else {
			msg = varName;
			varName = "";
		}

		this.db.serialize(() => {
			this.db.run("INSERT INTO inspect (trial_id, function_id, line, var_name, var_value, msg) VALUES ($trialId, (SELECT id FROM function WHERE $line >= line_start AND $line <= line_end AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1), $line, $varName, $varValue, $msg)", {
				$trialId: trialId,
				$line: line,
				$path: file,
				$varName: varName,
				$varValue: varValue,
				$msg: msg
			}, this.insertCb);
		});
	}

	public functionReturn(trialId: number, file: string, funName: string, time: number, line?: number, key?: string, value?: string) {
		if (!line) {
			line = 0;
		}
		this.db.serialize(() => {
			this.db.run("UPDATE trial SET return_time = $time, return_line = $line WHERE id = $trialId AND function_id = (SELECT id FROM function WHERE name = $funName AND file_id = (SELECT id FROM file WHERE path = $path LIMIT 1) ORDER BY id DESC LIMIT 1)", {
				$time: time,
				$line: line,
				$trialId: trialId,
				$funName: funName,
				$path: file
			}, this.insertCb);
		});
		if (key) {
			this.addLineInspect(trialId, file, line, key, value);
		}
	}

	private insertCb(err: Error | null) {
		if (err) {
			this.error(err.message);
		}
	}

	private error(err: string) {
		console.log("Database error: " + err);
	}
}
