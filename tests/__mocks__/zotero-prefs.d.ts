export declare function createMockPrefs(): {
    get: import("vitest").Mock<[key: string, defaultValue?: any], any>;
    set: import("vitest").Mock<[key: string, value: any], void>;
    clear: import("vitest").Mock<[key: string], void>;
};
export declare function setPref(key: string, value: any): void;
export declare function clearPrefs(): void;
