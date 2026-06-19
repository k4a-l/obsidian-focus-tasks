import moment from "moment";
import { type App, type Editor, MarkdownView, type TFile } from "obsidian";
import {
	getAllDailyNotes,
	getDailyNote,
	getDailyNoteSettings,
} from "obsidian-daily-notes-interface";

export interface ActiveTrackingTask {
	taskText: string;
	startTime: string; // "HH:mm"
	endTime?: string; // "HH:mm"
	lineNumber: number;
	isRangeActive: boolean;
	isCompleted: boolean;
	isUpcoming?: boolean;
}

export function getDailyNoteConfig(): {
	folder?: string;
	format?: string;
} | null {
	try {
		const settings = getDailyNoteSettings();
		return {
			folder: settings.folder,
			format: settings.format,
		};
	} catch (e) {
		console.error("Failed to get daily note settings", e);
		return null;
	}
}

export function getDailyNoteFile(): TFile | null {
	try {
		const dailyNotes = getAllDailyNotes();
		const note = getDailyNote(moment(), dailyNotes);
		return note || null;
	} catch (e) {
		console.error("Failed to get daily note file", e);
		return null;
	}
}

export async function getActiveTrackingTasks(
	app: App,
	warningThreshold: number,
	upcomingThreshold: number,
): Promise<ActiveTrackingTask[]> {
	const file = getDailyNoteFile();
	if (!file) return [];

	const content = await app.vault.cachedRead(file);
	const lines = content.split("\n");
	const now = moment();
	const todayStr = now.format("YYYY-MM-DD");

	// Pattern definitions for parsing tasks in daily note
	// 1. Range format: - [ ] 14:00 - 15:00 Task description (checkbox optional)
	const rangeRegex =
		/^\s*-\s*(?:\[\s*([xX\s])\s*\])?\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s+(.*)$/;
	// 2. Start only format: - [ ] 14:00 Task description (checkbox optional, avoiding range pattern matching)
	const startOnlyRegex =
		/^\s*-\s*(?:\[\s*([xX\s])\s*\])?\s*(\d{2}:\d{2})(?!\s*-\s*\d{2}:\d{2})\s+(.*)$/;

	const activeTasks: ActiveTrackingTask[] = [];
	let isInCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;

		// Skip code blocks
		if (line.trim().startsWith("```")) {
			isInCodeBlock = !isInCodeBlock;
			continue;
		}
		if (isInCodeBlock) continue;

		const rangeMatch = line.match(rangeRegex);
		const startMatch = line.match(startOnlyRegex);

		if (
			rangeMatch &&
			rangeMatch[2] !== undefined &&
			rangeMatch[3] !== undefined &&
			rangeMatch[4] !== undefined
		) {
			const checkbox = rangeMatch[1] ? rangeMatch[1].trim() : "";
			const isCompleted = checkbox === "x" || checkbox === "X";
			if (isCompleted) continue;

			const startTimeStr = rangeMatch[2];
			const endTimeStr = rangeMatch[3];
			const taskText = rangeMatch[4].trim();

			const start = moment(`${todayStr} ${startTimeStr}`, "YYYY-MM-DD HH:mm");
			const end = moment(`${todayStr} ${endTimeStr}`, "YYYY-MM-DD HH:mm");

			const isStarted = now.isSameOrAfter(start);
			const isWithinRange = now.isBetween(start, end, null, "[]");
			const isUpcoming =
				!isStarted &&
				now.isSameOrAfter(start.clone().subtract(upcomingThreshold, "minutes"));

			if (isStarted) {
				activeTasks.push({
					taskText,
					startTime: startTimeStr,
					endTime: endTimeStr,
					lineNumber: i,
					isRangeActive: isWithinRange,
					isCompleted: false,
				});
			} else if (isUpcoming) {
				activeTasks.push({
					taskText,
					startTime: startTimeStr,
					endTime: endTimeStr,
					lineNumber: i,
					isRangeActive: false,
					isCompleted: false,
					isUpcoming: true,
				});
			}
		} else if (
			startMatch &&
			startMatch[2] !== undefined &&
			startMatch[3] !== undefined
		) {
			const checkbox = startMatch[1] ? startMatch[1].trim() : "";
			const isCompleted = checkbox === "x" || checkbox === "X";
			if (isCompleted) continue;

			const startTimeStr = startMatch[2];
			const taskText = startMatch[3].trim();

			const start = moment(`${todayStr} ${startTimeStr}`, "YYYY-MM-DD HH:mm");
			const isStarted = now.isSameOrAfter(start);

			const isUpcoming =
				!isStarted &&
				now.isSameOrAfter(start.clone().subtract(upcomingThreshold, "minutes"));

			if (isStarted) {
				const diffMinutes = now.diff(start, "minutes");
				const isWithinThreshold = diffMinutes < warningThreshold;

				activeTasks.push({
					taskText,
					startTime: startTimeStr,
					lineNumber: i,
					isRangeActive: isWithinThreshold,
					isCompleted: false,
				});
			} else if (isUpcoming) {
				activeTasks.push({
					taskText,
					startTime: startTimeStr,
					lineNumber: i,
					isRangeActive: false,
					isCompleted: false,
					isUpcoming: true,
				});
			}
		}
	}

	activeTasks.sort((a, b) => a.startTime.localeCompare(b.startTime));
	return activeTasks;
}

