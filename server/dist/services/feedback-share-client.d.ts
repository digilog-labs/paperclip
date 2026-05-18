import type { FeedbackTraceBundle } from "@paperclipai/shared";
import type { Config } from "../config.js";
export interface FeedbackTraceShareClient {
    uploadTraceBundle(bundle: FeedbackTraceBundle): Promise<{
        objectKey: string;
    }>;
}
export declare function createFeedbackTraceShareClientFromConfig(config: Pick<Config, "feedbackExportBackendUrl" | "feedbackExportBackendToken">): FeedbackTraceShareClient;
//# sourceMappingURL=feedback-share-client.d.ts.map