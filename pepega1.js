const fs = require("fs").promises;
const path = require("path");
const logger = require("./lib/logger");

async function main() {
	const files = await fs.readdir(path.resolve(__dirname, "data", "styles"));
	for (const stylePath of files) {
		const json = JSON.parse(await fs.readFile(path.resolve(__dirname, "data", "styles", stylePath)));

		if (json.info.format === "uso-android") {
			await fs.unlink(path.resolve(__dirname, "data", "usercss", `${json.id}.user.css`));
			logger.info(["Delete"], `Deleted ${json.id}`);
		}
		
	}
}

main().catch(e => logger.error(["Delete"], e));

