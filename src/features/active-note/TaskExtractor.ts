import type { App, TFile } from "obsidian";

export interface ExtractedTask {
	text: string;
	status: string;
	line: number;
}

export class TaskExtractor {
	constructor(private app: App) {}

	async extractTasks(
		file: TFile | null,
		filterStatuses: string[],
	): Promise<ExtractedTask[]> {
		if (!file) return [];

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.listItems) return [];

		// Read the file content to get the actual text for tasks
		const content = await this.app.vault.cachedRead(file);
		const lines = content.split("\n");

		const tasks: ExtractedTask[] = [];

		for (const item of cache.listItems) {
			if (item.task !== undefined && item.task !== null) {
				if (filterStatuses.length === 0 || filterStatuses.includes(item.task)) {
					const line = item.position.start.line;
					const text = (lines[line] || "").trimStart();
					tasks.push({
						text: text,
						status: item.task,
						line: line,
					});
				}
			}
		}

		return tasks;
	}
}
