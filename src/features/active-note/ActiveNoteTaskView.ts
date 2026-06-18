import {
	ItemView,
	MarkdownRenderer,
	MarkdownView,
	type WorkspaceLeaf,
} from "obsidian";
import type PluginClass from "../../main";
import type { ExtractedTask } from "./TaskExtractor";

export const VIEW_TYPE_ACTIVE_NOTE_TASK = "active-note-task-view";

export class ActiveNoteTaskView extends ItemView {
	plugin: PluginClass;
	tasks: ExtractedTask[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: PluginClass) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_ACTIVE_NOTE_TASK;
	}

	getDisplayText(): string {
		return "Active Note Tasks";
	}

	getIcon(): string {
		return "check-square";
	}

	async onOpen() {
		await this.plugin.extractAndDisplayTasks();
	}

	async onClose() {
		// Cleanup if needed
	}

	updateTasks(tasks: ExtractedTask[]) {
		this.tasks = tasks;
		this.render();
	}

	async render() {
		const container = this.containerEl.children[1] as HTMLElement;
		if (!container) return;

		const existingDetails = container.querySelector("details");
		const isDetailsOpen = existingDetails ? existingDetails.open : false;

		container.empty();

		// --- Header (Filters) ---
		const headerEl = container.createDiv({
			cls: "active-note-task-header",
			attr: {
				style:
					"padding: 4px 5px; border-bottom: 1px solid var(--background-modifier-border);",
			},
		});

		const detailsEl = headerEl.createEl("details");
		detailsEl.open = isDetailsOpen;
		detailsEl.createEl("summary", {
			text: "Filter",
			attr: {
				style:
					"cursor: pointer; user-select: none; font-size: 0.8em; color: var(--text-muted);",
			},
		});

		const statuses = [
			{ value: " ", label: "Incomplete ( )" },
			{ value: "x", label: "Completed (x)" },
			{ value: "-", label: "Canceled (-)" },
			{ value: "/", label: "In Progress (/)" },
			{ value: ">", label: "Deferred (>)" },
		];

		const filterContainer = detailsEl.createDiv({
			attr: {
				style: "display: flex; flex-direction: column; gap: 4px;",
			},
		});

		statuses.forEach((status) => {
			const label = filterContainer.createEl("label", {
				attr: {
					style:
						"display: flex; align-items: center; gap: 4px; font-size: 0.8em; cursor: pointer;",
				},
			});
			const checkbox = label.createEl("input", { type: "checkbox" });
			checkbox.checked = this.plugin.settings.filterStatuses.includes(
				status.value,
			);
			checkbox.addEventListener("change", async () => {
				if (checkbox.checked) {
					if (!this.plugin.settings.filterStatuses.includes(status.value)) {
						this.plugin.settings.filterStatuses.push(status.value);
					}
				} else {
					this.plugin.settings.filterStatuses =
						this.plugin.settings.filterStatuses.filter(
							(s) => s !== status.value,
						);
				}
				await this.plugin.saveSettings();
				await this.plugin.extractAndDisplayTasks();
			});
			label.appendText(status.label);
		});

		// --- Content (Tasks) ---
		const contentEl = container.createDiv({
			cls: "active-note-task-content",
			attr: { style: "padding: 10px; overflow-y: auto;" },
		});

		if (this.tasks.length === 0) {
			contentEl.createEl("p", {
				text: "No tasks found in current note.",
				attr: {
					style:
						"color: var(--text-muted); font-style: italic; text-align: center;",
				},
			});
			return;
		}

		for (const task of this.tasks) {
			const taskEl = contentEl.createDiv({
				cls: "active-note-task-item",
				attr: {
					style:
						"cursor: pointer; padding: 2px 4px; border-radius: 4px; transition: background-color 0.2s;",
				},
			});

			// Hover effect
			taskEl.addEventListener("mouseenter", () => {
				taskEl.style.backgroundColor = "var(--background-modifier-hover)";
			});
			taskEl.addEventListener("mouseleave", () => {
				taskEl.style.backgroundColor = "transparent";
			});

			// Render markdown
			const mdContainer = taskEl.createDiv();
			const sourcePath = this.plugin.app.workspace.getActiveFile()?.path || "";
			await MarkdownRenderer.renderMarkdown(
				task.text,
				mdContainer,
				sourcePath,
				this.plugin,
			);

			// Remove extra margins from rendered markdown blocks
			const renderedBlocks = mdContainer.querySelectorAll("p, ul, li");
			renderedBlocks.forEach((el) => {
				(el as HTMLElement).style.margin = "0";
				(el as HTMLElement).style.paddingBlock = "0";
			});

			// Fix list indentation
			const uls = mdContainer.querySelectorAll("ul");
			uls.forEach((ul) => {
				(ul as HTMLElement).style.paddingInlineStart = "20px";
			});

			// Disable checkbox interactions
			const checkboxes = mdContainer.querySelectorAll("input[type='checkbox']");
			checkboxes.forEach((cb) => {
				(cb as HTMLElement).style.pointerEvents = "none";
			});

			// Prevent default link behaviors inside rendered markdown
			const links = mdContainer.querySelectorAll(
				"a.internal-link, a.external-link",
			);
			links.forEach((link) => {
				link.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.jumpToLine(task.line);
				});
			});

			// Handle click to jump
			taskEl.addEventListener("click", () => {
				this.jumpToLine(task.line);
			});
		}
	}

	jumpToLine(line: number) {
		const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
		const activeFile = this.plugin.app.workspace.getActiveFile();

		for (const leaf of leaves) {
			const view = leaf.view;
			if (
				view instanceof MarkdownView &&
				view.file &&
				activeFile &&
				view.file.path === activeFile.path
			) {
				if (view.editor) {
					const lineLength = view.editor.getLine(line).length;
					view.editor.setSelection({ line, ch: 0 }, { line, ch: lineLength });
					view.editor.scrollIntoView(
						{ from: { line, ch: 0 }, to: { line, ch: lineLength } },
						true,
					);
					this.plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
					break;
				}
			}
		}
	}
}
