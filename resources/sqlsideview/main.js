/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-undef */
//@ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();
    let rows = [];

    document.querySelector('.exec-sql-query')?.addEventListener('click', () => {
        const inputEl = document.querySelector('input');
        if (inputEl) {
            vscode.postMessage({ type: 'execSqlQuery', value: inputEl.value });
        }
    });

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'addRow':
            {
                addSqlRow(message.data);
                break;
            }
            case 'clearSqlResults':
            {
                rows = [];
                updateSQLTable(rows);
                break;
            }
            case 'showQuery':
            {
                const inputEl = document.querySelector('input');
                if (inputEl)
                    inputEl.value = message.data;
                break;
            }
        }
    });

    function updateSQLTable(rows)
    {
        const tabDiv = document.querySelector('.res-table');
        const tabElem = document.createElement('table');
        if (tabDiv) {
            tabDiv.textContent = '';
        }
        if (rows.length === 0) {
            return;
        }
        const trElem = document.createElement('tr');
        for (const [key, val] of Object.entries(rows[0])) {
            const thElem = document.createElement('th');
            thElem.textContent = key;
            trElem.appendChild(thElem);
        }
        tabElem.appendChild(trElem);

        for (const row of rows) {
            const trElem = document.createElement('tr');
            for (const [key, val] of Object.entries(row)) {
                const tdElem = document.createElement('td');
                if (key === "time") {
                    const aElem = document.createElement('a');
                    aElem.setAttribute('href', '#');
                    aElem.textContent = (val / 1000000000.0).toString();
                    tdElem.addEventListener('click', () => {
                        onSelectTrial(val);
                    });
                    tdElem.appendChild(aElem);
                } else {
                    tdElem.textContent = val;
                }
                trElem.appendChild(tdElem);
            }
            tabElem.appendChild(trElem);
        }
        tabDiv?.appendChild(tabElem);
    }

    function onSelectTrial(trial) {
        vscode.postMessage({ type: 'trialSelected', value: trial });
    }

    function addSqlRow(row) {
        rows.push(row);
        updateSQLTable(rows);
    }
}());
