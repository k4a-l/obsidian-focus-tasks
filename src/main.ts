import { debounce, Plugin, type TFile, type WorkspaceLeaf } from "obsidian";
import { CurrentTaskView, VIEW_TYPE_CURRENT_TASK } from "./CurrentTaskView";
import { type CurrentTaskPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { TaskExtractor } from "./TaskExtractor";

export default class CurrentTaskPlugin extends Plugin {
	settings: CurrentTaskPluginSettings;
	statusBarItemEl: HTMLElement;
	taskExtractor: TaskExtractor;
	lastActiveFile: TFile | null = null;

	// Debounced extraction to avoid freezing the editor
	debouncedExtract: () => void;

	async onload() {
		await this.loadSettings();

		this.taskExtractor = new TaskExtractor(this.app);

		this.debouncedExtract = debounce(
			this.extractAndDisplayTasks.bind(this),
			300,
			true,
		);

		this.registerView(
			VIEW_TYPE_CURRENT_TASK,
			(leaf: WorkspaceLeaf) => new CurrentTaskView(leaf, this),
		);

		// Status bar item
		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.addClass("mod-clickable");
		this.statusBarItemEl.onClickEvent(async () => {
			await this.activateView();
		});

		this.updateStatusBar(0);

		// Event listeners
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.extractAndDisplayTasks();
			}),
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", () => {
				this.debouncedExtract();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.extractAndDisplayTasks();
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CURRENT_TASK);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null | undefined = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CURRENT_TASK);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_CURRENT_TASK, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async extractAndDisplayTasks() {
		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile && currentFile.extension === "md") {
			this.lastActiveFile = currentFile;
		}

		if (!this.lastActiveFile) {
			this.updateStatusBar(0);
			return;
		}

		const tasks = await this.taskExtractor.extractTasks(
			this.lastActiveFile,
			this.settings.filterStatuses,
		);

		this.updateStatusBar(tasks.length);

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CURRENT_TASK);
		if (leaves.length > 0) {
			for (const leaf of leaves) {
				const view = leaf.view;
				if (view instanceof CurrentTaskView) {
					view.updateTasks(tasks);
				}
			}
		}
	}

	updateStatusBar(count: number) {
		this.statusBarItemEl.setText(`Tasks: ${count}`);
	}
}
