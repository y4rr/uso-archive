const fetch = require("node-fetch");
const fsSync = require("fs");
const fs = require("fs").promises;
const path = require("path");
const logger = require("./logger");

async function sleep(time) {
	return new Promise((resolve) => {
		setTimeout(resolve, time);
	});
}

async function downloadFile(url, path) {
	const res = await fetch(url);
	const fileStream = fsSync.createWriteStream(path);
	await new Promise((resolve, reject) => {
		res.body.pipe(fileStream);
		res.body.on("error", reject);
		fileStream.on("finish", resolve);
	});
}

function toMarkdown(style) {
	return `# ${style.info.name} (${style.id})${style.obsolete ? `
### Obsolete
- Obsoleting style id: ${style.obsolete.obsoletedBy.id}
- Obsoleting style name: ${style.obsolete.obsoletedBy.name}
- Obsoletion message: ${style.obsolete.message}
` : ""}${style.deleteReasonId? `### Deleted
- Delete reason id: ${style.deleteReasonId}
` : ""}

### Information
- Rating: ${style.stats.rating || "unknown"}
- Applies to: ${style.info.category}
- Updated at: ${style.info.updatedAt ? style.info.updatedAt : "unknown"}
- Created at: ${style.info.createdAt ? style.info.createdAt : "unknown"}
- Weekly installs: ${style.stats.installs.weekly}
- Total installs: ${style.stats.installs.total}
- Author: ${style.info.author ? style.info.author.name || "unknown" : "unknown"} (${style.user ? style.info.author.id || "unknown" : "unknown"})
- License: ${style.info.license || "unknown"}

${style.info.description ? `### Description
${style.info.description}
` : ""}
${style.info.additionalInfo ? `### Update notes
${style.info.additionalInfo}
` : ""}
${style.info.additionalInfo ? `### Files
- [UserCSS](../usercss/${style.id}.user.css)
- [JSON](../styles/${style.id}.json)
` : ""}
${style.screenshots ? `### Screenshots
${style.screenshots.main ? screenshotToMarkdown(style.screenshots.main) : ""}${style.screenshots.additional && style.screenshots.additional.length > 0 ? `
${style.screenshots.additional.map(s => screenshotToMarkdown(s)).join("\n")}` : ""}` : ""}`;
}

function screenshotToMarkdown(screenshot) {
	if (screenshot.archived) {
		return markdownImg(`../screenshots/${screenshot.name}`);
	}
	else {
		return markdownImg(`https://userstyles.org/${screenshot.name.includes("-") ? "auto_" : ""}style_screenshots/${screenshot.name}`);
	}
}

function markdownImg(url) {
	return `![${url}](${url})`;
}

function toMarkdownIndexEntry(style) {
	return `# ${style.info.name} (${style.id})
- Updated at: ${style.info.updatedAt ? new Date(style.info.updatedAt).toLocaleString() : "unknown"}
- Category: ${style.info.category}
- Weekly installs: ${style.stats.installs.weekly}

${style.info.description ? `### Description
${style.info.description}
` : ""}`;
}

function toUsercss(style) {
	const settings = toUsercssSettings(style.style.settings);
	return `/* ==UserStyle==
@name           ${style.info.name}
@namespace      ${style.user ? style.user.homepage || "USO Archive" : "USO Archive"}
@author         ${style.info.author ? style.info.author.name || "unknown" : "unknown"}
@description    \`${style.info.description ? style.info.description.replace(/[\r\n]/gm, "") : "none"}\`
@version        ${versionFromTimestamp(style.info.updatedAt)}
@license        ${style.info.license}
@preprocessor   uso${settings ? "\n" + settings : ""}
==/UserStyle== */
${style.style.css}`;
}

function versionFromTimestamp(timestamp) {
	const date = new Date(timestamp);
	return `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}.${date.getHours()}.${date.getMinutes()}`;
}

