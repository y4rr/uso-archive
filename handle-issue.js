const uso = require("./lib/uso");
const utils = require("./lib/utils");
const logger = require("./lib/logger");
const fs = require("fs").promises;
const path = require("path");
const performance = require("perf_hooks").performance;

async function main() {
	const issueData = JSON.parse(process.env.ISSUE_DATA);
	switch (process.argv[2]) {
	case "uso":
		updateUso(issueData);
		break;
	case "usercss":
		updateUsercss(issueData);
		break;
	}
}

async function updateUso(issueData) {
	let index = JSON.parse(await fs.readFile(path.resolve(__dirname, "data", "index.json"), { encoding: "utf8" }));
	let changes = [];
	const styleIds = issueData.body.split(/, ?/).slice(0, 50);
	
	for (const styleId of styleIds) {
		const id = parseInt(styleId);
		if (Number.isNaN(id) || !id) continue;
		logger.info(["USO Update Request"], `Style ${id} downloading...`);
		const p = performance.now();
		const data = await utils.retry(async () => await uso.saveStyle(await uso.getStyle(id, true, true)), 50);
		logger.info(["USO Update Request"], `Style ${data.style.info.name} (${id}) downloaded, took ${Math.ceil((performance.now() - p) / 1000)}s`);
		changes.push({ type: index[id] === undefined ? "New" : "Update", updatedAt: data.style.info.updatedAt, name: data.style.info.name, id });
		index[id] = data.indexStyle;
	}

	logger.info(["USO Update Request"], "Saving indexes...");
	await utils.saveIndexes(index);
	console.log("::set-output name=changes::" + ["data: uso update request", ...changes.map(e => `[${e.type === "new" ? "New" : "Update"}, ${e.updatedAt}] ${e.name} (${e.id})`)].join("%0A").replace(/"/g, "\\\""));
}

async function updateUsercss(issueData) {
	console.log(issueData);
}

main();
