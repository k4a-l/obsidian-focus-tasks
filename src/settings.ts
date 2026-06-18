export interface TasksPluginSettings {
	filterStatuses: string[];
}

export const DEFAULT_SETTINGS: TasksPluginSettings = {
	filterStatuses: [" "], // Default: incomplete tasks
};