export function createBanner(
	app: App,
	view: MarkdownView,
	warningThreshold: number,
	upcomingThreshold: number,
): HTMLElement {
	const banner = view.contentEl.createDiv({
		cls: "k4a-tasks-timer-banner",
	});

	// タスクが空のときにバナー全体をクリックするとデイリーノートを開く
	banner.addEventListener("click", async () => {
		const activeTasks = await getActiveTrackingTasks(
			app,
			warningThreshold,
			upcomingThreshold,
		);
		if (activeTasks.length === 0) {
			const file = getDailyNoteFile();
			if (file) {
				await jumpToDailyNoteLine(app, file);
			}
		}
	});

	view.contentEl.prepend(banner);
	return banner;
}

export function isTasksEqual(
	a: ActiveTrackingTask[],
	b: ActiveTrackingTask[],
): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const ta = a[i];
		const tb = b[i];
		if (!ta || !tb) return false;
		if (
			ta.taskText !== tb.taskText ||
			ta.startTime !== tb.startTime ||
			ta.endTime !== tb.endTime ||
			ta.lineNumber !== tb.lineNumber ||
			ta.isRangeActive !== tb.isRangeActive ||
			ta.isCompleted !== tb.isCompleted ||
			ta.isUpcoming !== tb.isUpcoming
		) {
			return false;
		}
	}
	return true;
}

export function calculateElapsedTime(
	startTimeStr: string,
	endTimeStr?: string,
	isCompleted: boolean = false,
): string {
	const now = moment();
	const start = moment(startTimeStr, "HH:mm");

	if (start.isAfter(now)) {
		const diffMs = start.diff(now);
		const diffDuration = moment.duration(diffMs);
		const hours = Math.floor(diffDuration.asHours());
		const minutes = diffDuration.minutes();
		if (hours > 0) {
			return `-${hours}h ${minutes}m`;
		}
		return `-${minutes}m`;
	}

	let diffMs = 0;
	if (isCompleted && endTimeStr) {
		const end = moment(endTimeStr, "HH:mm");
		diffMs = end.diff(start);
	} else {
		diffMs = now.diff(start);
	}

	const diffDuration = moment.duration(diffMs);
	const hours = Math.floor(diffDuration.asHours());
	const minutes = diffDuration.minutes();

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

export async function jumpToDailyNoteLine(
	app: App,
	file: TFile,
	line?: number,
) {
	const leaves = app.workspace.getLeavesOfType("markdown");
	let targetLeaf = null;

	for (const leaf of leaves) {
		const view = leaf.view;
		if (
			view instanceof MarkdownView &&
			view.file &&
			view.file.path === file.path
		) {
			targetLeaf = leaf;
			break;
		}
	}

	if (targetLeaf) {
		app.workspace.setActiveLeaf(targetLeaf, { focus: true });
		if (line !== undefined) {
			const view = targetLeaf.view;
			if (view instanceof MarkdownView && view.editor) {
				const lineLength = view.editor.getLine(line).length;
				view.editor.setSelection({ line, ch: 0 }, { line, ch: lineLength });
				view.editor.scrollIntoView(
					{ from: { line, ch: 0 }, to: { line, ch: lineLength } },
					true,
				);
			}
		}
	} else {
		const leaf = app.workspace.getLeaf("tab");
		await leaf.openFile(file);
		app.workspace.setActiveLeaf(leaf, { focus: true });
		if (line !== undefined) {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.editor) {
				const lineLength = view.editor.getLine(line).length;
				view.editor.setSelection({ line, ch: 0 }, { line, ch: lineLength });
				view.editor.scrollIntoView(
					{ from: { line, ch: 0 }, to: { line, ch: lineLength } },
					true,
				);
			}
		}
	}
}

