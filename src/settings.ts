export interface CurrentTaskPluginSettings {
	filterStatuses: string[];
}

export const DEFAULT_SETTINGS: CurrentTaskPluginSettings = {
	filterStatuses: [" "], // Default: incomplete tasks
};