function toUsercssDropdownOptions(options) {
	let result = "";
	for (const option of options) {
		if (option.default) result = `${option.key} "${option.label}${option.default ? "*" : ""}" <<<EOT ${option.value} EOT;\r\n` + result;
		else result += `${option.key} "${option.label.replace(/"/g, "\\\"")}${option.default ? "*" : ""}" <<<EOT ${option.value} EOT;\r\n`;
	}
	return result;
}

function toUsercssSetting(setting) {
	switch (setting.type) {
	case "dropdown":
		return `@advanced dropdown ${setting.key} "${setting.label.replace(/"/g, "\\\"")}" {
	${toUsercssDropdownOptions(setting.options)}
}`;
	case "color":
		return `@advanced color ${setting.key} "${setting.label.replace(/"/g, "\\\"")}" ${setting.options[0].value}`;
	case "image":
		return `@advanced dropdown ${setting.key} "${setting.label.replace(/"/g, "\\\"")}" {
${toUsercssDropdownOptions(setting.options)}
	${setting.key}-custom-dropdown "Custom" <<<EOT /*[[${setting.key}-custom]]*/ EOT;
}
@advanced text ${setting.key}-custom "${setting.label.replace(/"/g, "\\\"")} (Custom)" "https://example.com/image.png"`;
	case "text":
		return `@advanced text ${setting.key} "${setting.label.replace(/"/g, "\\\"")}" "${setting.options[0].value}"`;
	}
}

function toUsercssSettings(settings) {
	if (!settings) return "";
	let result = "";
	for (const setting of settings) {
		result += `${toUsercssSetting(setting).replace(/\*\//g, "*\\/")}\r\n`;
	}
	return result;
}

function toIndexEntry(style) {
	return {
		id: style.id,
		info: {
			name: style.info.name,
			description: style.info.description,
			format: style.info.format,
			category: style.info.category,
			updatedAt: style.info.updatedAt,
			author: style.info.author
				? {
					id: style.info.author.id,
					name: style.info.author.name,
				}
				: undefined,
		},
		stats: style.stats,
		screenshots: style.screenshots ? {
			main: style.screenshots.main || undefined,
		} : undefined,
	};
}

async function retry(func, maxErrors, dontThrow, delay) {
	let errors = 0;
	for(;;) {
		try {
			return await func();
		}
		catch (e) {
			if (errors < maxErrors) {
				logger.error(["Utils"], e);
				errors++;
				if (delay) {
					await sleep(delay);
				}
			}
			else {
				if (!dontThrow)
					throw e;
				else return;
			}
		}
	}
}

async function waitUntilTrue(func, checkInterval) {
	while (!func()) {
		await sleep(checkInterval || 50);
	}
}

async function saveIndexes(index) {
	let arrayIndex = [];
	for (const i in index) {
		arrayIndex.push(index[i]);
	}
	arrayIndex.sort((a, b) => b.stats.installs.weekly - a.stats.installs.weekly);

	let searchIndex = [];
	for (const el of arrayIndex) {
		if (el.info.format === "uso-android") continue;
		let data = {f: el.info.format, i: el.id, n: el.info.name, /*d: el.info.description, */c: el.info.category, u: Math.floor(+new Date(el.info.updatedAt) / 1000), t: el.stats.installs.total, w: el.stats.installs.weekly, r: el.stats.rating};
		if (el.info.author) {
			data.ai = el.info.author.id;
			data.an = el.info.author.name;
		}
		if (el.screenshots && el.screenshots.main) {
			data.sn = el.screenshots.main.name;
			data.sa = el.screenshots.main.archived;
		}
		searchIndex.push(data);
	}

	await fs.writeFile(path.resolve(__dirname, "..", "data", "index.json"), JSON.stringify(index), { encoding: "utf8" });
	await fs.writeFile(path.resolve(__dirname, "..", "data", "search-index.json"), JSON.stringify(searchIndex), { encoding: "utf8" });
}

module.exports = {
	sleep,
	retry,
	waitUntilTrue,
	downloadFile,
	saveIndexes,
	toIndexEntry,
	toUsercss,
	toMarkdown,
	toMarkdownIndexEntry
};
