export interface MockItemConfig {
    id?: number;
    itemTypeID?: number;
    title?: string;
    DOI?: string;
    ISBN?: string;
    url?: string;
    extra?: string;
    publicationTitle?: string;
    date?: string;
    creators?: Array<{
        firstName?: string;
        lastName?: string;
    }>;
}
export declare function createMockItem(config?: MockItemConfig): any;
export interface MockAttachmentConfig {
    id?: number;
    linkMode?: number;
    filePath?: string | null;
    fileExists?: boolean;
}
export declare function resetMockCounters(): void;
export declare function createMockAttachment(config?: MockAttachmentConfig): any;
