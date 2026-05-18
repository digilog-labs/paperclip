import type { SecretProviderModule } from "./types.js";
interface AwsSecretsManagerConfig {
    region: string;
    endpoint: string;
    deploymentId: string;
    prefix: string;
    kmsKeyId: string | null;
    environmentTag: string;
    providerOwnerTag: string;
    deleteRecoveryWindowDays: number;
}
interface AwsSecretsManagerTag {
    Key: string;
    Value: string;
}
interface AwsSecretsManagerListSecretEntry {
    ARN?: string;
    Name?: string;
    Description?: string;
    KmsKeyId?: string;
    CreatedDate?: string | number | Date;
    LastAccessedDate?: string | number | Date;
    LastChangedDate?: string | number | Date;
    DeletedDate?: string | number | Date;
    Tags?: AwsSecretsManagerTag[];
}
interface AwsSecretsManagerGateway {
    createSecret(input: {
        Name: string;
        SecretString: string;
        KmsKeyId?: string;
        Description?: string;
        Tags: AwsSecretsManagerTag[];
    }): Promise<{
        ARN?: string;
        Name?: string;
        VersionId?: string;
    }>;
    putSecretValue(input: {
        SecretId: string;
        SecretString: string;
        VersionStages?: string[];
    }): Promise<{
        ARN?: string;
        Name?: string;
        VersionId?: string;
    }>;
    getSecretValue(input: {
        SecretId: string;
        VersionId?: string;
        VersionStage?: string;
    }): Promise<{
        SecretString?: string;
        ARN?: string;
        Name?: string;
        VersionId?: string;
    }>;
    deleteSecret(input: {
        SecretId: string;
        RecoveryWindowInDays: number;
    }): Promise<unknown>;
    updateSecretVersionStage?(input: {
        SecretId: string;
        VersionStage: string;
        RemoveFromVersionId?: string;
        MoveToVersionId?: string;
    }): Promise<unknown>;
    listSecrets?(input: {
        MaxResults?: number;
        NextToken?: string;
        Filters?: Array<{
            Key: "all" | "name" | "description" | "tag-key" | "tag-value" | "primary-region" | "owning-service";
            Values: string[];
        }>;
        IncludePlannedDeletion?: boolean;
    }): Promise<{
        SecretList?: AwsSecretsManagerListSecretEntry[];
        NextToken?: string;
    }>;
}
export declare function createAwsSecretsManagerProvider(options?: {
    config?: AwsSecretsManagerConfig;
    gateway?: AwsSecretsManagerGateway;
}): SecretProviderModule;
export declare const awsSecretsManagerProvider: SecretProviderModule;
export {};
//# sourceMappingURL=aws-secrets-manager-provider.d.ts.map