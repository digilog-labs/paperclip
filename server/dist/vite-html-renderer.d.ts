type ViteWatcherEvent = "add" | "change" | "unlink";
export interface ViteWatcherHost {
    watcher?: {
        on?: (event: ViteWatcherEvent, listener: (file: string) => void) => unknown;
        off?: (event: ViteWatcherEvent, listener: (file: string) => void) => unknown;
    };
}
export interface CachedViteHtmlRenderer {
    render(_url: string): Promise<string>;
    dispose(): void;
}
export declare function createCachedViteHtmlRenderer(opts: {
    vite: ViteWatcherHost;
    uiRoot: string;
    brandHtml?: (html: string) => string;
}): CachedViteHtmlRenderer;
export {};
//# sourceMappingURL=vite-html-renderer.d.ts.map