export function updateBannerContent(
	app: App,
	bannerEl: HTMLElement,
	activeTasks: ActiveTrackingTask[],
	lastActiveTasks: ActiveTrackingTask[] | null,
): ActiveTrackingTask[] {
	const isStructureSame =
		lastActiveTasks !== null && isTasksEqual(lastActiveTasks, activeTasks);

	if (!isStructureSame) {
		bannerEl.empty();

		if (activeTasks.length > 0) {
			bannerEl.className = "k4a-tasks-timer-banner is-active";

			for (let i = 0; i < activeTasks.length; i++) {
				const task = activeTasks[i];
				if (!task) continue;

				const isWarning =
					!task.isRangeActive && !task.isCompleted && !task.isUpcoming;
				const rowCls = task.isCompleted
					? "k4a-banner-row is-completed"
					: task.isUpcoming
						? "k4a-banner-row is-upcoming"
						: isWarning
							? "k4a-banner-row is-warning"
							: "k4a-banner-row";
				const row = bannerEl.createDiv({ cls: rowCls });
				row.addEventListener("click", async (e) => {
					e.stopPropagation(); // Prevent trigger bannerEl click
					const file = getDailyNoteFile();
					if (file) {
						await jumpToDailyNoteLine(app, file, task.lineNumber);
					}
				});

				const leftContainer = row.createDiv({ cls: "k4a-banner-left" });

				const iconEl = leftContainer.createSpan({ cls: "k4a-banner-icon" });
				iconEl.textContent = task.isCompleted
					? "✅"
					: task.isUpcoming
						? "🔔"
						: task.isRangeActive
							? "⏱️"
							: "⏳";

				const timerEl = leftContainer.createSpan({
					cls: "k4a-banner-timer",
				});
				const timerTextEl = timerEl.createSpan({
					cls: "k4a-banner-timer-text",
				});
				timerTextEl.setAttribute("data-task-index", String(i));

				const elapsedStr = calculateElapsedTime(
					task.startTime,
					task.endTime,
					task.isCompleted,
				);
				timerTextEl.textContent = elapsedStr;

				// 経過時間とタスク名の間の垂直区切り線
				leftContainer.createSpan({
					cls: "k4a-banner-divider",
				});

				const taskNameEl = leftContainer.createSpan({
					cls: "k4a-banner-task-name",
				});
				taskNameEl.textContent = task.taskText;

				const timeRangeStr = task.endTime
					? `(${task.startTime} - ${task.endTime})`
					: `(${task.startTime} - )`;
				const timeInfoEl = leftContainer.createSpan({
					cls: "k4a-banner-time-info",
				});
				timeInfoEl.textContent = timeRangeStr;
			}
		} else {
			bannerEl.className = "k4a-tasks-timer-banner is-empty";

			const leftContainer = bannerEl.createDiv({
				cls: "k4a-banner-warning-text",
			});
			leftContainer.textContent = "📅 取り組んでいるタスクはありません";
		}
		return activeTasks;
	} else {
		if (activeTasks.length > 0) {
			const timerEls = bannerEl.querySelectorAll(".k4a-banner-timer-text");
			timerEls.forEach((el) => {
				if (el instanceof HTMLElement) {
					const indexAttr = el.getAttribute("data-task-index");
					if (indexAttr && indexAttr !== "none") {
						const idx = parseInt(indexAttr, 10);
						const task = activeTasks[idx];
						if (task) {
							const elapsedStr = calculateElapsedTime(
								task.startTime,
								task.endTime,
								task.isCompleted,
							);
							if (el.textContent !== elapsedStr) {
								el.textContent = elapsedStr;
							}
						}
					}
				}
			});
		}
		return lastActiveTasks;
	}
}

export function toggleTaskTime(editor: Editor) {
	const cursor = editor.getCursor();
	const lineIndex = cursor.line;
	const lineText = editor.getLine(lineIndex);

	const currentTime = moment().format("HH:mm");

	// Pattern definitions for line parsing
	const rangeRegex =
		/^(\s*)-\s*(?:\[\s*.\s*\])?\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*(.*)$/;
	const startOnlyRegex = /^(\s*)-\s*(?:\[\s*.\s*\])?\s*(\d{2}:\d{2})\s*(.*)$/;
	const taskRegex = /^(\s*)-\s*\[\s*.\s*\]\s*(.*)$/;
	const bulletRegex = /^(\s*)-\s*(.*)$/;

	let newLineText = "";

	const rangeMatch = lineText.match(rangeRegex);
	const startMatch = lineText.match(startOnlyRegex);
	const taskMatch = lineText.match(taskRegex);
	const bulletMatch = lineText.match(bulletRegex);

	if (
		rangeMatch &&
		rangeMatch[1] !== undefined &&
		rangeMatch[2] !== undefined &&
		rangeMatch[4] !== undefined
	) {
		const indent = rangeMatch[1];
		const startTime = rangeMatch[2];
		const content = rangeMatch[4];
		newLineText = `${indent}- [x] ${startTime} - ${currentTime} ${content}`;
	} else if (
		startMatch &&
		startMatch[1] !== undefined &&
		startMatch[2] !== undefined &&
		startMatch[3] !== undefined
	) {
		const indent = startMatch[1];
		const startTime = startMatch[2];
		const content = startMatch[3];
		newLineText = `${indent}- [x] ${startTime} - ${currentTime} ${content}`;
	} else if (
		taskMatch &&
		taskMatch[1] !== undefined &&
		taskMatch[2] !== undefined
	) {
		const indent = taskMatch[1];
		const content = taskMatch[2];
		newLineText = `${indent}- [ ] ${currentTime} ${content}`;
	} else if (
		bulletMatch &&
		bulletMatch[1] !== undefined &&
		bulletMatch[2] !== undefined
	) {
		const indent = bulletMatch[1];
		const content = bulletMatch[2];
		newLineText = `${indent}- [ ] ${currentTime} ${content}`;
	} else {
		const content = lineText.trim();
		const indentMatch = lineText.match(/^(\s*)/);
		const indent = indentMatch?.[1] || "";
		if (content) {
			newLineText = `${indent}- [ ] ${currentTime} ${content}`;
		} else {
			newLineText = `${indent}- [ ] ${currentTime} `;
		}
	}

	editor.setLine(lineIndex, newLineText);
}
